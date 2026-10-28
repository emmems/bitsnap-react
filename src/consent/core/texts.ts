import type { ConsentLocale, ConsentTexts } from "./types";

export const DEFAULT_TEXTS: Record<ConsentLocale, ConsentTexts> = {
  pl: {
    title: "Szanujemy Twoją prywatność",
    description:
      "Używamy plików cookie, aby strona działała poprawnie. Za Twoją zgodą wykorzystujemy je też do statystyk, personalizacji i reklam. Możesz zaakceptować wszystkie, odrzucić wszystkie albo wybrać, na co się zgadzasz.",
    acceptAll: "Akceptuj wszystkie",
    rejectAll: "Odrzuć wszystkie",
    settings: "Ustawienia",
    save: "Zapisz wybór",
    close: "Zamknij",
    necessaryTitle: "Niezbędne",
    necessaryDescription:
      "Potrzebne do działania strony: koszyk, zapamiętanie Twojego wyboru, bezpieczeństwo. Nie można ich wyłączyć.",
    analyticsTitle: "Statystyki",
    analyticsDescription:
      "Pomagają nam zrozumieć, jak odwiedzający korzystają ze strony, żebyśmy mogli ją ulepszać.",
    marketingTitle: "Marketing",
    marketingDescription:
      "Pozwalają mierzyć skuteczność reklam i pokazywać Ci oferty dopasowane do zainteresowań.",
    preferencesTitle: "Preferencje",
    preferencesDescription:
      "Zapamiętują Twoje ustawienia, na przykład język czy wygląd strony.",
    poweredBy: "Powered by",
  },
  en: {
    title: "We value your privacy",
    description:
      "We use cookies to make this site work. With your consent we also use them for statistics, personalization and ads. You can accept all, reject all, or choose what you agree to.",
    acceptAll: "Accept all",
    rejectAll: "Reject all",
    settings: "Settings",
    save: "Save choices",
    close: "Close",
    necessaryTitle: "Necessary",
    necessaryDescription:
      "Needed for the site to work: the cart, remembering your choice, security. They cannot be turned off.",
    analyticsTitle: "Analytics",
    analyticsDescription:
      "Help us understand how visitors use the site, so we can improve it.",
    marketingTitle: "Marketing",
    marketingDescription:
      "Measure how well ads work and show you offers that match your interests.",
    preferencesTitle: "Preferences",
    preferencesDescription:
      "Remember your settings, such as language or how the site looks.",
    poweredBy: "Powered by",
  },
};

/** Fixed interface labels that are not part of the configurable texts. */
export const UI_LABELS: Record<
  ConsentLocale,
  { privacy: string; services: string; always: string }
> = {
  pl: {
    privacy: "Polityka prywatności",
    services: "Usługi",
    always: "Zawsze aktywne",
  },
  en: { privacy: "Privacy policy", services: "Services", always: "Always on" },
};

export function resolveLocale(
  preference: "auto" | ConsentLocale | undefined,
  navigatorLanguage?: string,
): ConsentLocale {
  if (preference === "pl" || preference === "en") return preference;
  return /^pl\b/i.test(navigatorLanguage ?? "") ? "pl" : "en";
}

/** Built-in texts for the locale, with the (non-empty) overrides of the config on top. */
export function mergeTexts(
  locale: ConsentLocale,
  overrides?: Partial<Record<ConsentLocale, Partial<ConsentTexts>>>,
): ConsentTexts {
  const merged = { ...DEFAULT_TEXTS[locale] };
  const own = overrides?.[locale];
  if (own) {
    for (const key of Object.keys(merged) as (keyof ConsentTexts)[]) {
      const value = own[key];
      if (typeof value === "string" && value.trim() !== "") merged[key] = value;
    }
  }
  return merged;
}
