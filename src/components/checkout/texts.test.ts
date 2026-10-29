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
    "Payments in this shop are not set up correctly. Try again later or contact the seller.",
  shippingNotConfigured:
    "Delivery in this shop is not configured yet. Try again later or contact the seller.",
  mixedRecurring:
    "Subscriptions and one-time products cannot be paid for together. Pay for them in separate orders.",
  currencyUnsupported:
    "The shop doesn't accept payments in this currency. Contact the seller.",
  priceChanged: "The product price has changed. Refresh the page to see the current price.",
  close: "Close cart",
  remove: "Remove",
  quantity: "Quantity",
  increaseQuantity: "Increase quantity",
  decreaseQuantity: "Decrease quantity",
  openCart: "Open cart",
  cartItemsCount: "Items in cart",
  lowestPrice30Days: "Lowest price in the last 30 days:",
  noPriceHistory: "No price data for the last 30 days",
  redirectFailed: "Could not redirect to the payment. Please try again later.",
  subscriptionUnsupported: "Subscriptions cannot be added to the cart yet.",
  searchCountry: "Find a country",
  noCountriesFound: "No countries found",
  countryRequired: "Choose a country to continue.",
  paymentForCart: "Cart payment",
  coupon: "Coupon",
  extrasCalculatedNext:
    "Discounts, shipping and taxes are calculated at the next step",
  loadFailed: "Could not load your cart.",
  retry: "Try again",
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
    "Sklep nie przyjmuje płatności w tej walucie. Skontaktuj się ze sprzedawcą.",
  priceChanged: "Cena produktu się zmieniła. Odśwież stronę, aby zobaczyć aktualną cenę.",
  close: "Zamknij koszyk",
  remove: "Usuń",
  quantity: "Ilość",
  increaseQuantity: "Zwiększ ilość",
  decreaseQuantity: "Zmniejsz ilość",
  openCart: "Otwórz koszyk",
  cartItemsCount: "Produktów w koszyku",
  lowestPrice30Days: "Najniższa cena z 30 dni:",
  noPriceHistory: "Brak danych o cenie z ostatnich 30 dni",
  redirectFailed:
    "Nie udało się przekierować do płatności. Spróbuj ponownie później.",
  subscriptionUnsupported: "Subskrypcji nie można jeszcze dodać do koszyka.",
  searchCountry: "Znajdź kraj",
  noCountriesFound: "Nie znaleziono krajów",
  countryRequired: "Wybierz kraj, aby przejść dalej.",
  paymentForCart: "Płatność za koszyk",
  coupon: "Kupon",
  extrasCalculatedNext: "Rabaty, dostawa i podatki w następnym kroku",
  loadFailed: "Nie udało się wczytać koszyka.",
  retry: "Spróbuj ponownie",
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
