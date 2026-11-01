import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getProductListSlotAppearance,
  PRODUCT_LIST_SLOT_NAMES,
  PRODUCT_LIST_THEME_PRESETS,
  PRODUCT_LIST_TOKEN_VARIABLES,
  resolveProductListAppearance,
} from "./appearance.ts";

describe("resolveProductListAppearance", () => {
  it("defaults to the complete light preset", () => {
    const resolved = resolveProductListAppearance();

    assert.equal(resolved.theme, "light");
    assert.equal(resolved.boundaryClassName, "light");
    assert.deepEqual(resolved.tokens, PRODUCT_LIST_THEME_PRESETS.light);
    assert.equal(
      (resolved.boundaryStyle as Record<string, string>)[
        "--bitsnap-products-background"
      ],
      "#ffffff",
    );
  });

  it("ships complete presets with a variable for every color token", () => {
    for (const theme of ["light", "dark"] as const) {
      const preset = PRODUCT_LIST_THEME_PRESETS[theme] as Record<
        string,
        string
      >;
      for (const token of Object.keys(PRODUCT_LIST_TOKEN_VARIABLES)) {
        if (token === "fontFamily" || token === "fontSize") {
          continue;
        }
        assert.ok(preset[token], `${theme} preset is missing ${token}`);
      }
    }
    assert.notEqual(
      PRODUCT_LIST_THEME_PRESETS.dark.background,
      PRODUCT_LIST_THEME_PRESETS.light.background,
    );
  });

  it("applies the dark preset and marks the boundary", () => {
    const resolved = resolveProductListAppearance({ theme: "dark" });

    assert.equal(resolved.theme, "dark");
    assert.equal(resolved.boundaryClassName, "dark");
    assert.equal(
      resolved.tokens.background,
      PRODUCT_LIST_THEME_PRESETS.dark.background,
    );
  });

  it("lets partial tokens override the preset and keeps the rest", () => {
    const resolved = resolveProductListAppearance({
      tokens: { buttonBackground: "#635bff", fontFamily: "Inter" },
    });
    const style = resolved.boundaryStyle as Record<string, string>;

    assert.equal(style["--bitsnap-products-button-background"], "#635bff");
    assert.equal(style["--bitsnap-products-font-family"], "Inter");
    assert.equal(style["--bitsnap-products-radius"], "8px");
    assert.equal(
      style["--bitsnap-products-foreground"],
      PRODUCT_LIST_THEME_PRESETS.light.foreground,
    );
  });

  it("returns slot overrides by name", () => {
    const resolved = resolveProductListAppearance({
      elements: { card: { className: "shop-card", style: { gap: 4 } } },
    });

    assert.equal(
      getProductListSlotAppearance(resolved, "card")?.className,
      "shop-card",
    );
    assert.equal(getProductListSlotAppearance(resolved, "grid"), undefined);
    assert.ok(PRODUCT_LIST_SLOT_NAMES.includes("addToCartButton"));
  });
});

it("uses compact catalogue tracks and lets merchants choose one column", () => {
  assert.equal(resolveProductListAppearance().tokens.gridMinWidth, "9rem");
  const single = resolveProductListAppearance({
    tokens: { gridMinWidth: "100%" },
  });
  assert.equal(
    (single.boundaryStyle as Record<string, string>)[
      "--bitsnap-products-grid-min-width"
    ],
    "100%",
  );
});
