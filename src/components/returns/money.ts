/**
 * Formats an amount given in minor units (for example grosze) with the
 * currency and locale. The amount stays a `bigint` until the decimal string is
 * built, so large `int64` values never lose precision.
 */
export function formatMoney(
  minor: bigint | number,
  currency: string,
  locale: string,
): string {
  const amount = typeof minor === "bigint" ? minor : BigInt(Math.trunc(minor));

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    // Intl accepts exact decimal strings at runtime; the ES2022 typings only
    // know numbers.
    return formatter.format(
      toDecimalString(amount, digits) as unknown as number,
    );
  } catch {
    return `${toDecimalString(amount, 2)} ${currency}`;
  }
}

/** Decimal string of a minor unit amount, e.g. `12345n, 2` -> `"123.45"`. */
export function toDecimalString(amount: bigint, fractionDigits: number): string {
  const negative = amount < BigInt(0);
  const absolute = negative ? -amount : amount;

  if (fractionDigits <= 0) {
    return `${negative ? "-" : ""}${absolute}`;
  }

  const divisor = BigInt(10) ** BigInt(fractionDigits);
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(fractionDigits, "0");

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}
