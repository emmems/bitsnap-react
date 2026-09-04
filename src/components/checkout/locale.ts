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
  const english: Record<string, string> = {
    cart: "Cart",
    emptyCart: "Your cart is empty.",
    total: "Total:",
    delivery: "+ delivery",
    chooseCountry: "Choose a country",
    nextStep: "Next step",
    unavailableProducts: "Not all products are available.",
  };
  const polish: Record<string, string> = {
    cart: "Koszyk",
    emptyCart: "Brak produktów w koszyku.",
    total: "Suma:",
    delivery: "+ dostawa",
    chooseCountry: "Wybierz kraj",
    nextStep: "Następny krok",
    unavailableProducts: "Nie wszystkie produkty są dostępne w magazynie.",
  };
  return (locale.toLowerCase().startsWith("en") ? english : polish)[key] ?? key;
}
