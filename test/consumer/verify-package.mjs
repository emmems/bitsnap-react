import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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

console.log("packaging checks passed");
