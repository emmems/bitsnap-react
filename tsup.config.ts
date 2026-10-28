import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

import { name, version } from "./package.json";

/**
 * Runtime exports of `src/catalog/index.ts` (see `verify-package.mjs`, which
 * checks that this list matches the ESM entry).
 */
const CATALOG_EXPORTS = [
  "ProductList",
  "useProducts",
  "formatProductPrice",
  "PRODUCT_LIST_SLOT_NAMES",
];

/**
 * The CommonJS `catalog` entry is a thin re-export of `./index.js`. Bundling
 * it separately would give CommonJS consumers a second copy of the cart
 * state, constants and stores next to the one in `index.js`. (ESM shares
 * chunks between entries, so it stays lean.)
 */
const catalogCjsShim: Plugin = {
  name: "catalog-cjs-shim",
  setup(build) {
    if (build.initialOptions.format !== "cjs") {
      return;
    }
    build.onLoad({ filter: /src[\\/]catalog[\\/]index\.ts$/ }, () => ({
      loader: "js",
      resolveDir: __dirname,
      contents: [
        'Object.defineProperty(exports,"__esModule",{value:true});',
        'var m=require("./index.js");',
        ...CATALOG_EXPORTS.map((name) => `exports.${name}=m.${name};`),
      ].join("\n"),
    }));
    build.onResolve({ filter: /^\.\/index\.js$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

export default defineConfig((overrideOptions) => {
  const isWatch = !!overrideOptions.watch;
  const shouldPublish = !!overrideOptions.env?.publish;

  return {
    entry: {
      index: "src/index.ts",
      internal: "src/internal.ts",
      errors: "src/errors.ts",
      models: "src/models.ts",
      returns: "src/returns/index.ts",
      catalog: "src/catalog/index.ts",
      course: "src/course/index.ts",
    },
    dts: true,
    onSuccess: shouldPublish ? "pnpm publish" : undefined,
    format: ["cjs", "esm"],
    bundle: true,
    // CommonJS entries share chunks like ESM ones do. Separate copies of the
    // configuration, transport and session modules would not see what
    // `setCustomHost`, `setHost` or `setLocale` set through `index.js`.
    splitting: true,
    clean: true,
    minify: true,
    sourcemap: true,
    platform: "browser",
    external: ["react", "react-dom"],
    esbuildPlugins: [catalogCjsShim],
    define: {
      PACKAGE_NAME: `"${name}"`,
      PACKAGE_VERSION: `"${version}"`,
      JS_PACKAGE_VERSION: `"${version}"`,
      __DEV__: `${isWatch}`,
    },
  };
});
