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
  },
  pl: {
    cart: "Koszyk",
    emptyCart: "Brak produktów w koszyku.",
    total: "Suma:",
    delivery: "+ dostawa",
    chooseCountry: "Wybierz kraj",
    nextStep: "Następny krok",
    unavailableProducts: "Nie wszystkie produkty są dostępne w magazynie.",
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
