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
  checkoutFailed: "Something went wrong. Please try again later.",
  noPaymentGateway:
    "This shop doesn't accept online payments yet. Try again later or contact the seller.",
  gatewayNotConfigured:
    "This shop can't accept payments right now. Try again later or contact the seller.",
  shippingNotConfigured:
    "Delivery in this shop is not configured yet. Try again later or contact the seller.",
  mixedRecurring:
    "Subscriptions and one-time products cannot be paid for together. Buy them separately.",
  currencyUnsupported:
    "The shop cannot accept payments in the currency of this cart.",
  priceChanged: "The product price has changed. Refresh the page.",
};

const polish = {
  cart: "Koszyk",
  emptyCart: "Brak produktów w koszyku.",
  total: "Suma:",
  delivery: "+ dostawa",
  chooseCountry: "Wybierz kraj",
  nextStep: "Następny krok",
  unavailableProducts: "Nie wszystkie produkty są dostępne w magazynie.",
  checkoutFailed: "Coś poszło nie tak. Spróbuj ponownie później.",
  noPaymentGateway:
    "Ten sklep nie przyjmuje jeszcze płatności online. Spróbuj ponownie później lub skontaktuj się ze sprzedawcą.",
  gatewayNotConfigured:
    "Płatności w tym sklepie nie są poprawnie skonfigurowane. Spróbuj ponownie później lub skontaktuj się ze sprzedawcą.",
  shippingNotConfigured:
    "Dostawa w tym sklepie nie jest jeszcze skonfigurowana. Spróbuj ponownie później lub skontaktuj się ze sprzedawcą.",
  mixedRecurring:
    "Subskrypcji i produktów jednorazowych nie można opłacić razem. Opłać je w osobnych zamówieniach.",
  currencyUnsupported:
    "Sklep nie przyjmuje płatności w tej walucie. Zmień walutę lub skontaktuj się ze sprzedawcą.",
  priceChanged: "Cena produktu się zmieniła. Odśwież stronę, aby zobaczyć aktualną cenę.",
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
