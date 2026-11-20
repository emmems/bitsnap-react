#!/usr/bin/env node
// Cart-open performance script (bitsnap-react cart plan, step 0 / part 1 section 2.1).
//
// Measures, with Playwright + CDP (Fast 3G network + 4x CPU, set after the page has
// loaded), how long the cart drawer takes to show its first item, and how long a
// quantity "+" takes to update the line price. No dependency is added to the repo:
// Playwright is found on the machine (see loadPlaywright) and the harness is
// bundled with the repo's own esbuild.
//
// Targets
//   harness (default)  a minimal page + a mock API (scripts/perf/mock-api.mjs) with the SDK
//                      from --sdk <dist dir> (default: ./dist). Same machine, repeatable.
//   live               a real shop page (--url) with its own SDK and backend. Only adds a
//                      product to the cart and opens the cart. Never checkout, never pay.
//
// Examples (from the repo root)
//   node scripts/perf/cart-open.mjs                                    # harness, this checkout's dist/
//   node scripts/perf/cart-open.mjs --sdk /tmp/x/package/dist          # another SDK build
//   node scripts/perf/cart-open.mjs --scenarios reopen,qty --runs 5    # a quick look
//   node scripts/perf/cart-open.mjs --target live --url https://shop.example/product \
//        --add-selector 'button.add' --scenarios reopen,qty,add-then-open
//   Gate (before 1.32.0): see scripts/perf/README.md ("Gate").
//
// Exit code: 1 when --check is given and a criterion of part 1 section 2 is missed (a criterion that
// was not measured, or has no baseline to compare with, counts as missed); 2 when the script cannot run.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRpcBodies, PRODUCT_IDS, startMockApi } from "./mock-api.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

// Written into --json; --check refuses a baseline from another version (the harness or a metric changed).
// 2: ESM harness with code splitting (dist chunks load over the throttled network), cold scenarios throttled
//    before the page loads, drawerMs measured from the add promise, qty/remove watch line + total + count.
// 3: "items visible" is the paint of every cart row (name + price text, visible, inside the new drawer), not the
//    first row's text, and a skeleton is looked for up to that point; A4 counts every POST /payment-methods from the
//    start of the setup to SETTLE_MS after the drawer is interactive, instead of the first one after the click.
const SCRIPT_VERSION = 3;
// How long after the drawer is interactive the requests of a run are still collected (a late request is a request).
const SETTLE_MS = 1500;

const ALL_SCENARIOS = [
  "cold-no-snapshot",
  "cold-immediate",
  "snapshot-reload",
  "snapshot-offline",
  "reopen",
  "add-then-open",
  "qty",
  "remove",
  "qty-burst",
];
const HARNESS_ONLY = ["remove"]; // needs a two-line cart that only the harness can seed
const COLD = ["cold-no-snapshot", "cold-immediate"];

const FAST_3G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: 180000,
  uploadThroughput: 84375,
  connectionType: "cellular3g",
};

const ITEM = '[data-bitsnap-checkout-slot="product"]';
const NAME = '[data-bitsnap-checkout-slot="productName"]';
const PRICE = '[data-bitsnap-checkout-slot="productPrice"]';
const QTY_BUTTON = '[data-bitsnap-checkout-slot="quantityButton"]';
const REMOVE_BUTTON = '[data-bitsnap-checkout-slot="removeButton"]';
const TOTAL = '[data-bitsnap-checkout-slot="totalValue"]';
// Skeleton markers inside the dialog: today's `ui/skeleton` (`data-slot`), the cart's own slot attribute
// and the `.bsc-skeleton` class the 1.32.0 redesign uses. The same list is in MEASURE_OPEN (runs in the page).
const DIALOG = '[role="dialog"]';
const SKELETON = '[role="dialog"] :is([data-slot="skeleton"], [data-bitsnap-checkout-slot="skeleton"], .bsc-skeleton)';

// ---------------------------------------------------------------- options

function parseArgs(argv) {
  const o = {
    target: "harness",
    sdk: path.join(repoRoot, "dist"),
    label: undefined,
    url: undefined,
    cartSelector: 'button.bitsnap-react[aria-haspopup="dialog"]',
    addSelector: undefined,
    dismiss: undefined,
    scenarios: ALL_SCENARIOS,
    runs: 20,
    warmup: 5,
    network: "fast3g",
    cpu: 4,
    serverDelay: 100,
    preflightMaxAge: undefined,
    json: undefined,
    baseline: undefined,
    renderFloor: undefined,
    check: false,
    qtyCacheMiss: false,
    skipSkeletonCheck: false,
    timeout: 10000,
    headed: false,
    quiet: false,
  };
  const flags = new Set(["check", "headed", "quiet", "qtyCacheMiss", "skipSkeletonCheck"]);
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) throw new Error(`unexpected argument ${raw}`);
    const key = raw.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (!(key in o)) throw new Error(`unknown option ${raw}`);
    if (flags.has(key)) {
      o[key] = true;
      continue;
    }
    const value = argv[++i];
    if (value == null) throw new Error(`${raw} needs a value`);
    if (key === "scenarios") o[key] = value.split(",");
    else if (["runs", "warmup", "cpu", "serverDelay", "preflightMaxAge", "renderFloor", "timeout"].includes(key)) o[key] = Number(value);
    else o[key] = value;
  }
  for (const s of o.scenarios) if (!ALL_SCENARIOS.includes(s)) throw new Error(`unknown scenario ${s}`);
  if (o.target !== "harness" && o.target !== "live") throw new Error(`unknown target ${o.target} (harness or live)`);
  // A live target is somebody's real shop: never default to one.
  if (o.target === "live" && !o.url) throw new Error("--target live needs --url <shop page> (use your own test project, never a merchant's shop)");
  return o;
}

// ---------------------------------------------------------------- playwright (no repo dependency)

async function loadPlaywright() {
  const requireFromRepo = createRequire(path.join(repoRoot, "package.json"));
  const dirs = [];
  if (process.env.PLAYWRIGHT_MODULE_DIR) dirs.push(process.env.PLAYWRIGHT_MODULE_DIR);
  for (const name of ["playwright", "playwright-core"]) {
    try {
      dirs.push(path.dirname(requireFromRepo.resolve(`${name}/package.json`)));
    } catch {}
  }
  const npx = path.join(os.homedir(), ".npm/_npx");
  if (fs.existsSync(npx)) {
    for (const hash of fs.readdirSync(npx)) {
      for (const name of ["playwright", "playwright-core"]) dirs.push(path.join(npx, hash, "node_modules", name));
    }
  }
  for (const dir of dirs) {
    if (!fs.existsSync(path.join(dir, "package.json"))) continue;
    try {
      const mod = createRequire(path.join(dir, "package.json"))(dir);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium && fs.existsSync(chromium.executablePath())) {
        return { chromium, from: dir, version: JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version };
      }
    } catch {}
  }
  throw new Error(
    "No Playwright with an installed Chromium found (looked at PLAYWRIGHT_MODULE_DIR, the repo and the npx cache). " +
      "Set PLAYWRIGHT_MODULE_DIR to a playwright-core directory whose Chromium revision is in " +
      "~/.cache/ms-playwright (npx playwright install chromium), or run it as `npx -p playwright node scripts/perf/cart-open.mjs`.",
  );
}

