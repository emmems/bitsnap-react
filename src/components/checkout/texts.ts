import {
  lookupText,
  resolveTexts,
  type LocaleTables,
} from "@/src/lib/texts";

/**
 * Every string the checkout renders. Pass a partial object through the
 * `texts` prop of `BitsnapCheckout` to override any of them, whatever the
 * locale.
 */
export type CheckoutTexts = {
  /** Drawer title. */
  cart: string;
  /** Shown when the cart has no products. */
  emptyCart: string;
  /** Label next to the total price. */
  total: string;
  /** Delivery note next to the total price. */
  delivery: string;
  /** Country selector placeholder. */
  chooseCountry: string;
  /** Checkout button label. */
  nextStep: string;
  /** Error shown when some products are out of stock. */
  unavailableProducts: string;
  /** Error shown when the checkout fails and the server gave no reason. */
  checkoutFailed: string;
  /** Error shown when the shop has no payment gateway connected. */
  noPaymentGateway: string;
  /** Error shown when the payment gateway of the shop is not set up. */
  gatewayNotConfigured: string;
  /** Error shown when delivery of the shop is not set up. */
  shippingNotConfigured: string;
  /** Error shown when the cart mixes subscriptions with one-time products. */
  mixedRecurring: string;
  /** Error shown when the cart currency cannot be paid in. */
  currencyUnsupported: string;
  /** Error shown when a price changed after the product was added. */
  priceChanged: string;
};

export type CheckoutTextKey = keyof CheckoutTexts;

export const CHECKOUT_TEXT_TABLES: LocaleTables<CheckoutTextKey> = {
  en: {
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
  },
  pl: {
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
  },
};

/** Default texts for a locale merged with the caller overrides. */
export function resolveCheckoutTexts(
  locale: string,
  overrides?: Partial<CheckoutTexts>,
): CheckoutTexts {
  return resolveTexts(CHECKOUT_TEXT_TABLES, locale, overrides);
}

export function getCheckoutText(
  key: CheckoutTextKey,
  locale: string,
  overrides?: Partial<CheckoutTexts>,
): string {
  return lookupText(resolveCheckoutTexts(locale, overrides), key);
}
