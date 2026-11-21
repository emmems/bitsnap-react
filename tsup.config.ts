import { execSync } from "node:child_process";
import { defineConfig, type Options } from "tsup";
import type { Plugin } from "esbuild";

import { name, version } from "./package.json";

/**
 * The CommonJS `catalog` and `cart` entries need no shim: tsup builds the
 * CommonJS output with splitting too, so they re-export the same shared chunks
 * as `index.js` and a page that mixes `bitsnap-react` and its subpaths has one
 * copy of the cart state (`verify-package.mjs` checks every export is the same
 * value as in the main entry).
 */

/**
 * `bitsnap-react/viewer3d` is ESM only (three and R3F are ESM). The CommonJS
 * build gets a stub that says so; `package.json` exports only `import` for it.
 */
const viewer3dCjsStub: Plugin = {
  name: "viewer3d-cjs-stub",
  setup(build) {
    // With `splitting`, tsup builds CommonJS as ESM and converts it
    // afterwards, so `format` is "esm" in both builds; the output extension
    // tells them apart.
    const extension = build.initialOptions.outExtension?.[".js"] ?? ".js";
    if (build.initialOptions.format === "esm" && extension === ".mjs") {
      return;
    }
    build.onLoad({ filter: /src[\\/]viewer3d[\\/]index\.ts$/ }, () => ({
      loader: "js",
      contents:
        'throw new Error("bitsnap-react/viewer3d is ESM only: use import, not require");',
    }));
  },
};

/**
 * Standalone Bitsnap Consent script for a plain `<script>` tag: no React, no
 * externals, one file in `dist/embed/`. The library config keeps `dist/embed`
 * out of its clean step, because both builds run side by side.
 */
const consentEmbed: Options = {
  entry: { consent: "src/consent/embed.ts" },
  outDir: "dist/embed",
  format: ["iife"],
  globalName: "BitsnapConsentEmbed",
  platform: "browser",
  target: "es2019",
  bundle: true,
  splitting: false,
  dts: false,
  clean: false,
  minify: true,
  sourcemap: false,
  noExternal: [/.*/],
  outExtension: () => ({ js: ".js" }),
};

/**
 * Standalone analytics tracker for a plain `<script>` tag (`data-project`),
 * built like the consent embed: no React, one file in `dist/embed/`.
 */
const analyticsEmbed: Options = {
  ...consentEmbed,
  entry: { analytics: "src/analytics/embed.ts" },
  globalName: "BitsnapAnalyticsEmbed",
};

const liveChatEmbeds: Options = {
  ...consentEmbed,
  entry: {
    "bitsnap-chat": "src/live-chat/loader.ts",
    "bitsnap-chat-panel": "src/live-chat/panel/index.ts",
  },
  globalName: undefined,
  define: { BITSNAP_REACT_EMBED_VERSION: JSON.stringify(version) },
};

/** One watcher for `cart.css` per watch session. */
let cartCssWatcher: { close(): void } | undefined;

export default defineConfig((overrideOptions) => {
  const isWatch = !!overrideOptions.watch;
  const shouldPublish = !!overrideOptions.env?.publish;

  const library: Options = {
    entry: {
      index: "src/index.ts",
      internal: "src/internal.ts",
      errors: "src/errors.ts",
      models: "src/models.ts",
      returns: "src/returns/index.ts",
      contact: "src/contact/index.ts",
      catalog: "src/catalog/index.ts",
      cart: "src/cart/index.ts",
      course: "src/course/index.ts",
      chat: "src/chat/index.ts",
      consent: "src/consent/index.ts",
      analytics: "src/analytics/index.ts",
      viewer3d: "src/viewer3d/index.ts",
    },
    dts: true,
    // Every build: `dist/cart.css` from the hand-written cart stylesheet, also
    // appended to `dist/index.css` (scripts/build-cart-css.mjs). Then publish
    // when asked, so a published package always carries the cart styles.
    onSuccess: async () => {
      const { buildCartCss } = await import("./scripts/build-cart-css.mjs");
      await buildCartCss(__dirname);
      // `cart.css` is not imported, so tsup's watcher skips it: rebuild it on change.
      if (isWatch && !cartCssWatcher) {
        const { watch } = await import("node:fs");
        cartCssWatcher = watch(`${__dirname}/src/components/checkout/cart.css`, () => {
          buildCartCss(__dirname).catch((error) => console.error(error));
        });
      }
      if (shouldPublish) {
        execSync("pnpm publish", { stdio: "inherit" });
      }
    },
    format: ["cjs", "esm"],
    bundle: true,
    // CommonJS entries share chunks like ESM ones do. Separate copies of the
    // configuration, transport and session modules would not see what
    // `setCustomHost`, `setHost` or `setLocale` set through `index.js`.
    splitting: true,
    clean: ["!embed", "!embed/**"],
    minify: true,
    sourcemap: true,
    platform: "browser",
    // three and React Three Fiber are optional peers of `bitsnap-react/viewer3d`.
    external: ["react", "react-dom", /^three($|\/)/, /^@react-three\//],
    esbuildPlugins: [viewer3dCjsStub],
    define: {
      PACKAGE_NAME: `"${name}"`,
      PACKAGE_VERSION: `"${version}"`,
      JS_PACKAGE_VERSION: `"${version}"`,
      __DEV__: `${isWatch}`,
    },
  };

  return [library, consentEmbed, analyticsEmbed, liveChatEmbeds];
});
