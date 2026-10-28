import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/**
 * Packaging check for the built output.
 *
 * Run after `pnpm build`: it verifies the declaration files, the CSS subpath and
 * the legacy runtime exports, plus that the checkout appearance rules survived
 * bundling without being rewritten into `.bitsnap-react` descendant selectors.
 */

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = join(packageRoot, "dist");
const packageJSON = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
);

/**
 * Source of a dist file plus every `chunk-*` file it imports or requires,
 * followed transitively. Returns the concatenated text and the files read.
 */
function readWithChunks(file) {
  const seen = new Set();
  const queue = [file];
  const texts = [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (seen.has(current)) continue;
    seen.add(current);
    const text = readFileSync(join(dist, current), "utf8");
    texts.push(text);
    const base = dirname(current);
    for (const match of text.matchAll(/(?:from\s*|import\s*\(\s*|require\(\s*|import\s*)["'](\.{1,2}\/[^"']*chunk-[^"']+)["']/g)) {
      queue.push(join(base, match[1]));
    }
  }
  return { text: texts.join("\n"), files: [...seen] };
}

const requiredFiles = [
  "index.js",
  "index.mjs",
  "index.d.ts",
  "index.d.mts",
  "index.css",
  "models.d.ts",
  "internal.d.ts",
  "errors.d.ts",
  "catalog.js",
  "catalog.mjs",
  "catalog.d.ts",
  "catalog.d.mts",
  "course.js",
  "course.mjs",
  "course.d.ts",
  "course.d.mts",
  "consent.js",
  "consent.mjs",
  "consent.d.ts",
  "consent.d.mts",
  "embed/consent.js",
  "analytics.js",
  "analytics.mjs",
  "analytics.d.ts",
  "analytics.d.mts",
  "embed/analytics.js",
];

for (const file of requiredFiles) {
  assert.ok(
    existsSync(join(dist, file)),
    `missing build output: dist/${file} (run "pnpm build" first)`,
  );
}

for (const [subpath, entry] of Object.entries(packageJSON.exports)) {
  const targets =
    typeof entry === "string"
      ? [entry]
      : Object.values(entry).flat().filter((target) => typeof target === "string");

  for (const target of targets) {
    assert.ok(
      existsSync(join(packageRoot, target)),
      `package export "${subpath}" points at a missing file: ${target}`,
    );
  }
}

assert.ok(packageJSON.sideEffects.includes("*.css"));

const legacyExports = [
  "BitsnapCheckout",
  "ApplePayButton",
  "GooglePayButton",
  "NotificationsComponent",
  "setProjectID",
  "getLocale",
  "setLocale",
  "setCustomHost",
  "createCheckout",
  "createPaymentURL",
  "Panel",
  "PanelLogin",
  "PanelProvider",
  "PublicOrderPage",
  "setTheme",
  "setHost",
  "setLoginURL",
];

const built = await import(join(dist, "index.mjs"));

for (const name of legacyExports) {
  assert.equal(typeof built[name], "function", `missing export: ${name}`);
}

assert.equal(typeof built.Bitsnap, "object", "missing export: Bitsnap");

for (const method of ["addProductToCart", "showCart", "hideCart"]) {
  assert.equal(
    typeof built.Bitsnap[method],
    "function",
    `missing export: Bitsnap.${method}`,
  );
}

const catalogNames = [
  "ProductList",
  "useProducts",
  "formatProductPrice",
];

for (const [file, kind] of [
  ["index.mjs", "esm"],
  ["catalog.mjs", "esm"],
  ["index.js", "cjs"],
  ["catalog.js", "cjs"],
]) {
  const target = join(dist, file);
  const loaded =
    kind === "esm" ? await import(target) : createRequire(import.meta.url)(target);
  for (const name of catalogNames) {
    assert.equal(
      typeof loaded[name],
      "function",
      `missing catalog export ${name} in dist/${file}`,
    );
  }
}

// The CommonJS catalog entry re-exports index.js, so both share one module
// instance (cart state, constants, stores) instead of two bundled copies.
{
  const require = createRequire(import.meta.url);
  const cjsIndex = require(join(dist, "index.js"));
  const cjsCatalog = require(join(dist, "catalog.js"));
  const esmCatalog = await import(join(dist, "catalog.mjs"));
  for (const name of Object.keys(cjsCatalog).filter((key) => key !== "__esModule")) {
    assert.strictEqual(
      cjsCatalog[name],
      cjsIndex[name],
      `dist/catalog.js ${name} is not the same instance as dist/index.js`,
    );
  }
  assert.deepEqual(
    Object.keys(cjsCatalog).filter((key) => key !== "__esModule").sort(),
    Object.keys(esmCatalog).sort(),
    "dist/catalog.js exports differ from dist/catalog.mjs",
  );
  assert.ok(
    readFileSync(join(dist, "catalog.js"), "utf8").length < 2000,
    "dist/catalog.js must be a thin re-export of index.js",
  );
}

// The ESM catalog entry must not load the checkout up front: the cart is a
// dynamic import that only runs on the first "Add to cart" click.
const catalogEsm = readFileSync(join(dist, "catalog.mjs"), "utf8");
assert.ok(
  !/from"\.\/(CartProvider|methods)-/.test(catalogEsm),
  "dist/catalog.mjs imports the checkout statically",
);

// The course view is a subpath that `Panel` loads on demand: the main ESM
// entry must reach it only through a dynamic import, so the video player,
// the sanitizer and the tests stay out of the main bundle.
{
  const courseNames = [
    "PanelCourse",
    "createRpcCourseDataSource",
    "createCourseDataSource",
    "sanitizeLessonHtml",
    "getCourseTexts",
    "CourseError",
  ];
  const require = createRequire(import.meta.url);
  const esmCourse = await import(join(dist, "course.mjs"));
  const cjsCourse = require(join(dist, "course.js"));
  for (const name of courseNames) {
    assert.equal(typeof esmCourse[name], "function", `missing course export ${name} in dist/course.mjs`);
    assert.equal(typeof cjsCourse[name], "function", `missing course export ${name} in dist/course.js`);
  }

  const indexEsm = readFileSync(join(dist, "index.mjs"), "utf8");
  const chunks = [...indexEsm.matchAll(/from"\.\/(chunk-[\w-]+\.mjs)"/g)].map(
    (match) => readFileSync(join(dist, match[1]), "utf8"),
  );
  const mainBundle = [indexEsm, ...chunks].join("\n");
  assert.ok(
    /import\("\.\/course\.mjs"\)/.test(mainBundle),
    "Panel does not load the course view through import(\"./course.mjs\")",
  );
  assert.ok(
    !mainBundle.includes("data-bitsnap-course"),
    "the course view is part of the main ESM bundle",
  );

  const courseDeclaration = readFileSync(join(dist, "course.d.ts"), "utf8");
  for (const name of ["PanelCourseProps", "CourseDataSource", "createRpcCourseDataSource"]) {
    assert.match(courseDeclaration, new RegExp(name), `dist/course.d.ts lacks ${name}`);
  }
}

// The CommonJS course entry shares the configuration, transport and session
// modules with the main entry: what a CommonJS consumer sets through
// `bitsnap-react` has to reach the default data source of the course view.
{
  const require = createRequire(import.meta.url);
  const main = require(join(dist, "index.js"));
  const cjsCourse = require(join(dist, "course.js"));
  const host = "https://lms.example.test";
  const panelHost = "https://panel.example.test";
  const token = "panel-session-token-for-test";

  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.window = {
    localStorage: {
      getItem: (key) =>
        key === `bitsnap-panel-session:${encodeURIComponent(panelHost)}:${encodeURIComponent("project-1")}`
          ? token
          : null,
      setItem() {},
      removeItem() {},
    },
  };
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({
      url: request.url,
      body: Buffer.from(await request.arrayBuffer()).toString("latin1"),
    });
    throw new Error("stop after the first request");
  };
  const log = console.log;
  console.log = () => {};
  try {
    main.setCustomHost(host);
    main.setPanelProjectID("project-1");
    main.setHost(panelHost);
    await cjsCourse
      .createRpcCourseDataSource({ accessId: "access-1" })
      .getCourse()
      .catch(() => {});
  } finally {
    console.log = log;
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }

  assert.equal(requests.length, 1, "the course data source sent no request");
  assert.ok(
    requests[0].url.startsWith(`${host}/api/rpc/`),
    `dist/course.js ignores the host set through dist/index.js: ${requests[0].url}`,
  );
  assert.ok(
    requests[0].body.includes(token),
    "dist/course.js did not find the panel session set up through dist/index.js",
  );
}

// Bitsnap Consent: the subpath renders nothing on the server and does not touch
// the DOM on import; the standalone script is self-contained and small.
{
  const require = createRequire(import.meta.url);
  const { renderToString } = require("react-dom/server");
  const { createElement } = require("react");
  const consentNames = ["BitsnapConsent", "useConsent", "createConsent", "mergeConfig", "mergeTexts"];
  const esmConsent = await import(join(dist, "consent.mjs"));
  const cjsConsent = require(join(dist, "consent.js"));
  for (const name of consentNames) {
    assert.equal(typeof esmConsent[name], "function", `missing consent export ${name} in dist/consent.mjs`);
    assert.equal(typeof cjsConsent[name], "function", `missing consent export ${name} in dist/consent.js`);
  }
  assert.equal(renderToString(createElement(cjsConsent.BitsnapConsent, { projectKey: "pk" })), "");

  const embed = readFileSync(join(dist, "embed/consent.js"));
  const embedText = embed.toString("utf8");
  assert.ok(!/require\(|from"react/.test(embedText), "dist/embed/consent.js must not import anything");
  assert.ok(!embedText.includes("react-dom"), "dist/embed/consent.js must not bundle React");
  const gzipped = gzipSync(embed, { level: 9 }).length;
  assert.ok(gzipped < 12 * 1024, `dist/embed/consent.js is ${gzipped} bytes gzipped (limit 12288)`);
}

// Merchant analytics: the subpath is inert on the server, nothing in it or in
// the standalone script touches cookies or Web Storage, and the script stays small.
{
  const require = createRequire(import.meta.url);
  const { renderToString } = require("react-dom/server");
  const { createElement } = require("react");
  const analyticsNames = [
    "createTracker",
    "initTracker",
    "getTracker",
    "resetTracker",
    "BitsnapAnalyticsProvider",
    "useAnalytics",
    "InstrumentProvider",
    "useInstrument",
    "useInstrumentContext",
    "scoreBucket",
  ];
  const esmAnalytics = await import(join(dist, "analytics.mjs"));
  const cjsAnalytics = require(join(dist, "analytics.js"));
  for (const name of analyticsNames) {
    assert.equal(typeof esmAnalytics[name], "function", `missing analytics export ${name} in dist/analytics.mjs`);
    assert.equal(typeof cjsAnalytics[name], "function", `missing analytics export ${name} in dist/analytics.js`);
  }
  const tree = (analytics) =>
    createElement(
      analytics.BitsnapAnalyticsProvider,
      { projectKey: "Ab12Cd" },
      createElement("p", null, "child"),
    );
  assert.equal(renderToString(tree(cjsAnalytics)), "<p>child</p>");
  assert.equal(renderToString(tree(esmAnalytics)), "<p>child</p>");
  const outside = cjsAnalytics.useAnalytics;
  assert.equal(typeof outside, "function");

  const declaration = readFileSync(join(dist, "analytics.d.ts"), "utf8");
  for (const name of ["BitsnapAnalyticsProviderProps", "TrackerOptions", "EventProps"]) {
    assert.match(declaration, new RegExp(name), `dist/analytics.d.ts lacks ${name}`);
  }

  const embed = readFileSync(join(dist, "embed/analytics.js"));
  const embedText = embed.toString("utf8");
  assert.ok(!/require\(|from"react/.test(embedText), "dist/embed/analytics.js must not import anything");
  assert.ok(!embedText.includes("react-dom"), "dist/embed/analytics.js must not bundle React");
  for (const file of ["embed/analytics.js", "analytics.mjs", "analytics.js"]) {
    // The entries can be thin stubs that import `chunk-*` files: scan those too.
    const { text, files } = readWithChunks(file);
    assert.ok(
      !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(text),
      `dist/${file} (with ${files.join(", ")}) refers to cookies or Web Storage`,
    );
    if (file !== "embed/analytics.js") {
      assert.ok(files.length > 1, `dist/${file} imports no chunk: the scan would miss the tracker code`);
    }
  }
  const gzipped = gzipSync(embed, { level: 9 }).length;
  assert.ok(gzipped < 8 * 1024, `dist/embed/analytics.js is ${gzipped} bytes gzipped (limit 8192)`);
}

const returnsNames = [
  // 1.6.0 names
  "BitsnapReturns",
  "BitsnapReturnsProvider",
  "useCreateReturn",
  "useMyReturns",
  "useReturnableOrder",
  "useReturnOrders",
  "useReturnSession",
  // new API
  "ReturnsProvider",
  "ReturnsEmailStep",
  "ReturnsCodeStep",
  "ReturnsOrderList",
  "ReturnsOrderDetail",
  "ReturnsConfirmation",
  "ReturnsResult",
  "ReturnsMyReturnsList",
  "ReturnsMyReturnDetail",
  "useMyReturn",
  "ReturnsAppearanceProvider",
  "useReturnsAppearance",
  "useReturnsText",
];

const returnsEntries = [
  ["index.mjs", "esm"],
  ["returns.mjs", "esm"],
  ["index.js", "cjs"],
  ["returns.js", "cjs"],
];

for (const [file, kind] of returnsEntries) {
  const target = join(dist, file);
  const loaded =
    kind === "esm" ? await import(target) : createRequire(import.meta.url)(target);
  for (const name of returnsNames) {
    assert.equal(
      typeof loaded[name],
      "function",
      `missing returns export ${name} in dist/${file}`,
    );
  }
  assert.ok(
    loaded.Environment != null &&
      loaded.Environment.PRODUCTION === 0 &&
      loaded.Environment.TEST === 1,
    `missing Environment enum in dist/${file}`,
  );
  assert.equal(
    typeof loaded.RETURNS_SLOT_NAMES === "object" && loaded.RETURNS_SLOT_NAMES != null,
    true,
    `missing RETURNS_SLOT_NAMES in dist/${file}`,
  );
}

for (const file of ["index.d.ts", "returns.d.ts"]) {
  const text = readFileSync(join(dist, file), "utf8");
  assert.match(text, /BitsnapReturnsProps/, `dist/${file} lacks BitsnapReturnsProps`);
  assert.match(text, /BitsnapReturnsProviderProps/, `dist/${file} lacks BitsnapReturnsProviderProps`);
}

const declaration = readFileSync(join(dist, "index.d.ts"), "utf8");

assert.match(
  declaration,
  /appearance\?: CheckoutAppearance/,
  "BitsnapCartProps is missing the appearance prop",
);
assert.match(
  declaration,
  /type CheckoutAppearanceTokens = \{/,
  "CheckoutAppearanceTokens is not exported",
);
assert.match(
  declaration,
  /type CheckoutSlotName =/,
  "CheckoutSlotName is not exported",
);

const css = readFileSync(join(dist, "index.css"), "utf8");

assert.match(
  css,
  /@layer components\{\[data-bitsnap-checkout\]/,
  "checkout appearance rules are missing or no longer in the components layer",
);
assert.ok(
  !css.includes(".bitsnap-react [data-bitsnap-checkout"),
  "checkout appearance rules must not be rewritten into descendant selectors",
);
assert.ok(
  css.includes("--bitsnap-checkout-button-background"),
  "checkout tokens are missing from the packaged CSS",
);

assert.ok(
  css.includes("[data-bitsnap-returns"),
  "returns appearance rules are missing from the packaged CSS",
);
assert.ok(
  !css.includes(".bitsnap-react [data-bitsnap-returns"),
  "returns appearance rules must not be rewritten into descendant selectors",
);

console.log("packaging checks passed");