// ---------------------------------------------------------------- harness (page + bundle + mock API)

function sdkInfo(sdkDir) {
  for (const rel of ["../package.json", "package.json"]) {
    const p = path.join(sdkDir, rel);
    if (fs.existsSync(p)) {
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        if (j.name === "bitsnap-react") return j.version;
      } catch {}
    }
  }
  return "unknown";
}

function buildHarness(sdkDir, outDir) {
  const esbuild = createRequire(path.join(repoRoot, "package.json"))("esbuild");
  const nodeModules = path.join(repoRoot, "node_modules");
  const entry = path.join(sdkDir, "index.mjs");
  if (!fs.existsSync(entry)) throw new Error(`no index.mjs in ${sdkDir}; build the SDK first (pnpm build)`);
  fs.mkdirSync(outDir, { recursive: true });
  let css = path.join(sdkDir, "index.css");
  if (!fs.existsSync(css)) {
    css = path.join(outDir, "empty.css");
    fs.writeFileSync(css, "");
  }
  // ESM with code splitting: the SDK's dynamic import() chunks (drawer, wallets, ...) stay separate files
  // that the page fetches over the throttled network, as a shop's bundler would serve them. A single IIFE
  // would inline them and hide their cost.
  esbuild.buildSync({
    entryPoints: [path.join(here, "harness-entry.jsx")],
    bundle: true,
    minify: true,
    format: "esm",
    splitting: true,
    jsx: "automatic",
    outdir: outDir,
    entryNames: "bundle",
    chunkNames: "chunk-[hash]",
    nodePaths: [nodeModules],
    alias: {
      "bitsnap-sdk": entry,
      "bitsnap-sdk-css": css,
      react: path.join(nodeModules, "react"),
      "react-dom": path.join(nodeModules, "react-dom"),
      ...(fs.existsSync(path.join(nodeModules, "radix-ui")) ? {} : { "radix-ui": path.join(here, "radix-ui-shim.js") }),
    },
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".woff": "dataurl", ".woff2": "dataurl", ".svg": "dataurl", ".png": "dataurl" },
    logLevel: "error",
  });
}

function startPageServer(dir, apiOrigin) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/bundle.css"><script data-id="perf" data-name="internal-cart" data-custom-host="${apiOrigin}"></script></head>
<body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`;
  const server = http.createServer((req, res) => {
    const name = (req.url ?? "/").split("?")[0];
    if (name === "/" || name === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }
    const file = path.join(dir, path.basename(name));
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ origin: `http://localhost:${server.address().port}`, close: () => new Promise((r) => server.close(() => r())) }),
    ),
  );
}

// ---------------------------------------------------------------- stats

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

function summarize(values, failures, total) {
  const sorted = [...values].sort((a, b) => a - b);
  // A p95 is only meaningful when fewer than 5 % of the runs failed; otherwise it is "never".
  const tooManyFailures = failures > Math.floor(total * 0.05);
  return {
    n: total,
    failures,
    p50: tooManyFailures && failures * 2 >= total ? Infinity : percentile(sorted, 50),
    p95: tooManyFailures ? Infinity : percentile(sorted, 95),
    min: sorted[0] ?? NaN,
    max: sorted[sorted.length - 1] ?? NaN,
  };
}

const fmt = (v) => (v === Infinity ? "never" : Number.isFinite(v) ? `${Math.round(v)} ms` : "-");

// ---------------------------------------------------------------- one run

/**
 * Records every request of the page (CDP). Times are epoch milliseconds so they can be
 * related to the click, which is stamped in the page with performance.timeOrigin.
 */
async function recordRequests(cdp) {
  const byId = new Map();
  cdp.on("Network.requestWillBeSent", (e) => {
    const u = new URL(e.request.url);
    if (u.protocol === "data:") return;
    byId.set(e.requestId, {
      method: e.request.method,
      url: e.request.url,
      path: u.pathname + (u.search.length > 60 ? u.search.slice(0, 60) + "…" : u.search),
      startEpoch: e.wallTime * 1000,
      ts: e.timestamp,
      initiator: e.initiator?.type,
      client: e.request.headers["X-Bitsnap-Client"] ?? e.request.headers["x-bitsnap-client"],
      fromCache: false,
      status: undefined,
      endEpoch: undefined,
      failed: undefined,
    });
  });
  cdp.on("Network.requestServedFromCache", (e) => {
    const r = byId.get(e.requestId);
    if (r) r.fromCache = true;
  });
  cdp.on("Network.responseReceived", (e) => {
    const r = byId.get(e.requestId);
    if (!r) return;
    r.status = e.response.status;
    if (e.response.fromDiskCache || e.response.fromServiceWorker) r.fromCache = true;
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = byId.get(e.requestId);
    if (r) r.endEpoch = r.startEpoch + (e.timestamp - r.ts) * 1000;
  });
  cdp.on("Network.loadingFailed", (e) => {
    const r = byId.get(e.requestId);
    if (r) {
      r.failed = e.errorText;
      r.endEpoch = r.startEpoch + (e.timestamp - r.ts) * 1000;
    }
  });
  return () => [...byId.values()];
}

const relativeRequests = (all, clickEpoch) =>
  all
    .filter((r) => r.startEpoch - clickEpoch > -60000)
    .map((r) => ({
      method: r.method,
      path: r.path,
      kind: r.initiator === "preflight" || r.method === "OPTIONS" ? "preflight" : "request",
      startMs: Math.round(r.startEpoch - clickEpoch),
      endMs: r.endEpoch == null ? null : Math.round(r.endEpoch - clickEpoch),
      fromCache: r.fromCache,
      status: r.status ?? null,
      failed: r.failed ?? null,
      client: r.client,
    }))
    .sort((a, b) => a.startMs - b.startMs);

