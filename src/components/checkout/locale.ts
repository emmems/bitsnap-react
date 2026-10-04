import { pickLocaleTable } from "@/src/lib/texts";
import { CHECKOUT_TEXT_TABLES } from "./texts";

export const DEFAULT_LOCALE = "pl-PL" as const;
const localeStorageKey = "bitsnap-locale";

let activeLocale: string | undefined;

export function setLocale(locale?: string): void {
  const value = locale?.trim();
  activeLocale = value
    ? value.toLowerCase() === "en"
      ? "en-US"
      : value.toLowerCase() === "pl"
        ? DEFAULT_LOCALE
        : value
    : undefined;
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
