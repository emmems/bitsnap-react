import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { getLocale } from "@/src/components/checkout/locale";
import {
  fillText,
  resolveReturnsTexts,
  type ReturnsTextKey,
  type ReturnsTexts,
} from "./texts";

type ReturnsTextsContextValue = {
  /** Active locale (the `locale` prop or the library locale). */
  locale: string;
  texts: ReturnsTexts;
};

const ReturnsTextsContext = createContext<ReturnsTextsContextValue>({
  locale: "pl-PL",
  texts: resolveReturnsTexts("pl-PL"),
});

/**
 * Returns scoped texts provider. Carries the `texts` overrides and the
 * `locale` prop down to the returns tree.
 */
export function ReturnsTextsProvider({
  texts,
  locale,
  children,
}: {
  texts?: Partial<ReturnsTexts>;
  locale?: string;
  children: ReactNode;
}) {
  const activeLocale = locale ?? getLocale();
  const value = useMemo(
    () => ({
      locale: activeLocale,
      texts: resolveReturnsTexts(activeLocale, texts),
    }),
    [activeLocale, texts],
  );

  return (
    <ReturnsTextsContext.Provider value={value}>
      {children}
    </ReturnsTextsContext.Provider>
  );
}

/**
 * Returns a lookup for the returns strings: the caller override when provided,
 * otherwise the default for the locale. Optional `values` fill `{placeholders}`.
 */
export function useReturnsText(): (
  key: ReturnsTextKey,
  values?: Record<string, string | number>,
) => string {
  const { texts } = useContext(ReturnsTextsContext);

  return useCallback(
    (key, values) =>
      values == null ? texts[key] : fillText(texts[key], values),
    [texts],
  );
}

/** Active locale of the returns views, for date and money formatting. */
export function useReturnsLocale(): string {
  return useContext(ReturnsTextsContext).locale;
}