// Runs in the page. Clicks `clickSelector` and resolves when EVERY cart row is painted in the new drawer: each of the
// `expectedRows` rows (a number, or "storage": the lines of `localStorage.checkout` at the click) has name and price
// text and a non-zero box, is not `visibility: hidden` / `display: none` (nor are its name and price), and has an
// effective opacity above 0 (product over the element and its ancestors up to the dialog). `itemsMs` is the frame
// that paints them (rAF, then a task after it; re-checked in both), not the mutation that made them qualify.
// Skeletons are watched up to that point (not only up to the first row), so one that shows while other rows are still
// missing is recorded. `mountMs` is when the drawer first appeared in the DOM (ms from the click): the drawer's first commit,
// the A4 reference point. A dialog that already exists at the click (a drawer still leaving) is not the new one.
const MEASURE_OPEN = ({ clickSelector, itemSel, nameSel, priceSel, skeletonSel, dialogSel, expectedRows, timeoutMs }) =>
  new Promise((resolve) => {
    const dialogBefore = document.querySelector(dialogSel);
    const newDialogs = () => [...document.querySelectorAll(dialogSel)].filter((d) => d !== dialogBefore);
    const storageLines = () => {
      try {
        return JSON.parse(localStorage.getItem("checkout") ?? "{}").products?.length ?? 0;
      } catch {
        return 0;
      }
    };
    // Counted before the click: the click itself may change the cart (add-then-open passes a number).
    const expected = typeof expectedRows === "number" ? expectedRows : storageLines();
    const hasText = (el) => Boolean(el && el.textContent && el.textContent.trim());
    // Product of the computed opacity of `el` and every ancestor up to the drawer's content root (the dialog, included).
    // Any value above 0 counts: the enter animation fades in from a low opacity and A1 is the first visible frame, not
    // the end of the animation.
    const effectiveOpacity = (el, root) => {
      let product = 1;
      for (let n = el; n; n = n.parentElement) {
        product *= Number.parseFloat(getComputedStyle(n).opacity);
        if (n === root) break;
      }
      return product;
    };
    const isVisible = (el, root) => {
      const box = el.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return false;
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && effectiveOpacity(el, root) > 0;
    };
    // Cheap text test first; the layout reads (box, style) only once enough rows have their text.
    const rowsState = () => {
      const rows = newDialogs()
        .flatMap((d) => [...d.querySelectorAll(itemSel)].map((row) => ({ root: d, row, name: row.querySelector(nameSel), price: row.querySelector(priceSel) })))
        .filter((r) => hasText(r.name) && hasText(r.price));
      const visible =
        rows.length < expected ? 0 : rows.filter((r) => isVisible(r.row, r.root) && isVisible(r.name, r.root) && isVisible(r.price, r.root)).length;
      return { withText: rows.length, visible };
    };
    const t0 = performance.now();
    const clickEpoch = performance.timeOrigin + t0;
    let skeleton = false;
    let mountMs = null;
    let done = false;
    let pending = false; // the rows qualify and the frame that paints them is on its way
    let frame = 0;
    const stampMount = () => {
      if (mountMs == null && newDialogs().length > 0) mountMs = performance.now() - t0;
    };
    const finish = (value) => {
      if (done) return;
      done = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      resolve({ clickEpoch, skeleton, mountMs, expectedRows: expected, ...value });
    };
    const scan = () => {
      stampMount();
      if (!skeleton && newDialogs().some((d) => d.querySelector(skeletonSel))) skeleton = true;
    };
    const rowsReady = () => expected > 0 && rowsState().visible >= expected;
    // The time is the frame that shows the rows, not the mutation that made them qualify: when the condition is first
    // met, wait for the next frame (rAF, then a task after it is painted) and check again in it and after it. A
    // condition that no longer holds there is not a paint: keep waiting.
    // Called from the frame poll (`inFrame`), the rows already qualify inside a frame, so only the task after its
    // paint is awaited; a mutation outside a frame waits for the next frame first.
    const check = (inFrame = false) => {
      if (done || pending) return;
      scan();
      if (!rowsReady()) return;
      pending = true;
      const afterPaint = () => {
        setTimeout(() => {
          if (done) return;
          scan();
          if (!rowsReady()) {
            pending = false;
            return;
          }
          const ms = performance.now() - t0;
          finish({ ok: true, itemsMs: ms, paintMs: ms });
        }, 0);
      };
      if (inFrame === true) {
        afterPaint();
        return;
      }
      requestAnimationFrame(() => {
        if (done) return;
        scan();
        if (!rowsReady()) {
          pending = false;
          return;
        }
        afterPaint();
      });
    };
    // Attribute changes (hidden -> visible) and layout-only changes (a row growing from 0 height) are not text
    // mutations: watch attributes too and re-check every frame.
    const observer = new MutationObserver(() => check());
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    const poll = () => {
      check(true);
      if (!done) frame = requestAnimationFrame(poll);
    };
    const timer = setTimeout(() => {
      const state = rowsState();
      finish({ ok: false, itemsMs: null, paintMs: null, reason: `${state.visible}/${expected} rows painted, ${state.withText} with name and price text` });
    }, timeoutMs);
    document.querySelector(clickSelector).click();
    stampMount(); // React flushes a discrete event synchronously: the drawer may already be there
    check();
    // No row to wait for is not "painted at once": the run fails instead of passing on an empty list.
    if (expected <= 0) finish({ ok: false, itemsMs: null, paintMs: null, reason: "no cart lines to wait for" });
    frame = requestAnimationFrame(poll);
  });

// Runs in the page. `action` "plus": clicks "+" of the first line `times` times; "remove": clicks Remove of the
// first line. Watches three things and stamps the first change of each (ms from the click):
//   line   the first line's price text ("plus") or the number of lines in the list ("remove")
//   total  the total value
//   count  the number on the cart trigger (sum of quantities)
// A7 wants all three in the same commit as the local `checkout` write (`window.__perfWrites`, set by
// SETUP_SCRIPT). Single click: resolves when all three changed (ok), or at the timeout (not ok).
// Burst (`times` > 1): resolves `timeoutMs / 2` after the last click; ok when the line price changed.
const MEASURE_EDIT = ({ action, times, spacingMs, timeoutMs, itemSel, priceSel, buttonSel, removeSel, totalSel, triggerSel }) =>
  new Promise((resolve) => {
    // An item that auto-animate is fading out is still connected but has running animations: not a live line.
    const liveItems = () => [...document.querySelectorAll(itemSel)].filter((el) => el.isConnected && el.getAnimations().length === 0);
    const item = document.querySelector(itemSel);
    const read = {
      line: action === "remove" ? () => String(liveItems().length) : () => item.querySelector(priceSel)?.textContent ?? "",
      total: () => document.querySelector(totalSel)?.textContent ?? "",
      count: () => document.querySelector(triggerSel)?.textContent ?? "",
    };
    const target = action === "remove" ? item.querySelector(removeSel) : item.querySelectorAll(buttonSel)[1];
    const before = { line: read.line(), total: read.total(), count: read.count() };
    const changes = { line: null, total: null, count: null };
    const writesBefore = (window.__perfWrites ?? []).length;
    const t0 = performance.now();
    const clickEpoch = performance.timeOrigin + t0;
    let inputMs = null;
    let lastLine = before.line;
    let lastLineChangeMs = null;
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      const local = (window.__perfWrites ?? []).slice(writesBefore).filter((w) => w.key === "checkout");
      resolve({
        ok,
        clickEpoch,
        before,
        after: { line: read.line(), total: read.total(), count: read.count() },
        changes,
        lastLineChangeMs,
        inputMs,
        localWriteMs: local.length ? local[0].t - t0 : null,
        localWrites: local.length,
      });
    };
    const allChanged = () => changes.line != null && changes.total != null && changes.count != null;
    const check = () => {
      const ms = performance.now() - t0;
      for (const key of ["line", "total", "count"]) {
        if (changes[key] == null && read[key]() !== before[key]) changes[key] = ms;
      }
      const line = read.line();
      if (line !== lastLine) {
        lastLine = line;
        lastLineChangeMs = ms;
      }
      if (times === 1 && allChanged()) setTimeout(() => finish(true), 0);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    const timer = setTimeout(() => finish(times === 1 ? allChanged() : changes.line != null), timeoutMs);
    let clicked = 0;
    const click = () => {
      target.click();
      if (inputMs == null) requestAnimationFrame(() => (inputMs = performance.now() - t0));
      clicked++;
      if (clicked < times) setTimeout(click, spacingMs);
      else if (times > 1) setTimeout(() => finish(changes.line != null), timeoutMs / 2);
    };
    click();
  });

