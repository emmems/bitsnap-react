// Builds the cart stylesheet (PLAN D5, part 2 step 7a).
//
//   node scripts/build-cart-css.mjs        (also run by tsup's onSuccess)
//
// 1. Minifies the hand-written `src/components/checkout/cart.css` with esbuild
//    into `dist/cart.css`. No Tailwind, no PostCSS, no `.bitsnap-react` prefix:
//    the file's own selectors are its scope.
// 2. Appends the same text to `dist/index.css`, before its source-map comment,
//    so main-entry users get the cart look without a new import. It is not
//    `@import`ed from `global.css`, because the prefixer would rewrite its
//    selectors and the two files would differ. `check-size.mjs` and
//    `test:package` check that `dist/cart.css` is contained verbatim in
//    `dist/index.css`.
//
// Idempotent: the appended block sits between START and END markers and is
// replaced on every run, so a changed `cart.css` never leaves an old copy.
import { transform } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_MAP_COMMENT = /\n?\/\*# sourceMappingURL=[^*]*\*\/\s*$/;
const START = "/* bitsnap-cart:start */";
const END = "/* bitsnap-cart:end */";

export async function buildCartCss(root = resolve(dirname(fileURLToPath(import.meta.url)), "..")) {
  const source = readFileSync(join(root, "src/components/checkout/cart.css"), "utf8");
  const { code } = await transform(source, {
    loader: "css",
    minify: true,
    // Keep modern syntax as written (`inset`, `dvh` after its `vh` fallback, `:where()`).
    target: "esnext",
  });
  const cart = code.trim();
  writeFileSync(join(root, "dist/cart.css"), `${cart}\n`);

  const indexPath = join(root, "dist/index.css");
  let index = readFileSync(indexPath, "utf8");
  const start = index.indexOf(START);
  const end = index.indexOf(END);
  if (start !== -1 && end > start) {
    index = index.slice(0, start) + index.slice(end + END.length);
  }
  const comment = SOURCE_MAP_COMMENT.exec(index);
  const head = comment ? index.slice(0, comment.index) : index.replace(/\s*$/, "");
  const tail = comment ? `\n${comment[0].trim()}\n` : "\n";
  writeFileSync(indexPath, `${head.replace(/\s*$/, "")}\n${START}\n${cart}\n${END}${tail}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildCartCss();
}
