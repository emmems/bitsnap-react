import { keepPreviousData } from "@tanstack/react-query";
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

/**
 * The countries the shop ships to. Fresh for a minute once it has any (the
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
      (query.state.data as Countries | undefined)?.length ? 60_000 : 0,
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
