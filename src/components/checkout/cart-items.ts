type MatchableProduct = {
  id: string;
  variants?: { id: string }[] | null;
};

/**
 * The product from a `/products` response that serves a cart item: the
 * product itself or the product that has it as a variant.
 */
export function findProductForCartItem<T extends MatchableProduct>(
  productID: string,
  products: T[] | undefined,
): T | undefined {
  return products?.find(
    (el) =>
      el.id === productID ||
      (el.variants?.some((variant) => variant.id === productID) ?? false),
  );
}

/** Requested product IDs that the backend did not resolve. */
export function findMissingProductIDs(
  requested: string[],
  resolved: { productID: string }[],
): string[] {
  const found = new Set(resolved.map((el) => el.productID));
  return Array.from(new Set(requested.filter((id) => !found.has(id))));
}
