const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToString } = require("react-dom/server");
const bitsnap = require("../dist/index.js");

/**
 * Server rendering of the express buttons from the packaged build, the way a
 * Next.js server component tree or an Astro SSR island renders them: no
 * browser globals, no provider script, no clickable button that cannot work.
 */

function withoutBrowser(fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("the server render must not fetch");
  };
  try {
    return fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("express buttons are exported from the main entry", () => {
  assert.equal(typeof bitsnap.InPostPayButton, "function");
  assert.equal(typeof bitsnap.RevolutPayButton, "function");
});

test("InPost Pay renders nothing on the server", () => {
  const html = withoutBrowser(() =>
    renderToString(
      React.createElement(bitsnap.InPostPayButton, {
        projectID: "project-a",
        productId: "variant-1",
        quantity: 1,
        locale: "pl-PL",
      }),
    ),
  );
  assert.equal(html, "");
});

test("Revolut Pay renders no button or script on the server", () => {
  const html = withoutBrowser(() =>
    renderToString(
      React.createElement(bitsnap.RevolutPayButton, {
        projectID: "project-a",
        items: [{ id: "variant-1", quantity: 1 }],
        locale: "en-US",
      }),
    ),
  );
  assert.doesNotMatch(html, /<button/i);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /RevolutCheckout/);
  assert.match(html, /data-bitsnap-express="revolutPay"/);
});

test("the checkout drawer renders with the express area empty on the server", () => {
  const html = withoutBrowser(() =>
    renderToString(
      React.createElement(bitsnap.BitsnapCheckout, {
        projectID: "project-a",
        locale: "pl-PL",
        analytics: false,
      }),
    ),
  );
  // The trigger button is server-rendered (existing behaviour); the drawer is
  // a portal and the express area needs availability, so neither appears.
  assert.doesNotMatch(html, /data-bitsnap-express/);
  assert.doesNotMatch(html, /inpost-izi-button/);
});
