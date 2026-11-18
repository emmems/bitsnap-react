import type { PanelTexts } from "../../texts";

/**
 * Short order reference the buyer sees in e-mails and on the order page:
 * the prefix before the first `_` plus the last 4 characters of the rest
 * (`c_7Hq3Zk9WmX` → `c_9WmX`). Mirrors the server's `getPublicOrderID`, so
 * an already short reference stays the same. Unlike the server it trims the
 * id first; ids never carry spaces, so the result is the same in practice. A stopgap until the API sends
 * a display number (plan B1). `""` for an empty id.
 */
export function shortOrderRef(id: string): string {
  const value = id.trim();
  if (value === "") return "";
  const at = value.indexOf("_");
  if (at === -1) return value.slice(-4);
  return `${value.slice(0, at)}_${value.slice(at + 1).slice(-4)}`;
}

/** Fills `{name}` placeholders; unknown names stay as they are. */
export function fillText(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    values[name] == null ? match : String(values[name]),
  );
}

/** Picks the one / few / many form for `count` with the locale's plural rules. */
export function pluralText(
  locale: string,
  count: number,
  forms: { one: string; few: string; many: string },
): string {
  let rule: Intl.LDMLPluralRule = "other";
  try {
    rule = new Intl.PluralRules(locale).select(count);
  } catch {
    rule = count === 1 ? "one" : "other";
  }
  const template =
    rule === "one" ? forms.one : rule === "few" ? forms.few : forms.many;
  return fillText(template, { count });
}

/** "4 zamówienia" / "5 zamówień" / "1 order". */
export function ordersCountText(
  texts: PanelTexts,
  locale: string,
  count: number,
): string {
  return pluralText(locale, count, {
    one: texts.ordersCountOne,
    few: texts.ordersCountFew,
    many: texts.ordersCountMany,
  });
}

/** Amount in minor units as money; an unknown currency code falls back to "12.50 XYZ". */
export function formatMinorAmount(
  amount: number | bigint,
  currency: string,
  locale: string,
): string {
  const value = Number(amount) / 100;
  const code = currency.trim().toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code || "PLN",
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${code}`.trim();
  }
}

/** "2 mar 2024". */
export function formatShortDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "2 marca 2024". */
export function formatLongDate(date: Date, locale: string): string {
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Month header: "Marzec 2024" / "March 2024" (nominative month name). */
export function formatMonth(date: Date, locale: string): string {
  const text = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(date);
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Seconds of a protobuf timestamp as a Date, `undefined` without one. */
export function timestampToDate(
  timestamp: { seconds: bigint | number } | undefined,
): Date | undefined {
  if (timestamp == null) return undefined;
  const seconds = Number(timestamp.seconds);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : undefined;
}

/** Year-month key for grouping, `""` without a date. */
export function monthKey(date: Date | undefined): string {
  return date == null ? "" : `${date.getFullYear()}-${date.getMonth()}`;
}

export type OrderGroup<T> = { key: string; date: Date | undefined; items: T[] };

/**
 * Groups consecutive orders by month, keeping the server's order (newest
 * first). Orders without a date form their own group.
 */
export function groupByMonth<T>(
  items: T[],
  dateOf: (item: T) => Date | undefined,
): OrderGroup<T>[] {
  const groups: OrderGroup<T>[] = [];
  for (const item of items) {
    const date = dateOf(item);
    const key = monthKey(date);
    const last = groups[groups.length - 1];
    if (last != null && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, date, items: [item] });
    }
  }
  return groups;
}

/** True when the loaded orders carry more than one distinct checkout name. */
export function namesDiffer(names: string[]): boolean {
  return (
    new Set(names.map((name) => name.trim()).filter((name) => name !== ""))
      .size > 1
  );
}
