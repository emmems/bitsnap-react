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
  "viewer3d.mjs",
  "viewer3d.d.mts",
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
  "InPostPayButton",
  "RevolutPayButton",
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
  // 13 KB since 1.16.0: the fade-in/out (1.15.0) took the script to ~12.6 KB.
  assert.ok(gzipped < 13 * 1024, `dist/embed/consent.js is ${gzipped} bytes gzipped (limit 13312)`);
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

// 3D viewer: `bitsnap-react/viewer3d` is ESM only and the only entry that can
// reach three / React Three Fiber, and only through a dynamic import. The main
// and catalog entries must never reach them, statically or dynamically.
{
  const THREE_IMPORT = /(?:from\s*|import\s*\(\s*|require\(\s*|import\s*)["'](?:three(?:\/[^"']*)?|@react-three\/[^"']+)["']/;

  /** Files reachable from `file` through relative imports (static, or static + dynamic). */
  function reachable(file, { dynamic }) {
    const seen = new Set();
    const queue = [file];
    while (queue.length > 0) {
      const current = queue.shift();
      if (seen.has(current)) continue;
      seen.add(current);
      const text = readFileSync(join(dist, current), "utf8");
      const pattern = dynamic
        ? /(?:from\s*|import\s*\(\s*|require\(\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/g
        : /(?:from\s*|require\(\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/g;
      for (const match of text.matchAll(pattern)) {
        if (/\.css$/.test(match[1])) continue;
        queue.push(join(dirname(current), match[1]));
      }
    }
    return [...seen];
  }
  const reachesThree = (files) =>
    files.filter((file) => THREE_IMPORT.test(readFileSync(join(dist, file), "utf8")));

  for (const entry of ["index.mjs", "catalog.mjs", "index.js", "catalog.js"]) {
    const files = reachable(entry, { dynamic: true });
    assert.deepEqual(
      reachesThree(files),
      [],
      `dist/${entry} reaches three or @react-three (${files.length} files checked)`,
    );
    assert.ok(
      !files.some((file) => /^viewer3d|Viewer3D-/.test(file)),
      `dist/${entry} reaches the 3D viewer`,
    );
  }

  const viewerStatic = reachable("viewer3d.mjs", { dynamic: false });
  assert.deepEqual(
    reachesThree(viewerStatic),
    [],
    "dist/viewer3d.mjs imports three statically: it must stay behind import()",
  );
  const viewerAll = reachable("viewer3d.mjs", { dynamic: true });
  assert.ok(
    reachesThree(viewerAll).some((file) => /^Viewer3D-/.test(file)),
    "the lazy Viewer3D chunk of dist/viewer3d.mjs does not import three",
  );

  // ESM only: no `require` condition, and the CommonJS file only says so.
  const viewerExport = packageJSON.exports["./viewer3d"];
  assert.ok(viewerExport.import, "package.json exports ./viewer3d without import");
  assert.equal(viewerExport.require, undefined, "./viewer3d must be ESM only");
  for (const peer of ["three", "@react-three/fiber", "@react-three/drei"]) {
    assert.ok(packageJSON.peerDependencies[peer], `missing peer dependency ${peer}`);
    assert.equal(
      packageJSON.peerDependenciesMeta?.[peer]?.optional,
      true,
      `peer dependency ${peer} must be optional`,
    );
  }

  const viewer = await import(join(dist, "viewer3d.mjs"));
  for (const name of ["Product3DViewer", "Model3DViewer", "useProduct3DModel", "formatModelSize"]) {
    assert.equal(typeof viewer[name], "function", `missing viewer3d export ${name}`);
  }
  assert.equal(viewer.AUTO_LOAD_MAX_BYTES, 10 * 1024 * 1024);

  // The server render shows the poster and never loads three.
  const { renderToString } = await import("react-dom/server");
  const { createElement } = await import("react");
  const html = renderToString(
    createElement(viewer.Model3DViewer, {
      model: {
        previewUrl: "https://files.example.test/m.glb",
        previewSize: 24 * 1024 * 1024,
        thumbnailUrl: "https://files.example.test/t.webp",
        illustrative: true,
      },
      productName: "Figurka",
    }),
  );
  assert.match(html, /data-bitsnap-viewer3d/);
  assert.match(html, /t\.webp/);
  assert.match(html, /Model 3D jest poglądowy/);
  assert.equal(renderToString(createElement(viewer.Product3DViewer, { productId: "prodv2_x", projectID: "p" })), "");

  const declaration = readFileSync(join(dist, "viewer3d.d.mts"), "utf8");
  for (const name of ["Product3DViewerProps", "UseProduct3DModelResult", "Model3DView", "Viewer3DCopy"]) {
    assert.match(declaration, new RegExp(name), `dist/viewer3d.d.mts lacks ${name}`);
  }
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

// Express checkout: the two provider buttons are public, render nothing
// clickable on the server and load provider scripts only in the browser.
{
  const require = createRequire(import.meta.url);
  const { renderToString } = require("react-dom/server");
  const { createElement } = require("react");

  assert.equal(
    renderToString(createElement(built.InPostPayButton, { projectID: "p" })),
    "",
    "InPostPayButton renders on the server",
  );
  const revolutHtml = renderToString(
    createElement(built.RevolutPayButton, { projectID: "p" }),
  );
  assert.ok(
    !/<button/i.test(revolutHtml),
    "RevolutPayButton renders a clickable button before the SDK loads",
  );

  const expressBundle = readWithChunks("index.mjs");
  assert.ok(
    !/from"@inpost-pay\/widget"/.test(expressBundle.text),
    "the InPost widget is imported statically into the main entry",
  );
  assert.ok(
    /import\("@inpost-pay\/widget"\)/.test(expressBundle.text),
    "the InPost widget is not loaded lazily",
  );

  const expressDeclaration = readFileSync(join(dist, "index.d.ts"), "utf8");
  for (const name of ["InPostPayButtonProps", "RevolutPayButtonProps"]) {
    assert.match(
      expressDeclaration,
      new RegExp(name),
      `dist/index.d.ts lacks ${name}`,
    );
  }
}

console.log("packaging checks passed");
