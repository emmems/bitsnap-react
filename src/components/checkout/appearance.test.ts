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
    assert.deepEqual(resolved.boundaryStyle, {});
    assert.deepEqual(resolved.boundaryAttributes, { "data-bitsnap-checkout-theme": "dark" });
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
    assert.equal(resolved.boundaryAttributes["data-bitsnap-checkout-theme"], "light");
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

  it("writes only --bitsnap-checkout-* variables, never a shadcn one (19a review B1)", () => {
    const tokens = {
      background: "#ffffff",
      surface: "#f9fafb",
      foreground: "#18181b",
      mutedForeground: "#71717a",
      border: "#e4e4e7",
      radius: "12px",
      focusRing: "#635bff",
      error: "#dc2626",
    };
    const style = resolveCheckoutAppearance({ tokens }).boundaryStyle as Record<string, string>;
    assert.deepEqual(
      Object.keys(style).filter((name) => !name.startsWith("--bitsnap-checkout-") && name !== "--bsc-scheme-guess"),
      [],
    );
    assert.equal(style["--bitsnap-checkout-radius"], "12px");
    assert.equal(style["--bitsnap-checkout-focus-ring"], "#635bff");
  });

  it("follows the host's shadcn variables without overwriting them (19a review B1)", () => {
    const style = resolveCheckoutAppearance({
      tokens: { background: "var(--background)", foreground: "var(--foreground)", radius: "var(--radius)" },
    }).boundaryStyle as Record<string, string>;
    // `--background: var(--background)` would be a cycle: the token would go
    // invalid and the cart would fall back to its dark default.
    assert.equal(style["--background"], undefined);
    assert.equal(style["--foreground"], undefined);
    assert.equal(style["--radius"], undefined);
    assert.equal(style["--bitsnap-checkout-background"], "var(--background)");
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
    (resolveCheckoutAppearance(appearance).boundaryStyle as Record<string, string>)["--bsc-scheme-guess"];

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

describe("1.32.0 token: panelMaxHeight (dialog only, R26)", () => {
  it("maps the token to its variable and passes the value through", () => {
    assert.equal(CHECKOUT_TOKEN_VARIABLES.panelMaxHeight, "--bitsnap-checkout-panel-max-height");
    const style = resolveCheckoutAppearance({
      tokens: { panelMaxHeight: "min(80dvh, 600px)" },
    }).boundaryStyle as Record<string, string>;
    assert.equal(style["--bitsnap-checkout-panel-max-height"], "min(80dvh, 600px)");
  });

  it("is not written when omitted, so cart.css keeps min(100dvh - 48px, 704px)", () => {
    for (const theme of ["dark", "light"] as const) {
      const style = resolveCheckoutAppearance({ theme }).boundaryStyle as Record<string, string>;
      assert.equal(style["--bitsnap-checkout-panel-max-height"], undefined, theme);
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
        { "data-bitsnap-checkout-theme": "dark", "data-bitsnap-checkout-motion": "off" },
        value,
      );
    }
    for (const value of ["240ms", "0.1s", "10ms", "var(--host-duration)", "calc(0ms)"]) {
      assert.deepEqual(
        resolveCheckoutAppearance({ tokens: { motionDuration: value } }).boundaryAttributes,
        { "data-bitsnap-checkout-theme": "dark" },
        value,
      );
    }
    assert.deepEqual(resolveCheckoutAppearance({ theme: "light" }).boundaryAttributes, {
      "data-bitsnap-checkout-theme": "light",
    });
  });

  it("still writes the duration variable when motion is off", () => {
    const resolved = resolveCheckoutAppearance({ tokens: { motionDuration: "0ms" } });
    assert.equal(
      (resolved.boundaryStyle as Record<string, string>)["--bitsnap-checkout-motion-duration"],
      "0ms",
    );
  });
});

describe("1.32.0 tokens: the cart follows the site's look (step 19a, D22)", () => {
  const NEW_TOKENS = {
    controlBorder: "--bitsnap-checkout-control-border",
    skeleton: "--bitsnap-checkout-skeleton",
    colorScheme: "--bitsnap-checkout-color-scheme",
    panelRadius: "--bitsnap-checkout-panel-radius",
    controlRadius: "--bitsnap-checkout-control-radius",
    buttonRadius: "--bitsnap-checkout-button-radius",
    buttonFontSize: "--bitsnap-checkout-button-font-size",
    panelShadow: "--bitsnap-checkout-panel-shadow",
  } as const;

  it("maps each new token to its variable and writes only that one", () => {
    for (const [token, variable] of Object.entries(NEW_TOKENS)) {
      assert.equal(CHECKOUT_TOKEN_VARIABLES[token as keyof typeof NEW_TOKENS], variable, token);
      const style = resolveCheckoutAppearance({ tokens: { [token]: "1px" } }).boundaryStyle as Record<string, string>;
      assert.deepEqual(Object.keys(style), [variable], token);
      assert.equal(style[variable], "1px", token);
    }
  });

  it("keeps the default and both themes' output as it was: no preset writes a new token", () => {
    for (const theme of [undefined, "dark", "light"] as const) {
      const resolved = resolveCheckoutAppearance(theme == null ? undefined : { theme });
      const style = resolved.boundaryStyle as Record<string, string>;
      for (const variable of Object.values(NEW_TOKENS)) {
        assert.equal(style[variable], undefined, `${theme} writes ${variable}`);
      }
    }
    // The light preset is exactly the 1.32.0 one (098d01f).
    assert.deepEqual(CHECKOUT_THEME_PRESETS.light, {
      background: "#ffffff",
      surface: "#f9fafb",
      foreground: "#18181b",
      mutedForeground: "#71717a",
      border: "#e4e4e7",
      buttonBackground: "#18181b",
      buttonForeground: "#fafafa",
      buttonHoverBackground: "#000000",
      hoverSurface: "#e4e4e7",
      focusRing: "#71717a",
      error: "#dc2626",
      sale: "#b91c1c",
    });
    assert.deepEqual(CHECKOUT_THEME_PRESETS.dark, {});
    assert.equal(
      (resolveCheckoutAppearance({ theme: "light" }).boundaryStyle as Record<string, string>)["--bsc-scheme-guess"],
      "light",
    );
  });

  it("passes var(...) values through, so the host's variables and dark switch drive the cart", () => {
    const tokens = {
      background: "var(--site-bg)",
      foreground: "var(--site-fg)",
      controlBorder: "var(--site-input, #8a8a8a)",
      skeleton: "color-mix(in srgb, var(--site-fg) 15%, transparent)",
      colorScheme: "var(--site-scheme)",
      controlRadius: "var(--site-radius)",
      buttonRadius: "calc(var(--site-radius) * 2)",
      panelShadow: "var(--site-shadow)",
    };
    const style = resolveCheckoutAppearance({ tokens }).boundaryStyle as Record<string, string>;
    for (const [token, value] of Object.entries(tokens)) {
      assert.equal(style[CHECKOUT_TOKEN_VARIABLES[token as keyof typeof tokens]], value, token);
    }
  });

  it("writes the hex background's guess as a variable, never an inline color-scheme", () => {
    const guessed = resolveCheckoutAppearance({ tokens: { background: "#ffffff" } }).boundaryStyle as Record<string, string>;
    assert.equal(guessed["--bsc-scheme-guess"], "light");
    // An inline `color-scheme` would beat a `--bitsnap-checkout-color-scheme`
    // set in the host's CSS (19a review N1); `cart.css` reads the guess under it.
    assert.equal(guessed.colorScheme, undefined);
    assert.equal((resolveCheckoutAppearance({ theme: "light" }).boundaryStyle as Record<string, string>).colorScheme, undefined);
    const chosen = resolveCheckoutAppearance({ tokens: { background: "#ffffff", colorScheme: "dark" } });
    const style = chosen.boundaryStyle as Record<string, string>;
    assert.equal(style["--bsc-scheme-guess"], undefined, "the token decides");
    assert.equal(style["--bitsnap-checkout-color-scheme"], "dark");
    assert.equal(
      (resolveCheckoutAppearance({ theme: "light", tokens: { colorScheme: "var(--s)" } }).boundaryStyle as Record<string, string>)[
        "--bsc-scheme-guess"
      ],
      undefined,
    );
  });

  it("drops a value with a `;`, which would add a declaration in server-rendered HTML", () => {
    const resolved = resolveCheckoutAppearance({
      tokens: { background: "red; position: static", buttonRadius: "4px" },
    });
    const style = resolved.boundaryStyle as Record<string, string>;
    assert.equal(style["--bitsnap-checkout-background"], undefined);
    assert.equal(style["--background"], undefined);
    assert.equal(resolved.tokens.background, undefined);
    assert.equal(style["--bitsnap-checkout-button-radius"], "4px");
    assert.equal(
      resolveCheckoutAppearance({ tokens: { background: "a;b" } }).isCustomized,
      false,
      "a dropped value is not a customisation",
    );
  });
});