const SETUP_SCRIPT = (seed) => `
(() => {
  window.__perfWrites = [];
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    window.__perfWrites.push({ key, t: performance.now() });
    return orig.call(this, key, value);
  };
  ${seed ? `try { if (!localStorage.getItem("checkout")) orig.call(localStorage, "checkout", ${JSON.stringify(seed)}); } catch {}` : ""}
})();`;

async function startRun(browser, ctx, scenarioOpts) {
  const { o, pageUrl } = ctx;
  const seed = scenarioOpts.seed === false ? undefined : scenarioOpts.seed === "two" ? ctx.seedTwoLines : ctx.seed;
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
  await context.addInitScript(SETUP_SCRIPT(seed));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  const getRequests = await recordRequests(cdp);
  const throttle = async () => {
    if (o.network !== "none") await cdp.send("Network.emulateNetworkConditions", FAST_3G);
    if (o.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: o.cpu });
  };
  if (scenarioOpts.cacheDisabled) await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  // Cold scenarios: throttle before the page loads. The SDK may prefetch on idle right after it mounts; a
  // throttle that starts 300 ms after `load` would let that prefetch run on the fast link and flatter A2.
  // The page itself (bundle + chunks) is then loaded over Fast 3G too, which a real shopper also does.
  // From here every request counts toward the open path (A4) unless a scenario moves the start (see `windowStartEpoch`).
  const windowStartEpoch = Date.now();
  if (scenarioOpts.throttleBeforeLoad) await throttle();
  await page.goto(pageUrl, { waitUntil: "load", timeout: scenarioOpts.throttleBeforeLoad ? 120000 : 30000 });
  await page.waitForSelector(o.cartSelector, { state: "attached", timeout: scenarioOpts.throttleBeforeLoad ? 120000 : 30000 });
  if (o.target === "harness") await page.waitForFunction("window.__perfReady === true", undefined, { timeout: 60000 });
  await dismissBanner(page, o);
  if (!scenarioOpts.throttleBeforeLoad) await page.waitForTimeout(300);
  // `windowStartEpoch`: where the open's setup starts. Requests from there to SETTLE_MS after the drawer is
  // interactive are the open path's; a scenario whose setup opens the cart itself (reopen, snapshot-*) moves it
  // to the end of that earlier open, so its legitimate requests are not counted against this one.
  return { context, page, cdp, getRequests, throttle, windowStartEpoch };
}

/** A cookie banner on a live shop: click its "reject" button (`--dismiss <button text>`) so it cannot cover the page. */
async function dismissBanner(page, o) {
  if (!o.dismiss) return;
  const button = page.getByRole("button", { name: o.dismiss }).first();
  try {
    await button.waitFor({ state: "visible", timeout: 4000 });
    await button.click();
    await page.waitForTimeout(300);
  } catch {}
}

const openArgs = (o, timeoutMs) => ({
  clickSelector: o.cartSelector, itemSel: ITEM, nameSel: NAME, priceSel: PRICE, skeletonSel: SKELETON, dialogSel: DIALOG,
  expectedRows: "storage", // every line of the cart at the click; add-then-open overrides it with 1
  timeoutMs: timeoutMs ?? o.timeout,
});

const editArgs = (o, action, times, spacingMs) => ({
  action, times, spacingMs, timeoutMs: 6000,
  itemSel: ITEM, priceSel: PRICE, buttonSel: QTY_BUTTON, removeSel: REMOVE_BUTTON, totalSel: TOTAL, triggerSel: o.cartSelector,
});

async function waitItemsGone(page) {
  await page.waitForFunction((sel) => !document.querySelector(sel), ITEM, { timeout: 10000 });
}

async function addFromUi(ctx, run) {
  // Harness: the page's own add button. Live: the shop's add selector. Both go through the SDK's add path.
  await run.page.click(ctx.addSelector);
}

const SCENARIO_RUNNERS = {
  async "cold-no-snapshot"(ctx, run) {
    await run.throttle();
    await run.page.waitForTimeout(2000);
    return openResult(await run.page.evaluate(MEASURE_OPEN, openArgs(ctx.o)), run);
  },
  async "cold-immediate"(ctx, run) {
    await run.throttle();
    return openResult(await run.page.evaluate(MEASURE_OPEN, openArgs(ctx.o)), run);
  },
  async "snapshot-reload"(ctx, run) {
    await addThenReload(ctx, run);
    await run.throttle();
    await run.page.waitForTimeout(2000);
    return openResult(await run.page.evaluate(MEASURE_OPEN, openArgs(ctx.o)), run);
  },
  async "snapshot-offline"(ctx, run) {
    await addThenReload(ctx, run);
    await run.throttle();
    await run.page.waitForTimeout(2000);
    await run.cdp.send("Network.emulateNetworkConditions", { ...FAST_3G, offline: true });
    // Nothing is in the drawer without a network on today's SDK: do not wait the full timeout.
    return openResult(await run.page.evaluate(MEASURE_OPEN, openArgs(ctx.o, Math.min(ctx.o.timeout, 4000))), run);
  },
  async reopen(ctx, run) {
    await run.throttle();
    const first = await run.page.evaluate(MEASURE_OPEN, openArgs(ctx.o));
    if (!first.ok) return openResult(first, run);
    await run.page.keyboard.press("Escape");
    await waitItemsGone(run.page);
    // The reopen's setup starts when the first drawer is gone: a POST from here on (also during the idle 500 ms
    // before the click) belongs to the reopen. The first open's own POST is the cached answer's source.
    run.windowStartEpoch = Date.now();
    await run.page.waitForTimeout(500);
    const result = await openResult(await run.page.evaluate(MEASURE_OPEN, openArgs(ctx.o)), run, { firstOpenMs: first.itemsMs });
    // "No POST on the reopen" is a cache hit only if the first open sent one that was not refused.
    const source = run.getRequests().find((x) => x.method === "POST" && x.path.includes("/payment-methods") && x.startEpoch >= first.clickEpoch - 5 && x.startEpoch < run.windowStartEpoch);
    result.cacheSource = source != null && !source.failed && (source.status ?? 200) < 400;
    return result;
  },
  async "add-then-open"(ctx, run) {
    await run.throttle();
    // A3: hover the add button >= 1 s before the click.
    await run.page.hover(ctx.addSelector);
    await run.page.waitForTimeout(1000);
    // The click happens inside the page (timing), so the Playwright selector is turned into a CSS one.
    await run.page.locator(ctx.addSelector).first().evaluate((el) => el.setAttribute("data-perf-add", "1"));
    const result = await run.page.evaluate(
      MEASURE_OPEN,
      { ...openArgs(ctx.o), clickSelector: '[data-perf-add="1"]', expectedRows: 1 }, // the cart starts empty: one row after the add
    );
    const add = await run.page.evaluate("window.__perfAdd ?? null");
    const extra = {};
    if (add) {
      extra.addMs = add.addMs;
      extra.addError = add.err;
      // From the moment the add promise resolved (just before `showCart`) to the first item: the drawer alone.
      // `add.added` and `t0` are both `performance.now()` of the page.
      const t0 = result.clickEpoch - add.timeOrigin;
      extra.drawerMs = result.itemsMs == null ? null : result.itemsMs - (add.added - t0);
    }
    return openResult(result, run, extra);
  },
  async qty(ctx, run) {
    return editResult(ctx, run, { action: "plus" });
  },
  async remove(ctx, run) {
    return editResult(ctx, run, { action: "remove" });
  },
  async "qty-burst"(ctx, run) {
    await run.throttle();
    const opened = await run.page.evaluate(MEASURE_OPEN, openArgs(ctx.o));
    if (!opened.ok) return { ok: false, reason: "cart did not open", requests: [] };
    await run.page.waitForTimeout(2500);
    const r = await run.page.evaluate(MEASURE_EDIT, editArgs(ctx.o, "plus", 3, 100));
    const requests = relativeRequests(run.getRequests(), r.clickEpoch).filter((x) => x.startMs > -50);
    return {
      ok: r.ok,
      value: r.lastLineChangeMs,
      paymentMethodPosts: requests.filter((x) => x.method === "POST" && x.path.includes("/payment-methods")).length,
      productsRequestsAfterClick: requests.filter((x) => x.kind === "request" && x.path.includes("/products")).length,
      requests,
    };
  },
};

