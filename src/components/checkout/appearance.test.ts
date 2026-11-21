import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHECKOUT_SLOT_NAMES,
  CHECKOUT_THEME_PRESETS,
  CHECKOUT_TOKEN_VARIABLES,
  colorSchemeFor,
  getCheckoutSlotAppearance,
  resolveCheckoutAppearance,
} from "./appearance.ts";

describe("resolveCheckoutAppearance", () => {
  it("keeps the current presentation when appearance is omitted", () => {
    const resolved = resolveCheckoutAppearance();

    assert.equal(resolved.theme, "dark");
    assert.equal(resolved.isCustomized, false);
    assert.deepEqual(resolved.tokens, {});
    assert.deepEqual(resolved.elements, {});
    assert.equal(resolved.boundaryClassName, "dark");
    assert.deepEqual(resolved.boundaryStyle, {});
    assert.deepEqual(resolved.boundaryAttributes, {});
  });

  it("treats an empty appearance like an omitted one", () => {
    assert.deepEqual(
      resolveCheckoutAppearance({}).boundaryStyle,
      resolveCheckoutAppearance().boundaryStyle,
    );
    assert.equal(resolveCheckoutAppearance({}).isCustomized, false);
    assert.equal(resolveCheckoutAppearance({ theme: "dark" }).theme, "dark");
  });

  it("only writes the tokens that were provided", () => {
    const resolved = resolveCheckoutAppearance({
      tokens: { buttonBackground: "#635bff" },
    });

    assert.equal(resolved.isCustomized, true);
    assert.equal(resolved.tokens.buttonBackground, "#635bff");

    const style = resolved.boundaryStyle as Record<string, string>;

    assert.equal(style["--bitsnap-checkout-button-background"], "#635bff");

    const appliedTokens = Object.keys(style).filter((key) =>
      key.startsWith("--bitsnap-checkout-"),
    );

    assert.equal(appliedTokens.length, 1);
    assert.equal(appliedTokens[0], "--bitsnap-checkout-button-background");
  });

  it("drops tokens that are explicitly undefined", () => {
    const resolved = resolveCheckoutAppearance({
      tokens: { background: undefined, radius: "12px" },
    });

    assert.deepEqual(Object.keys(resolved.tokens), ["radius"]);
    assert.equal(
      (resolved.boundaryStyle as Record<string, string>)["--bitsnap-checkout-radius"],
      "12px",
    );
  });

  it("applies the light preset and lets tokens override it", () => {
    const resolved = resolveCheckoutAppearance({
      theme: "light",
      tokens: { buttonBackground: "#635bff", buttonForeground: "#ffffff" },
    });

    assert.equal(resolved.theme, "light");
    assert.equal(resolved.boundaryClassName, "light");
    assert.equal(resolved.tokens.background, "#ffffff");
    assert.equal(resolved.tokens.buttonBackground, "#635bff");
    assert.equal(resolved.tokens.buttonForeground, "#ffffff");
  });

  it("keeps the dark theme free of invented values", () => {
    const resolved = resolveCheckoutAppearance({ theme: "dark" });

    assert.equal(resolved.isCustomized, true);
    assert.deepEqual(resolved.tokens, {});
    assert.deepEqual(resolved.boundaryStyle, {});
  });

  it("maps tokens onto the shared shadcn variables of the dropdown", () => {
    const resolved = resolveCheckoutAppearance({
      tokens: { surface: "#f9fafb", foreground: "#18181b" },
    });

    const style = resolved.boundaryStyle as Record<string, string>;

    // The country dropdown renders `bg-popover` outside of the checkout root,
    // so the shared variables have to travel with the boundary.
    assert.equal(style["--popover"], "#f9fafb");
    assert.equal(style["--popover-foreground"], "#18181b");
    assert.equal(style["--bitsnap-checkout-surface"], "#f9fafb");
  });

  it("exposes radius and focus ring through the shared variables", () => {
    const resolved = resolveCheckoutAppearance({
      tokens: { radius: "12px", focusRing: "#635bff" },
    });

    const style = resolved.boundaryStyle as Record<string, string>;

    assert.equal(style["--radius"], "12px");
    assert.equal(style["--ring"], "#635bff");
    assert.equal(style["--bitsnap-checkout-radius"], "12px");
    assert.equal(style["--bitsnap-checkout-focus-ring"], "#635bff");
  });

  it("is customized when only elements are provided", () => {
    const resolved = resolveCheckoutAppearance({
      elements: { checkoutButton: { className: "store-checkout-button" } },
    });

    assert.equal(resolved.isCustomized, true);
    assert.deepEqual(resolved.boundaryStyle, {});
    assert.equal(
      getCheckoutSlotAppearance(resolved, "checkoutButton")?.className,
      "store-checkout-button",
    );
    assert.equal(getCheckoutSlotAppearance(resolved, "title"), undefined);
  });
});

