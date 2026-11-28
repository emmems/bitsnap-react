import { keepPreviousData } from "@tanstack/react-query";
import {
  fetchCartDiscountContext,
  shortHash,
  type CartDiscountContext,
  type CartDiscountRequest,
} from "./cart-discounts";
import { fetchCartProducts, type CartProductsAnswer } from "./CartProvider";
import type { Err } from "./lib/err";
import { normalizeLocale, getLocale } from "./locale";
import type { PaymentMethodChoice } from "./payment-method";

/**
 * Query options shared by the drawer and (next slice) the warm-up, so both use
 * the same keys and `staleTime`.
 */

/** Prefix of every `/products` revalidation query of the cart. */
export const CART_PRODUCTS_KEY = "cart-products";

/** How long an answer counts as fresh for the drawer (focus, reopen). */
export const CART_PRODUCTS_STALE_MS = 30_000;

/**
 * Key of the revalidation of a set of products. It holds product ids, not
 * quantities: "+" and remove never refetch (D2, A7).
 */
export function cartProductsKey(
  projectID: string,
  locale: string | undefined,
  productIDs: readonly string[],
) {
  return [
    CART_PRODUCTS_KEY,
    projectID,
    normalizeLocale(locale) ?? getLocale(),
    [...new Set(productIDs)].sort().join(","),
  ] as const;
}

/**
 * The drawer's revalidation of the local cart: `/products` with the default
 * HTTP cache, written to the snapshot by `fetchCartProducts`. The answer of the
 * previous set stays as placeholder data while a new set loads (N6). A failure
 * is not retried, as before (the cart shows a retry button).
 */
export function cartProductsQuery(
  projectID: string,
  locale: string | undefined,
  productIDs: readonly string[],
) {
  return {
    queryKey: cartProductsKey(projectID, locale, productIDs),
    queryFn: (): Promise<CartProductsAnswer> =>
      fetchCartProducts(projectID, locale),
    staleTime: CART_PRODUCTS_STALE_MS,
    placeholderData: keepPreviousData,
    retry: false,
  } as const;
}

type Countries = { name: string; code: string }[];

/** How long a non-empty country list counts as fresh (plan part 1, slice 5). */
export const CART_COUNTRIES_STALE_MS = 5 * 60_000;

/**
 * The countries the shop ships to. Fresh for 5 minutes once it has any (the
 * answer is `[]` after a failed request, which must be asked again at once).
 */
export function cartCountriesQuery(
  fetchCountries: () => Promise<Err | Countries>,
) {
  return {
    queryKey: ["cart-available-countries"],
    queryFn: fetchCountries,
    // An `Err` has no `length`: a failed answer counts as stale at once.
    staleTime: (query: { state: { data?: Err | Countries } }) =>
      (query.state.data as Countries | undefined)?.length
        ? CART_COUNTRIES_STALE_MS
        : 0,
  } as const;
}

/**
 * What the seller offers for a cart: the key follows project, locale, country
 * and the cart content; any failure means "no choice" (`null`).
 */
export function cartPaymentMethodsQuery(
  projectID: string | undefined,
  locale: string | undefined,
  country: string | undefined,
  signature: string | undefined,
  fetchChoice: () => Promise<PaymentMethodChoice | null>,
) {
  return {
    queryKey: ["cart-payment-methods", projectID, locale, country, signature],
    queryFn: (): Promise<PaymentMethodChoice | null> =>
      fetchChoice().catch(() => null),
    staleTime: 60_000,
    retry: false,
  } as const;
}

/** How long the buyer's discounts count as fresh (reopen, focus). */
export const CART_DISCOUNTS_STALE_MS = 30_000;

/**
 * The buyer's discounts for the cart (`GetCartDiscountContext`). The key
 * follows the project, the lines (ids, quantities, pay-what-you-want amounts),
 * the coupon, a short fingerprint of the stored panel session and the locale.
 * A failure is `null` (the footer as before), never retried: the next change
 * of the key asks again.
 */
export function cartDiscountsQuery(
  request: CartDiscountRequest | undefined,
) {
  return {
    queryKey: [
      "cart-discounts",
      request?.host,
      request?.projectID,
      request?.items
        .map((item) => `${item.productId}:${item.quantity}:${item.amount ?? ""}`)
        .join(","),
      request?.couponCode ?? "",
      request?.panelSession != null
        ? `${request.panelSession.host}:${shortHash(request.panelSession.token)}`
        : "",
      normalizeLocale(request?.locale) ?? getLocale(),
    ],
    queryFn: (): Promise<CartDiscountContext | null> =>
      request == null ? Promise.resolve(null) : fetchCartDiscountContext(request),
    enabled: request != null,
    staleTime: CART_DISCOUNTS_STALE_MS,
    retry: false,
  } as const;
}