/** Open the cart, let the open path settle, then one "+" or Remove click on the first line (A7). */
async function editResult(ctx, run, { action }) {
  await run.throttle();
  const opened = await run.page.evaluate(MEASURE_OPEN, openArgs(ctx.o));
  if (!opened.ok) return { ok: false, reason: "cart did not open", requests: relativeRequests(run.getRequests(), opened.clickEpoch) };
  await run.page.waitForTimeout(2500); // let the open path settle: the click must not compete with it
  // The same click >= 60 s after the last /products answer (max-age=60 expired), or with the HTTP cache off.
  if (ctx.o.qtyCacheMiss) await run.cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  const r = await run.page.evaluate(MEASURE_EDIT, editArgs(ctx.o, action, 1, 0));
  // The edit resolves in a few ms; a refetch (GET /products) it triggers starts later. Collect for SETTLE_MS more.
  await run.page.waitForTimeout(SETTLE_MS);
  const requests =relativeRequests(run.getRequests(), r.clickEpoch).filter((x) => x.startMs > -50);
  const products = requests.filter((x) => x.kind === "request" && x.path.includes("/products"));
  const changed = Object.values(r.changes).filter((v) => v != null);
  // A7 is "in the same commit as the local write": every watched value must change at or after the write
  // (1 ms of clock slack) and within 50 ms of it.
  const lags = r.localWriteMs == null ? [] : changed.map((v) => v - r.localWriteMs);
  return {
    ok: r.ok,
    // Time until the slowest of line, total and count changed.
    value: r.ok ? Math.max(...changed) : null,
    lineMs: r.changes.line,
    totalMs: r.changes.total,
    countMs: r.changes.count,
    inputMs: r.inputMs,
    localWriteMs: r.localWriteMs,
    localWrites: r.localWrites,
    lagAfterWriteMs: lags.length ? Math.max(...lags) : null,
    leadBeforeWriteMs: lags.length ? -Math.min(...lags) : null,
    productsRequestsAfterClick: products.length,
    productsFromCache: products.map((p) => p.fromCache),
    productsDurationMs: products.map((p) => (p.endMs == null ? null : p.endMs - p.startMs)),
    productsEndMs: products.map((p) => p.endMs),
    requests,
  };
}

async function addThenReload(ctx, run) {
  // The cart is seeded; "add a product" goes through the SDK's add path too, so a future snapshot exists.
  await addFromUi(ctx, run);
  await run.page.waitForSelector(ITEM, { timeout: 20000 });
  await run.page.keyboard.press("Escape");
  await waitItemsGone(run.page);
  await run.page.reload({ waitUntil: "load" });
  await run.page.waitForSelector(ctx.o.cartSelector, { state: "attached", timeout: 30000 });
  await run.page.waitForTimeout(300);
  run.windowStartEpoch = Date.now(); // the add's own open (and its POST) is over
}

async function openResult(r, run, extra = {}) {
  // Keep collecting after the drawer is interactive: a POST that starts late is still the open path's POST.
  if (r.ok) await run.page.waitForTimeout(SETTLE_MS);
  const requests = relativeRequests(run.getRequests(), r.clickEpoch);
  // The A4 window: from the start of the setup (`run.windowStartEpoch`) to now (SETTLE_MS after the drawer paint).
  // No `startMs > -50` cut: a POST before the click is a finding (`paymentMethodsBeforeClick`), not noise.
  const inWindow = requests.filter((x) => x.startMs >= Math.floor(run.windowStartEpoch - r.clickEpoch));
  const posts = inWindow.filter((x) => x.method === "POST" && x.path.includes("/payment-methods"));
  const pm = posts[0];
  // The /products the open could wait for: in the window and still running (or not started) at the click. One that
  // finished before the click (an idle prefetch) cannot be waited for; one that started before it and is still
  // running can (cold-immediate).
  const productsGet = inWindow.find((x) => x.method === "GET" && x.path.includes("/public-commerce/products") && (x.endMs == null || x.endMs > -5));
  return {
    ok: r.ok,
    value: r.itemsMs,
    paintMs: r.paintMs,
    skeleton: r.skeleton,
    mountMs: r.mountMs ?? null,
    ...(r.reason ? { reason: r.reason } : {}),
    // A4: "never before the click". 5 ms of slack for the CDP clock against the page clock.
    paymentMethodsBeforeClick: posts.some((x) => x.startMs < -5),
    productsStartMs: productsGet?.startMs ?? null,
    productsEndMs: productsGet?.endMs ?? null,
    productsCached: productsGet?.fromCache ?? null,
    paymentMethodsStartMs: pm?.startMs ?? null,
    paymentMethodPostCount: posts.length,
    paymentMethodPostStarts: posts.map((x) => x.startMs),
    requests,
    ...extra,
  };
}

// ---------------------------------------------------------------- main

/** The shared browser; launched again when a crashed or disconnected one is found (a run error must not poison the rest). */
async function getBrowser(ctx) {
  if (ctx.browser?.isConnected()) return ctx.browser;
  if (ctx.browser) process.stderr.write("  browser disconnected: launching a new one\n");
  await ctx.browser?.close().catch(() => {});
  ctx.browser = await ctx.chromium.launch({ headless: !ctx.o.headed, args: ["--disable-features=Translate"] });
  ctx.browserVersion = ctx.browser.version();
  return ctx.browser;
}

