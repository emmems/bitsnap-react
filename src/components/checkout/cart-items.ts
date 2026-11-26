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

/**
 * The id a requested product is kept under in the cart. A bare product id
 * (`prodv2_<hash>`, no variant) names its default variant, and the backend
 * answers with that variant's id (`prodv2_<hash>_default`): the line is stored
 * under the id the backend knows. Any other id stays as it is.
 */
export function cartProductID(
  requested: string,
  resolved: { productID: string }[],
): string {
  if (resolved.some((el) => el.productID === requested)) return requested;
  const defaultVariant = `${requested}_default`;
  return resolved.some((el) => el.productID === defaultVariant)
    ? defaultVariant
    : requested;
}

/** Requested product IDs that the backend did not resolve. */
export function findMissingProductIDs(
  requested: string[],
  resolved: { productID: string }[],
): string[] {
  const found = new Set(resolved.map((el) => el.productID));
  return Array.from(new Set(requested.filter((id) => !found.has(id))));
}

/**
 * The product page URL a cart item links to: absolute (resolved against the
 * page that adds the item) and only `http`/`https`, so a `javascript:` link
 * never reaches the cart. Anything else gives `undefined`.
 */
export function cartItemURL(
  url: string | undefined,
  base?: string,
): string | undefined {
  const value = url?.trim();
  if (value == null || value.length === 0) {
    return undefined;
  }
  try {
    const resolved = new URL(value, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return undefined;
    }
    return resolved.href;
  } catch {
    return undefined;
  }
}
