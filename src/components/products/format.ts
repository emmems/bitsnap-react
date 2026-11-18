import { DEFAULT_LOCALE } from "../checkout/locale";
import type { PublicListProduct } from "./fetch";

function createFormatter(
  locale: string,
  currency: string,
): Intl.NumberFormat | undefined {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
    });
  } catch {
    // RangeError: invalid locale or currency code.
    return undefined;
  }
}

/**
 * Formats a price in minor units (grosze, cents) for the locale, the same way
 * the cart does (`amount / 100`). An unknown locale falls back to Polish and an
 * invalid currency code to a plain number followed by the code.
 */
export function formatProductPrice(
  amount: number,
  currency: string,
  locale: string = DEFAULT_LOCALE,
): string {
  const value = amount / 100;
  const formatter =
    createFormatter(locale, currency) ??
    createFormatter(DEFAULT_LOCALE, currency);

  return formatter != null
    ? formatter.format(value)
    : `${value.toFixed(2)} ${currency}`;
}

/**
 * What a card shows in place of the price. `quote`: a product priced by a
 * quote with no price to show (3D prints, request-only services; their `price`
 * is 0), so the card says "Wyceń" with no regular price. Otherwise the
 * formatted price, "from" when `from`, and the struck-through regular price
 * when the product is discounted (never for quote-only products).
 */
export type ProductCardPrice =
  | { kind: "quote" }
  | {
      kind: "price";
      price: string;
      from: boolean;
      compareAtPrice: string | null;
    };

export function productCardPrice(
  product: Pick<
    PublicListProduct,
    | "price"
    | "currency"
    | "compareAtPrice"
    | "priceFrom"
    | "quoteOnly"
    | "quoteShowsPrice"
  >,
  locale: string = DEFAULT_LOCALE,
): ProductCardPrice {
  const quoteOnly = product.quoteOnly === true;
  if (quoteOnly && product.quoteShowsPrice !== true) {
    return { kind: "quote" };
  }
  return {
    kind: "price",
    price: formatProductPrice(product.price, product.currency, locale),
    from: product.priceFrom,
    compareAtPrice:
      !quoteOnly &&
      product.compareAtPrice != null &&
      product.compareAtPrice > product.price
        ? formatProductPrice(product.compareAtPrice, product.currency, locale)
        : null,
  };
}
