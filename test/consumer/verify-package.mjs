import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

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
