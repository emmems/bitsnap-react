export function round(num: number, numberOfDecimals: number = 2): number {
  return Number(
    +(
      Math.round(Number(num + "e+" + numberOfDecimals)) +
      "e-" +
      numberOfDecimals
    )
  );
}

export function formatCurrency(amount: number, currency: string): string {
  const formatter = Intl.NumberFormat(navigator.language, {
    style: "currency",
    currency: currency,
    currencyDisplay: "symbol",
  });

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
