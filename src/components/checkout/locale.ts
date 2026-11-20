import { pickLocaleTable } from "@/src/lib/texts";
import { CHECKOUT_TEXT_TABLES } from "./texts";

export const DEFAULT_LOCALE = "pl-PL" as const;
const localeStorageKey = "bitsnap-locale";

let activeLocale: string | undefined;

/**
 * The one spelling of a locale the cart sends and stores: trimmed, `"en"` ->
 * `"en-US"`, `"pl"` -> `"pl-PL"`, anything else unchanged. `undefined` for an
 * empty value.
 */
export function normalizeLocale(locale?: string): string | undefined {
  const value = locale?.trim();
  if (!value) {
    return undefined;
  }
  const lower = value.toLowerCase();
  return lower === "en" ? "en-US" : lower === "pl" ? DEFAULT_LOCALE : value;
}

export function setLocale(locale?: string): void {
  activeLocale = normalizeLocale(locale);
  if (typeof localStorage !== "undefined") {
    if (activeLocale == null) {
      localStorage.removeItem(localeStorageKey);
    } else {
      localStorage.setItem(localeStorageKey, activeLocale);
    }
  }
}

export function getLocale(): string {
  if (activeLocale != null) {
    return activeLocale;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(localeStorageKey) ?? DEFAULT_LOCALE;
  }
  return DEFAULT_LOCALE;
}

export function translate(key: string, locale: string = getLocale()): string {
  return (
    (pickLocaleTable(CHECKOUT_TEXT_TABLES, locale) as Record<string, string>)[
      key
    ] ?? key
  );
}
