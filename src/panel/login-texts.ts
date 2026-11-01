import { pickLocaleTable, type LocaleTables } from "../lib/texts";
import { getLocale } from "../components/checkout/locale";
import {
  resolveEmailCodeTexts,
  type EmailCodeTexts,
} from "../ui/email-code-login/texts";

/** Strings of `PanelLogin`: the shared login texts plus the two titles. */
export type PanelLoginTexts = EmailCodeTexts & {
  title: string;
  description: string;
  codeTitle: string;
  codeDescription: string;
};

type TitleKey = "title" | "description" | "codeTitle" | "codeDescription";

const TITLES: LocaleTables<TitleKey> = {
  pl: {
    title: "Zaloguj się",
    description: "Wyślemy do Ciebie kod na maila, dzięki któremu się zalogujesz.",
    codeTitle: "Wpisz kod z maila",
    codeDescription: "Kod ma 6 cyfr.",
  },
  en: {
    title: "Sign in",
    description: "We will email you a code that signs you in.",
    codeTitle: "Enter the code from the email",
    codeDescription: "The code has 6 digits.",
  },
};

/** Panel login texts: Polish unless the locale starts with `en`, then overrides. */
export function resolvePanelLoginTexts(
  locale: string = getLocale(),
  overrides?: Partial<PanelLoginTexts>,
): PanelLoginTexts {
  return {
    ...resolveEmailCodeTexts(locale, overrides),
    ...pickLocaleTable(TITLES, locale),
    ...definedOnly(overrides, ["title", "description", "codeTitle", "codeDescription"]),
  };
}

function definedOnly<K extends TitleKey>(
  overrides: Partial<PanelLoginTexts> | undefined,
  keys: K[],
): Partial<Record<K, string>> {
  const result: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = overrides?.[key];
    if (value != null) result[key] = value;
  }
  return result;
}
