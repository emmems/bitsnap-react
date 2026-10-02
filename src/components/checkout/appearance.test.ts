import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHECKOUT_SLOT_NAMES,
  CHECKOUT_TOKEN_VARIABLES,
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

    const dropdownStyle = resolved.dropdownStyle as Record<string, string>;

    assert.equal(dropdownStyle["--popover"], "#f9fafb");
    assert.equal(dropdownStyle["--popover-foreground"], "#18181b");
  });

  it("gives the portalled dropdown the dark defaults when no token is set", () => {
    const resolved = resolveCheckoutAppearance({ theme: "dark" });

    const dropdownStyle = resolved.dropdownStyle as Record<string, string>;

    assert.equal(dropdownStyle["--popover"], "var(--color-neutral-800)");
    assert.equal(dropdownStyle["--popover-foreground"], "var(--color-neutral-200)");
  });

  it("resolves the light preset for the dropdown", () => {
    const resolved = resolveCheckoutAppearance({ theme: "light" });

    const dropdownStyle = resolved.dropdownStyle as Record<string, string>;

    assert.equal(dropdownStyle["--popover"], "#f9fafb");
    assert.equal(dropdownStyle["--popover-foreground"], "#18181b");
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
      "product",
      "productImage",
      "productName",
      "productPrice",
      "quantityControl",
      "quantityInput",
      "quantityButton",
      "removeButton",
      "summary",
      "totalLabel",
      "totalValue",
      "deliveryText",
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