describe("checkout color-scheme (N10)", () => {
  const scheme = (appearance: Parameters<typeof resolveCheckoutAppearance>[0]) =>
    resolveCheckoutAppearance(appearance).boundaryStyle.colorScheme;

  it("follows the effective background token, a preset value included", () => {
    assert.equal(scheme({ tokens: { background: "#ffffff" } }), "light");
    assert.equal(scheme({ tokens: { background: "#111111" } }), "dark");
    assert.equal(scheme({ tokens: { background: "#fff" } }), "light");
    assert.equal(scheme({ theme: "light" }), "light");
    assert.equal(scheme({ theme: "light", tokens: { background: "#111111" } }), "dark");
  });

  it("writes nothing for a value it cannot read, or without a background", () => {
    assert.equal(scheme(undefined), undefined);
    assert.equal(scheme({ theme: "dark" }), undefined);
    for (const background of ["rgb(255 255 255)", "var(--host-bg)", "white", "#ffffff80", "oklch(1 0 0)"]) {
      assert.equal(scheme({ tokens: { background } }), undefined, background);
    }
  });

  it("matches the onColor rule of the consent module for every colour", async () => {
    const { onColor } = await import("@/src/consent/core/contrast");
    for (let step = 0; step < 4096; step += 1) {
      // A grid over the RGB cube, plus the neighbourhood of the switch point.
      const channel = (shift: number) => ((step >> shift) & 15) * 17;
      const hex = `#${[channel(8), channel(4), channel(0)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      const expected = onColor(hex) === "#ffffff" ? "dark" : "light";
      assert.equal(colorSchemeFor(hex), expected, hex);
    }
    for (let grey = 0x70; grey <= 0x80; grey += 1) {
      const hex = `#${grey.toString(16).repeat(3)}`;
      assert.equal(colorSchemeFor(hex), onColor(hex) === "#ffffff" ? "dark" : "light", hex);
    }
  });

  it("drops the overlay from the light preset, so cart.css keeps the light literal (N01)", () => {
    assert.equal("overlay" in CHECKOUT_THEME_PRESETS.light, false);
  });
});

describe("checkout slots", () => {
  it("covers every documented slot", () => {
    for (const slot of [
      "root",
      "overlay",
      "panel",
      "header",
      "title",
      "closeButton",
      "productList",
      "lines",
      "product",
      "productImage",
      "productName",
      "productPrice",
      "quantityControl",
      "quantityInput",
      "quantityButton",
      "removeButton",
      "options",
      "footer",
      "productVariant",
      "productUnitPrice",
      "summary",
      "totalLabel",
      "totalValue",
      "deliveryText",
      "summaryNote",
      "countryLabel",
      "countryTrigger",
      "countryDropdown",
      "countrySearch",
      "countryOption",
      "paymentButtons",
      "checkoutButton",
      "emptyState",
      "error",
      "skeleton",
    ]) {
      assert.ok(
        CHECKOUT_SLOT_NAMES.includes(slot as never),
        `${slot} is not a known slot`,
      );
    }
  });

  it("has a custom property for every token", () => {
    const resolved = resolveCheckoutAppearance({
      tokens: {
        fontFamily: "Inter",
        fontSize: "14px",
        background: "#fff",
        surface: "#eee",
        foreground: "#111",
        mutedForeground: "#555",
        border: "#ddd",
        buttonBackground: "#000",
        buttonForeground: "#fff",
        buttonHoverBackground: "#111",
        hoverSurface: "#eee",
        focusRing: "#888",
        error: "#c00",
        overlay: "rgb(0 0 0 / 0.3)",
        radius: "8px",
        sale: "#f87171",
        panelWidth: "28rem",
        motionDuration: "200ms",
      },
    });

    for (const variable of Object.values(CHECKOUT_TOKEN_VARIABLES)) {
      assert.equal(
        (resolved.boundaryStyle as Record<string, string>)[variable],
        (resolved.tokens as Record<string, string>)[
          Object.entries(CHECKOUT_TOKEN_VARIABLES).find(
            ([, name]) => name === variable,
          )![0]
        ],
        `${variable} is not applied to the boundary`,
      );
    }
  });
});

