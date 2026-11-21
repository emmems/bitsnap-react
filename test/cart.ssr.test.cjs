const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToString } = require("react-dom/server");

/*
 * `bitsnap-react/cart` renders on the server like the main entry: the trigger
 * is plain markup, nothing is fetched, nothing reads `window` or `localStorage`.
 */

function withoutFetch(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("the server render must not fetch");
  };
  try {
    return fn();
  } finally {
    globalThis.fetch = original;
  }
}

const render = (BitsnapCheckout, props = {}) =>
  withoutFetch(() =>
    renderToString(React.createElement(BitsnapCheckout, { projectID: "project-id", locale: "en", ...props })),
  );

test("CommonJS bitsnap-react/cart renders the cart trigger on the server", () => {
  const { BitsnapCheckout } = require("../dist/cart.js");
  const html = render(BitsnapCheckout);
  assert.match(html, /data-bitsnap-checkout-trigger/);
  assert.match(html, /aria-label="Open cart"/);
  assert.doesNotMatch(html, /role="dialog"/);
});

test("ESM bitsnap-react/cart renders the same markup as the main entry", async () => {
  const cart = await import("../dist/cart.mjs");
  const main = await import("../dist/index.mjs");
  assert.equal(cart.BitsnapCheckout, main.BitsnapCheckout);
  assert.equal(render(cart.BitsnapCheckout), render(main.BitsnapCheckout));
});

test("a merchant className replaces the default trigger styling on the server too", () => {
  const { BitsnapCheckout } = require("../dist/cart.js");
  const html = render(BitsnapCheckout, { className: "shop-cart-button" });
  assert.match(html, /shop-cart-button/);
  assert.match(html, /data-bitsnap-checkout-trigger="custom"/);
});
