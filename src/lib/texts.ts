/**
 * Shared text machinery: typed string tables per locale, the locale fallback
 * and a merge with caller overrides. Each module (checkout, later returns)
 * supplies its own key type and default tables.
 */

/** Strings of one locale, keyed by text key. */
export type TextTable<Key extends string> = Record<Key, string>;

/** Default tables for the supported locales. */
export type LocaleTables<Key extends string> = {
  en: TextTable<Key>;
  pl: TextTable<Key>;
};

/**
 * Picks the table for a locale. Any locale starting with `en` (case
 * insensitive, so `en`, `en-US`, `EN-gb`) gets English; everything else,
 * including unknown locales, gets the Polish default.
 */
export function pickLocaleTable<Key extends string>(
  tables: LocaleTables<Key>,
  locale: string,
): TextTable<Key> {
  return locale.toLowerCase().startsWith("en") ? tables.en : tables.pl;
}

/**
 * Merges caller overrides over a table. Overrides apply regardless of the
 * locale; `undefined`/`null` entries are ignored so the default stays.
 */
export function mergeTexts<Key extends string>(
  table: TextTable<Key>,
  overrides?: Partial<TextTable<Key>>,
): TextTable<Key> {
  const result: Record<string, string> = { ...table };

  if (overrides != null) {
    for (const [key, value] of Object.entries<string | undefined>(overrides)) {
      if (value != null) {
        result[key] = value;
      }
    }
  }

  return result as TextTable<Key>;
}

/** Locale table merged with the caller overrides. */
export function resolveTexts<Key extends string>(
  tables: LocaleTables<Key>,
  locale: string,
  overrides?: Partial<TextTable<Key>>,
): TextTable<Key> {
  return mergeTexts(pickLocaleTable(tables, locale), overrides);
}

/** Looks up a single text. Unknown keys return the key itself. */
export function lookupText<Key extends string>(
  texts: TextTable<Key>,
  key: Key,
): string {
  return (texts as Record<string, string | undefined>)[key] ?? key;
}
