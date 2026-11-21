import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCheckoutAppearance, type CheckoutAppearance } from "./appearance.ts";
import { walletArtworkFor } from "./wallet-artwork.ts";

const artwork = (appearance?: CheckoutAppearance) =>
  walletArtworkFor(resolveCheckoutAppearance(appearance));

const ON_DARK = { applePay: "white", googlePay: "white", revolutPay: "light" };
const ON_LIGHT = { applePay: "black", googlePay: "black", revolutPay: "dark" };
const OUTLINED = {
  applePay: "white-outline",
  googlePay: "white",
  revolutPay: "light-outlined",
};

describe("walletArtworkFor", () => {
  it("draws light artwork on the default and the dark theme", () => {
    assert.deepEqual(artwork(), ON_DARK);
    assert.deepEqual(artwork({ theme: "dark" }), ON_DARK);
    assert.deepEqual(artwork({ tokens: { buttonBackground: "#635bff" } }), ON_DARK);
  });

  it("draws dark artwork on the light theme", () => {
    assert.deepEqual(artwork({ theme: "light" }), ON_LIGHT);
  });

  it("reads a hex background, whatever the theme", () => {
    assert.deepEqual(artwork({ tokens: { background: "#fafafa" } }), ON_LIGHT);
    assert.deepEqual(artwork({ tokens: { background: "#fff" } }), ON_LIGHT);
    assert.deepEqual(artwork({ theme: "light", tokens: { background: "#111827" } }), ON_DARK);
    // The background beats a contradicting colorScheme: the artwork sits on it.
    assert.deepEqual(
      artwork({ tokens: { background: "#ffffff", colorScheme: "dark" } }),
      ON_LIGHT,
    );
  });

  it("takes a literal colorScheme when the background cannot be read", () => {
    assert.deepEqual(
      artwork({ tokens: { background: "var(--site-bg)", colorScheme: "light" } }),
      ON_LIGHT,
    );
    assert.deepEqual(
      artwork({ tokens: { background: "rgb(0 0 0)", colorScheme: " Dark " } }),
      ON_DARK,
    );
    assert.deepEqual(artwork({ tokens: { colorScheme: "light" } }), ON_LIGHT);
  });

  it("uses the outlined variants when the panel can be light or dark", () => {
    // The README's "Follow your site's theme" recipe and the shadcn one.
    assert.deepEqual(
      artwork({
        tokens: { background: "var(--site-bg)", colorScheme: "var(--site-scheme)" },
      }),
      OUTLINED,
    );
    assert.deepEqual(artwork({ tokens: { background: "var(--background)" } }), OUTLINED);
    // `theme: "light"` does not say what a `var()` background resolves to.
    assert.deepEqual(
      artwork({ theme: "light", tokens: { background: "var(--background)" } }),
      OUTLINED,
    );
    assert.deepEqual(artwork({ tokens: { background: "white" } }), OUTLINED);
  });
});
