import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { translate } from "./locale.ts";
import { getCheckoutText, resolveCheckoutTexts } from "./texts.ts";

const english = {
  cart: "Cart",
  emptyCart: "Your cart is empty.",
  total: "Total:",
  delivery: "+ delivery",
  chooseCountry: "Choose a country",
  nextStep: "Next step",
  unavailableProducts: "Not all products are available.",
};

const polish = {
  cart: "Koszyk",
  emptyCart: "Brak produktów w koszyku.",
  total: "Suma:",
  delivery: "+ dostawa",
  chooseCountry: "Wybierz kraj",
  nextStep: "Następny krok",
  unavailableProducts: "Nie wszystkie produkty są dostępne w magazynie.",
};

describe("checkout texts without overrides", () => {
  it("keeps the exact English strings", () => {
    for (const locale of ["en", "en-US", "EN"]) {
      assert.deepEqual(resolveCheckoutTexts(locale), english);
    }
  });

  it("keeps the exact Polish strings, also for unknown locales", () => {
    for (const locale of ["pl", "pl-PL", "de-DE", ""]) {
      assert.deepEqual(resolveCheckoutTexts(locale), polish);
    }
  });

  it("matches translate for every key and locale", () => {
    for (const locale of ["pl-PL", "en-US", "de"]) {
      for (const key of Object.keys(english) as (keyof typeof english)[]) {
        assert.equal(getCheckoutText(key, locale), translate(key, locale));
      }
    }
    assert.equal(translate("unknown", "en-US"), "unknown");
  });
});

describe("checkout texts with overrides", () => {
  it("changes only the given keys, in every locale", () => {
    for (const [locale, base] of [
      ["pl-PL", polish],
      ["en-US", english],
    ] as const) {
      assert.deepEqual(resolveCheckoutTexts(locale, { cart: "Basket" }), {
        ...base,
        cart: "Basket",
      });
    }
  });
});
