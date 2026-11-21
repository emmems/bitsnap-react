export function round(num: number, numberOfDecimals: number = 2): number {
  return Number(
    +(
      Math.round(Number(num + "e+" + numberOfDecimals)) +
      "e-" +
      numberOfDecimals
    )
  );
}

/**
 * Formats minor units as a currency amount.
 *
 * `locale` is the cart locale (`BitsnapCheckout`'s `locale` prop, or the
 * active checkout locale), so a Polish shop shows "99,80 zł" in an English
 * browser too. Without it the browser language is used, as before; that is
 * what Google Pay's shipping labels keep. A locale `Intl` rejects falls back
 * to the browser language instead of throwing during render.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale?: string,
): string {
  const browserLanguage =
    typeof navigator === "undefined" ? "pl-PL" : navigator.language;
  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency: currency,
    currencyDisplay: "symbol",
  };
  let formatter: Intl.NumberFormat;
  try {
    formatter = Intl.NumberFormat(locale?.trim() || browserLanguage, options);
  } catch (error) {
    if (!(error instanceof RangeError) || locale == null) {
      throw error;
    }
    formatter = Intl.NumberFormat(browserLanguage, options);
  }

  return formatter.format(amount / 100);
}

export function formatPriceWithoutCurrency(amount: number, currency: string) {
  let language = "pl";
  if (typeof navigator != "undefined") {
    language = navigator.language;
  }
  const result = new Intl.NumberFormat(language, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(amount / 100)
    .filter((x) => x.type !== "currency")
    .filter((x) => x.type !== "literal" || x.value.trim().length !== 0)
    .map((x) => x.value)
    .join("");

  const regex = new RegExp(`(\\.00)(?=\\D*$)`);
  return result.replace(regex, "");
}