async function measureScenario(ctx, name) {
  const { o } = ctx;
  const cacheDisabled = ["cold-no-snapshot", "cold-immediate", "snapshot-reload", "snapshot-offline"].includes(name);
  const scenarioOpts = {
    cacheDisabled,
    throttleBeforeLoad: COLD.includes(name),
    seed: name === "add-then-open" ? false : name === "remove" ? "two" : undefined,
  };
  const runs = [];
  const total = o.warmup + o.runs;
  for (let i = 0; i < total; i++) {
    let run;
    try {
      const browser = await getBrowser(ctx);
      run = await startRun(browser, ctx, scenarioOpts);
      const result = await SCENARIO_RUNNERS[name](ctx, run);
      if (i >= o.warmup) runs.push(result);
      if (!o.quiet) process.stderr.write(`  ${name} ${i < o.warmup ? "warm-up" : `run ${i - o.warmup + 1}/${o.runs}`}: ${result.ok ? fmt(result.value) : `FAILED${result.reason ? ` (${result.reason})` : ""}`}\n`);
    } catch (e) {
      if (i >= o.warmup) runs.push({ ok: false, reason: String(e?.message ?? e).split("\n")[0], requests: [] });
      if (!o.quiet) process.stderr.write(`  ${name} run error: ${String(e?.message ?? e).split("\n")[0]}\n`);
    } finally {
      await run?.context.close().catch(() => {});
    }
  }
  const good = runs.filter((r) => r.ok && Number.isFinite(r.value));
  const stats = summarize(good.map((r) => r.value), runs.length - good.length, runs.length);
  const median = good.length ? [...good].sort((a, b) => a.value - b.value)[Math.floor((good.length - 1) / 2)] : runs[0];
  return { name, stats, runs, median };
}

const EXTRA_METRICS = ["paintMs", "firstOpenMs", "addMs", "drawerMs", "inputMs", "localWriteMs", "lineMs", "totalMs", "countMs", "lagAfterWriteMs"];

function printExtras(result, o) {
  const parts = [];
  for (const key of EXTRA_METRICS) {
    const values = result.runs.filter((r) => r.ok && Number.isFinite(r[key])).map((r) => r[key]);
    if (values.length === 0) continue;
    const s = summarize(values, 0, values.length);
    parts.push(`${key} p50 ${fmt(s.p50)} / p95 ${fmt(s.p95)}`);
  }
  if (parts.length) console.log(`  ${parts.join("; ")}`);
  const ok = result.runs.filter((r) => r.ok);
  const skeleton = ok.filter((r) => r.skeleton).length;
  if (ok.some((r) => r.skeleton !== undefined)) console.log(`  skeleton shown before the items in ${skeleton}/${ok.length} runs`);
  if (skeletonCanaryBroken(result, o)) {
    console.log(`  WARNING: no skeleton seen in any cold-immediate run. Either the SDK paints items at once (then pass --skip-skeleton-check)`);
    console.log(`           or the skeleton marker changed and "no skeleton frame" (A1) cannot be trusted. Looked for: ${SKELETON}`);
  }
  const m = result.median;
  if (m?.productsFromCache !== undefined) {
    console.log(
      `  GET /products after the click (median run): ${m.productsRequestsAfterClick}x, from HTTP cache: ${JSON.stringify(m.productsFromCache)}, duration ms: ${JSON.stringify(m.productsDurationMs)}`,
    );
  }
  if (m?.paymentMethodPosts !== undefined) console.log(`  POST /payment-methods after 3 clicks (median run): ${m.paymentMethodPosts}`);
}

/**
 * `cold-immediate` has no snapshot and no network answer yet, so every SDK paints something skeleton-like there.
 * No skeleton in any of its runs means the marker probably changed: the "no skeleton frame" part of A1 would then
 * pass for the wrong reason.
 */
function skeletonCanaryBroken(result, o) {
  if (result.name !== "cold-immediate" || o.skipSkeletonCheck) return false;
  const ok = result.runs.filter((r) => r.ok);
  return ok.length > 0 && ok.every((r) => !r.skeleton);
}

function printTimeline(result) {
  const m = result.median;
  if (!m?.requests?.length) return;
  console.log(`  request timeline of the median run (ms relative to the click):`);
  // Only the cart's own calls (the API); page assets, fonts, flag icons and the shop's other traffic are left out.
  const relevant = /\/public-commerce\/|\/api\/rpc\//;
  for (const r of m.requests.filter((x) => x.startMs > -5000 && relevant.test(x.path))) {
    const end = r.endMs == null ? "…" : `${r.endMs}`;
    console.log(`    ${String(r.startMs).padStart(6)} -> ${end.padStart(6)}  ${r.method.padEnd(7)} ${r.kind === "preflight" ? "(preflight) " : ""}${r.path}${r.fromCache ? "  [cache]" : ""}${r.status && r.status >= 400 ? `  [${r.status}]` : ""}`);
  }
}

const finite = (v) => typeof v === "number" && Number.isFinite(v);
/** `value <= limit`, false for "never", NaN, null and undefined: a number that is not there never passes. */
const within = (value, limit) => finite(value) && finite(limit) && value <= limit;

const drawerStats = (runs) => {
  const ok = runs.filter((r) => r.ok && finite(r.drawerMs));
  return summarize(ok.map((r) => r.drawerMs), runs.length - ok.length, runs.length);
};
const addStats = (runs) => {
  const ok = runs.filter((r) => r.ok && finite(r.addMs));
  return summarize(ok.map((r) => r.addMs), runs.length - ok.length, runs.length);
};

/**
 * The gate. Every criterion of part 1 section 2 that gates 1.32.0 (A1, A2, A3, A4, A7) yields at least one
 * row; one whose scenario did not run, or whose baseline is missing, is a FAIL, never silence.
 */
