import { pickLocaleTable } from "@/src/lib/texts";
import { CHECKOUT_TEXT_TABLES } from "./texts";

export const DEFAULT_LOCALE = "pl-PL" as const;
const localeStorageKey = "bitsnap-locale";

let activeLocale: string | undefined;

/**
 * The one spelling of a locale the cart sends and stores: trimmed, a valid BCP
 * 47 tag in canonical case (`"en-us"` -> `"en-US"`), `"en"` -> `"en-US"`,
 * `"pl"` -> `"pl-PL"`. A value `Intl` rejects is kept as typed (trimmed).
 * `undefined` for an empty value.
 */
export function normalizeLocale(locale?: string): string | undefined {
  const value = locale?.trim();
  if (!value) {
    return undefined;
  }
  let canonical = value;
  try {
    canonical = Intl.getCanonicalLocales(value)[0] ?? value;
  } catch {
    // Not a well-formed tag: keep the trimmed value.
  }
  const lower = canonical.toLowerCase();
  return lower === "en" ? "en-US" : lower === "pl" ? DEFAULT_LOCALE : canonical;
}

export function setLocale(locale?: string): void {
  activeLocale = normalizeLocale(locale);
  try {
    if (typeof localStorage !== "undefined") {
      if (activeLocale == null) {
        localStorage.removeItem(localeStorageKey);
      } else {
        localStorage.setItem(localeStorageKey, activeLocale);
      }
    }
  } catch {
    // Storage is blocked or full: the in-memory locale still applies.
  }
}

export function getLocale(): string {
  if (activeLocale != null) {
    return activeLocale;
  }
  try {
    if (typeof localStorage !== "undefined") {
      return normalizeLocale(localStorage.getItem(localeStorageKey) ?? undefined) ?? DEFAULT_LOCALE;
    }
  } catch {
    // Storage is blocked.
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
