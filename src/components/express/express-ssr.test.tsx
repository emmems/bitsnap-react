import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToString } from "react-dom/server";
import InPostPayButton from "./InPostPayButton";
import RevolutPayButton from "./RevolutPayButton";

/**
 * Server rendering of the express buttons: no browser APIs, no provider
 * scripts, no clickable button that cannot work. Next.js and Astro render the
 * same tree on the server before hydration.
 */
describe("express buttons on the server", () => {
  it("renders nothing for InPost Pay without a browser", () => {
    const html = renderToString(
      <InPostPayButton projectID="proj" locale="pl-PL" />,
    );
    assert.equal(html, "");
  });

  it("renders no button for Revolut Pay without a browser", () => {
    const html = renderToString(
      <RevolutPayButton projectID="proj" locale="pl-PL" />,
    );
    assert.equal(html.includes("data-bitsnap-express=\"revolutPay\""), true);
    assert.equal(/<button/i.test(html), false);
    assert.equal(html.includes("RevolutCheckout"), false);
    assert.equal(html.includes("script"), false);
  });

  it("needs no project configured to render safely", () => {
    assert.equal(renderToString(<InPostPayButton />), "");
    assert.equal(
      /<button/i.test(renderToString(<RevolutPayButton />)),
      false,
    );
  });
});
