import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { getLocale } from "./locale";
import {
  getCheckoutText,
  type CheckoutTextKey,
  type CheckoutTexts,
} from "./texts";

type CheckoutTextsContextValue = {
  locale?: string;
  texts?: Partial<CheckoutTexts>;
};

const CheckoutTextsContext = createContext<CheckoutTextsContextValue>({});

/**
 * Checkout scoped texts provider. Carries the `texts` overrides and the
 * `locale` prop down to the checkout tree, so nothing leaks outside of it.
 */
export function CheckoutTextsProvider({
  texts,
  locale,
  children,
}: {
  texts?: Partial<CheckoutTexts>;
  locale?: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ texts, locale }), [texts, locale]);

  return (
    <CheckoutTextsContext.Provider value={value}>
      {children}
    </CheckoutTextsContext.Provider>
  );
}

/** The `texts` overrides and `locale` of the surrounding checkout, if any. */
export function useCheckoutTextsConfig(): CheckoutTextsContextValue {
  return useContext(CheckoutTextsContext);
}

/**
 * Returns the checkout string for `key`: the caller override when provided,
 * otherwise the default for the `locale` prop (or the active locale).
 */
export function useCheckoutText(key: CheckoutTextKey): string {
  const { texts, locale } = useContext(CheckoutTextsContext);

  return getCheckoutText(key, locale ?? getLocale(), texts);
}

/**
 * Like `useCheckoutText`, for a key picked at runtime (for example from a
 * backend error code).
 */
export function useCheckoutTextResolver(): (key: CheckoutTextKey) => string {
  const { texts, locale } = useContext(CheckoutTextsContext);
  const activeLocale = locale ?? getLocale();

  return useMemo(
    () => (key: CheckoutTextKey) => getCheckoutText(key, activeLocale, texts),
    [activeLocale, texts],
  );
}
