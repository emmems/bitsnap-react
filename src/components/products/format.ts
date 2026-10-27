import { DEFAULT_LOCALE } from "../checkout/locale";

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