describe("1.31.0 tokens: sale, panelWidth, motionDuration", () => {
  it("maps the new tokens to their CSS variables", () => {
    assert.equal(CHECKOUT_TOKEN_VARIABLES.sale, "--bitsnap-checkout-sale");
    assert.equal(CHECKOUT_TOKEN_VARIABLES.panelWidth, "--bitsnap-checkout-panel-width");
    assert.equal(
      CHECKOUT_TOKEN_VARIABLES.motionDuration,
      "--bitsnap-checkout-motion-duration",
    );
  });

  it("passes token values through unvalidated, so host variables work (D22)", () => {
    const style = resolveCheckoutAppearance({
      tokens: {
        sale: "var(--host-sale)",
        panelWidth: "min(30rem, 90vw)",
        motionDuration: "var(--host-duration)",
      },
    }).boundaryStyle as Record<string, string>;

    assert.equal(style["--bitsnap-checkout-sale"], "var(--host-sale)");
    assert.equal(style["--bitsnap-checkout-panel-width"], "min(30rem, 90vw)");
    assert.equal(style["--bitsnap-checkout-motion-duration"], "var(--host-duration)");
  });

  it("gives only the light preset a sale colour; dark keeps the CSS fallback", () => {
    assert.equal(
      (resolveCheckoutAppearance({ theme: "light" }).boundaryStyle as Record<string, string>)[
        "--bitsnap-checkout-sale"
      ],
      "#b91c1c",
    );
    assert.equal(
      (resolveCheckoutAppearance({ theme: "dark" }).boundaryStyle as Record<string, string>)[
        "--bitsnap-checkout-sale"
      ],
      undefined,
    );
    const custom = resolveCheckoutAppearance({ theme: "light", tokens: { sale: "#9f1239" } });
    assert.equal(custom.tokens.sale, "#9f1239");
  });

  it("sets no panel width or duration unless asked", () => {
    const style = resolveCheckoutAppearance({ theme: "light" }).boundaryStyle as Record<
      string,
      string
    >;
    assert.equal(style["--bitsnap-checkout-panel-width"], undefined);
    assert.equal(style["--bitsnap-checkout-motion-duration"], undefined);
  });

  it("marks the root motion off for a zero duration only", () => {
    for (const value of ["0", "0ms", "0s", "0.0s", " 0MS ", "-0"]) {
      assert.deepEqual(
        resolveCheckoutAppearance({ tokens: { motionDuration: value } }).boundaryAttributes,
        { "data-bitsnap-checkout-motion": "off" },
        value,
      );
    }
    for (const value of ["240ms", "0.1s", "10ms", "var(--host-duration)", "calc(0ms)"]) {
      assert.deepEqual(
        resolveCheckoutAppearance({ tokens: { motionDuration: value } }).boundaryAttributes,
        {},
        value,
      );
    }
    assert.deepEqual(resolveCheckoutAppearance({ theme: "light" }).boundaryAttributes, {});
  });

  it("still writes the duration variable when motion is off", () => {
    const resolved = resolveCheckoutAppearance({ tokens: { motionDuration: "0ms" } });
    assert.equal(
      (resolved.boundaryStyle as Record<string, string>)["--bitsnap-checkout-motion-duration"],
      "0ms",
    );
  });
});