function criteria(o, results, floorMs) {
  const out = [];
  const by = Object.fromEntries(results.map((r) => [r.name, r]));
  const limitA1 = Math.max(100, floorMs + 20);
  const add = (id, name, pass, detail) => out.push({ id, name, pass, detail });
  const notMeasured = (id, name) => add(id, name, false, "not measured (scenario did not run)");
  const baseStats = (name) => o.baselineData?.[name]?.stats;
  const baselineP95 = (name) => {
    const v = baseStats(name)?.p95;
    return finite(v) ? v : null;
  };
  const failedNote = (r) => `${r.stats.failures}/${r.stats.n} runs failed`;

  // A1: items from the snapshot, no skeleton, any network.
  for (const n of ["reopen", "snapshot-reload", "snapshot-offline"]) {
    const r = by[n];
    if (!r) {
      notMeasured("A1", n);
      continue;
    }
    const skeletonRuns = r.runs.filter((x) => x.skeleton).length;
    add("A1", n, within(r.stats.p95, limitA1) && skeletonRuns === 0,
      `p95 ${fmt(r.stats.p95)} <= ${Math.round(limitA1)} ms (floor ${Math.round(floorMs)} ms + 20, min 100); skeleton in ${skeletonRuns}/${r.runs.length} runs; ${failedNote(r)}`);
  }
  // The skeleton check of A1 is only as good as its marker: cold-immediate must show one.
  if (!o.skipSkeletonCheck) {
    const c = by["cold-immediate"];
    if (!c) notMeasured("A1", "skeleton marker (cold-immediate canary)");
    else add("A1", "skeleton marker (cold-immediate canary)", !skeletonCanaryBroken(c, o),
      `skeleton seen in ${c.runs.filter((x) => x.ok && x.skeleton).length}/${c.runs.filter((x) => x.ok).length} cold-immediate runs; marker ${SKELETON}`);
  }

  // A2: first open without snapshot, <= 1.5 s and <= 50 % of the baseline.
  if (!by["cold-no-snapshot"]) notMeasured("A2", "cold-no-snapshot");
  else {
    const r = by["cold-no-snapshot"];
    const base = baselineP95("cold-no-snapshot");
    const absolute = within(r.stats.p95, 1500);
    const relative = base != null && within(r.stats.p95, base / 2);
    add("A2", "cold-no-snapshot", absolute && relative,
      `p95 ${fmt(r.stats.p95)} <= 1500 ms${absolute ? "" : " (missed)"} and <= 50 % of baseline ${base == null ? "(baseline p95 missing: FAIL)" : `${fmt(base)} = ${fmt(base / 2)}${relative ? "" : " (missed)"}`}; ${failedNote(r)}`);
  }

  // A3: first-ever add, then the drawer.
  if (!by["add-then-open"]) notMeasured("A3", "add-then-open");
  else {
    const runs = by["add-then-open"].runs;
    const drawer = drawerStats(runs);
    const addS = addStats(runs);
    const base = o.baselineData?.["add-then-open"] ? drawerStats(o.baselineData["add-then-open"].runs ?? []) : null;
    const baseP95 = base && finite(base.p95) ? base.p95 : null;
    const drawerOk = within(drawer.p95, limitA1);
    const addOk = within(addS.p95, 1200);
    // Decided 2026-11-20: drawer time <= max(50 % of baseline drawer p95, A1 limit). The snapshot-painted
    // drawer costs about the render floor, so a pure 50 % rule would pass or fail by noise.
    const relativeLimit = baseP95 == null ? null : Math.max(baseP95 / 2, limitA1);
    const relative = within(drawer.p95, relativeLimit);
    add("A3", "add-then-open", drawerOk && addOk && relative,
      `drawer (from the add promise) p95 ${fmt(drawer.p95)} <= ${Math.round(limitA1)} ms${drawerOk ? "" : " (missed)"}; add p95 ${fmt(addS.p95)} <= 1200 ms${addOk ? "" : " (missed)"}; ` +
        `drawer <= max(50 % of baseline, A1 limit) ${baseP95 == null ? "(baseline drawer p95 missing: FAIL)" : `= max(${fmt(baseP95 / 2)}, ${Math.round(limitA1)} ms) = ${fmt(relativeLimit)}${relative ? "" : " (missed)"}`}; ${drawer.failures}/${runs.length} runs without a drawer time`);
  }

  // A4: the POST /payment-methods starts with the open and does not wait for /products.
  // On `reopen` no POST is fine only as a cached answer: the first open of the same run must have sent one that was
  // answered (`cacheSource`). Every POST from the start of the setup to SETTLE_MS after the paint is counted.
  for (const n of ["cold-no-snapshot", "cold-immediate", "reopen"]) {
    const r = by[n];
    if (!r) {
      notMeasured("A4", n);
      continue;
    }
    const mustPost = n !== "reopen";
    // "The open" = the drawer's first commit (mountMs), not the click (decided 2026-11-20); p95 over the runs.
    const delays = [];
    let before = 0;
    let waited = 0;
    let none = 0;
    let failed = 0;
    let noMount = 0;
    let extra = 0;
    let noCache = 0;
    for (const x of r.runs) {
      if (!x.ok) {
        failed++;
        continue;
      }
      if (!(x.paymentMethodPostCount >= 1)) {
        if (mustPost) none++;
        // No POST on a reopen is a cached answer only when the first open sent a POST that was answered.
        else if (!x.cacheSource) noCache++;
        continue;
      }
      // Every POST in the window counts: the open sends one. A second one (a re-send, a late one) is a fail.
      if (x.paymentMethodPostCount > 1) extra++;
      // A POST that started before the click is not an open-path request: a failure of its own.
      if (x.paymentMethodsBeforeClick) before++;
      if (finite(x.mountMs)) delays.push(Math.max(0, x.paymentMethodsStartMs - x.mountMs));
      else noMount++;
      // "Waits for /products": starts only after a /products that really took network time.
      if (x.productsEndMs != null && !x.productsCached && x.paymentMethodsStartMs >= x.productsEndMs) waited++;
    }
    const delayP95 = percentile([...delays].sort((a, b) => a - b), 95);
    // `reopen` with no POST in any run has no delay to judge: nothing to fail.
    const delayOk = delays.length === 0 ? noMount === 0 : within(delayP95, 50);
    add("A4", n, delayOk && before === 0 && noMount === 0 && waited === 0 && none === 0 && failed === 0 && extra === 0 && noCache === 0,
      `POST /payment-methods p95 ${delays.length ? fmt(delayP95) : "-"} <= 50 ms after the drawer mounts${delayOk ? "" : " (missed)"}; ` +
        `${before} started before the click, ${waited} waited for /products, ${extra} sent more than one POST in the window, ` +
        `${mustPost ? `${none} without a POST (required here)` : `${noCache} without a POST and without an answered first-open POST to serve it (no POST is accepted only as a cached answer)`}, ` +
        `${noMount} without a drawer mount time, ${failed} run(s) did not open`);
  }

  // A7: the edit shows at once, no refetch, one POST for a burst.
  const editRow = (name, { noProductsGet }) => {
    const r = by[name];
    if (!r) {
      notMeasured("A7", name);
      return;
    }
    const ok = r.runs.filter((x) => x.ok);
    const noWrite = ok.filter((x) => !(x.localWrites >= 1 && finite(x.localWriteMs))).length;
    const early = ok.filter((x) => finite(x.leadBeforeWriteMs) && x.leadBeforeWriteMs > 1).length;
    const late = ok.filter((x) => finite(x.lagAfterWriteMs) && x.lagAfterWriteMs > 50).length;
    const extra = noProductsGet ? r.runs.filter((x) => x.productsRequestsAfterClick > 0).length : 0;
    add("A7", name, within(r.stats.p95, 50) && r.stats.failures === 0 && noWrite === 0 && early === 0 && late === 0 && extra === 0,
      `line + total + count p95 ${fmt(r.stats.p95)} <= 50 ms from the click; ${r.stats.failures}/${r.stats.n} runs did not update all three; ` +
        `no local write seen in ${noWrite}, a value changed before the write in ${early}, more than 50 ms after the write in ${late}` +
        (noProductsGet ? `; GET /products after the click in ${extra}/${r.runs.length} runs` : ""));
  };
  editRow("qty", { noProductsGet: true });
  editRow("remove", { noProductsGet: false });
  if (!by["qty-burst"]) notMeasured("A7", "qty-burst");
  else {
    const runs = by["qty-burst"].runs;
    const counts = {};
    for (const x of runs) {
      const k = x.ok ? String(x.paymentMethodPosts) : "no data";
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const exactlyOne = runs.filter((x) => x.ok && x.paymentMethodPosts === 1).length;
    add("A7", "qty-burst", runs.length > 0 && exactlyOne === runs.length,
      `3 clicks in 200 ms must send exactly 1 POST /payment-methods: ${exactlyOne}/${runs.length} runs did (POSTs per run: ${JSON.stringify(counts)})`);
  }
  return out;
}

/** Reads and validates `--baseline`; with --check a missing file or a baseline of another script version is an error. */
function loadBaseline(o) {
  if (!o.baseline) return;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(o.baseline, "utf8"));
  } catch (e) {
    throw new Error(`cannot read --baseline ${o.baseline}: ${e.message}`);
  }
  if (data.scriptVersion !== SCRIPT_VERSION) {
    throw new Error(
      `--baseline ${o.baseline} was written by cart-open.mjs version ${data.scriptVersion ?? 1}, this is ${SCRIPT_VERSION}: ` +
        `the harness or a metric changed, so the numbers do not compare. Re-measure the baseline SDK with this script (--json).`,
    );
  }
  o.baselineData = Object.fromEntries(data.results.map((r) => [r.name, r]));
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  loadBaseline(o);
  const { chromium, from, version } = await loadPlaywright();
  const cleanups = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cart-perf-"));
  cleanups.push(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ctx = { o, chromium };
  let sdkLabel;
  if (o.target === "harness") {
    const sdk = path.resolve(o.sdk);
    sdkLabel = `bitsnap-react ${sdkInfo(sdk)} (${sdk})`;
    buildHarness(sdk, tmp);
    const rpcBodies = await buildRpcBodies({ repoRoot, outDir: tmp, esbuild: createRequire(path.join(repoRoot, "package.json"))("esbuild") });
    const api = await startMockApi({ serverDelayMs: o.serverDelay, preflightMaxAge: o.preflightMaxAge ?? null, rpcBodies });
    const pages = await startPageServer(tmp, api.origin);
    cleanups.push(() => api.close(), () => pages.close());
    ctx.pageUrl = pages.origin + "/";
    ctx.addSelector = "#perf-add";
    const line = (n) => ({ id: `line-${n + 1}`, productID: PRODUCT_IDS[n], quantity: 1 });
    ctx.seed = JSON.stringify({ country: "PL", products: [line(0)] });
    ctx.seedTwoLines = JSON.stringify({ country: "PL", products: [line(0), line(1)] });
    o.cartSelector = 'button.bitsnap-react[aria-haspopup="dialog"]';
  } else {
    sdkLabel = "the shop's own SDK (see the X-Bitsnap-Client header below)";
    ctx.pageUrl = o.url;
    ctx.addSelector = o.addSelector;
    ctx.seed = undefined;
  }

  cleanups.push(() => ctx.browser?.close());
  const results = [];
  try {
    const browser = await getBrowser(ctx);
    if (o.target === "live") ctx.seed = await seedLiveCart(browser, ctx);
    console.log(`cart-open: target ${o.target} ${ctx.pageUrl}`);
    console.log(`  sdk: ${o.label ?? sdkLabel}`);
    console.log(`  network ${o.network === "none" ? "unthrottled" : "Fast 3G (562.5 ms, 180/84 KB/s)"}, cpu ${o.cpu}x, ${o.warmup} warm-up + ${o.runs} runs, playwright ${version}, ${ctx.browserVersion}`);
    for (const name of o.scenarios) {
      if ((name === "snapshot-reload" || name === "snapshot-offline" || name === "add-then-open") && !ctx.addSelector) {
        console.log(`\n${name}: skipped (needs --add-selector)`);
        continue;
      }
      if (o.target === "live" && HARNESS_ONLY.includes(name)) {
        console.log(`\n${name}: skipped (needs a two-line cart that only the harness seeds)`);
        continue;
      }
      console.log(`\n${name}`);
      const result = await measureScenario(ctx, name);
      results.push(result);
      console.log(`  items visible: p50 ${fmt(result.stats.p50)}  p95 ${fmt(result.stats.p95)}  (min ${fmt(result.stats.min)}, max ${fmt(result.stats.max)}, ${result.stats.failures}/${result.stats.n} failed)`);
      printExtras(result, o);
      printTimeline(result);
    }
  } finally {
    for (const c of cleanups.reverse()) await Promise.resolve(c()).catch(() => {});
  }

  const clients = new Set(results.flatMap((r) => r.runs.flatMap((x) => x.requests.map((q) => q.client)).filter(Boolean)));
  if (clients.size) console.log(`\nobserved X-Bitsnap-Client: ${[...clients].join(", ")}`);

  let failed = false;
  let floor;
  let floorSource;
  if (o.check) {
    // The render floor must come from outside this run: with the run's own `reopen` A1 would compare it with itself + 20.
    if (finite(o.renderFloor)) {
      floor = o.renderFloor;
      floorSource = "--render-floor";
    } else if (finite(o.baselineData?.reopen?.stats?.p95)) {
      floor = o.baselineData.reopen.stats.p95;
      floorSource = `reopen p95 of the baseline ${o.baseline}`;
    } else {
      throw new Error("--check needs the render floor from a baseline: pass --baseline <json with a measured reopen> or --render-floor <ms>");
    }
    console.log(`\ncriteria (render floor ${Math.round(floor)} ms, from ${floorSource}${o.baseline ? "" : "; no --baseline, so A2 and A3 cannot pass"}):`);
    for (const c of criteria(o, results, floor)) {
      console.log(`  ${c.pass ? "PASS" : "FAIL"} ${c.id} ${c.name}: ${c.detail}`);
      if (!c.pass) failed = true;
    }
    console.log(failed ? "\nGATE FAILED" : "\nGATE PASSED");
  }
  if (o.json) {
    fs.writeFileSync(
      o.json,
      JSON.stringify({ scriptVersion: SCRIPT_VERSION, args: { ...o, baselineData: undefined }, sdk: o.label ?? sdkLabel, browser: ctx.browserVersion, playwright: version, observedClients: [...clients], date: new Date().toISOString(), results }, null, 2),
    );
    console.log(`\nresults written to ${o.json}`);
  }
  process.exit(failed ? 1 : 0);
}

/** Live shop: one throw-away context adds a product through the shop's UI and keeps the cart it wrote. */
async function seedLiveCart(browser, ctx) {
  const { o } = ctx;
  if (!ctx.addSelector) return undefined;
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  try {
    const page = await context.newPage();
    await page.goto(ctx.pageUrl, { waitUntil: "load" });
    await page.waitForSelector(o.cartSelector, { state: "attached", timeout: 30000 });
    await dismissBanner(page, o);
    await page.click(ctx.addSelector);
    await page.waitForFunction(() => {
      try {
        return (JSON.parse(localStorage.getItem("checkout") ?? "{}").products ?? []).length > 0;
      } catch {
        return false;
      }
    }, undefined, { timeout: 30000 });
    return await page.evaluate(() => localStorage.getItem("checkout"));
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error(e.stack ?? e);
  process.exit(2);
});
