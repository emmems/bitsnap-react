import { keepPreviousData } from "@tanstack/react-query";
import { fetchCartProducts, type CartProductsAnswer } from "./CartProvider";
import { normalizeLocale, getLocale } from "./locale";

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
