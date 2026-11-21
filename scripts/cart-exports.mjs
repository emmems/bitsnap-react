/**
 * Runtime exports of `src/cart/index.ts` (`bitsnap-react/cart`), in one place:
 * `tsup.config.ts` builds the CommonJS shim from it and `verify-package.mjs`
 * checks that it matches the ESM entry (and that each name is the same value
 * the main entry exports).
 */
export const CART_EXPORTS = [
  "ApplePayButton",
  "Bitsnap",
  "BitsnapCheckout",
  "CHECKOUT_SLOT_NAMES",
  "GooglePayButton",
  "ITEM_IDS_NOT_FOUND",
  "InPostPayButton",
  "RevolutPayButton",
  "createCheckout",
  "createPaymentURL",
  "getLocale",
  "getPaymentMethodChoice",
  "getReferenceIfPossible",
  "injectReferenceToRequestIfNeeded",
  "setCustomHost",
  "setLocale",
  "setProjectID",
];
