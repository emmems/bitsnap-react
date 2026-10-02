import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import {
  getCheckoutSlotAppearance,
  resolveCheckoutAppearance,
  type CheckoutAppearance,
  type CheckoutSlotAppearance,
  type CheckoutSlotName,
  type ResolvedCheckoutAppearance,
} from "./appearance";

const CheckoutAppearanceContext = createContext<ResolvedCheckoutAppearance>(
  resolveCheckoutAppearance(),
);

/**
 * Checkout scoped appearance provider. It only wraps the checkout drawer, so
 * the configuration never leaks into the panel, the notifications or any
 * global state.
 */
export function CheckoutAppearanceProvider({
  appearance,
  children,
}: {
  appearance?: CheckoutAppearance;
  children: ReactNode;
}) {
  const resolved = useMemo(
    () => resolveCheckoutAppearance(appearance),
    [appearance],
  );

  return (
    <CheckoutAppearanceContext.Provider value={resolved}>
      {children}
    </CheckoutAppearanceContext.Provider>
  );
}

export function useCheckoutAppearance(): ResolvedCheckoutAppearance {
  return useContext(CheckoutAppearanceContext);
}

/**
 * Returns the caller overrides for a slot. The values are meant to be merged
 * with the built-in presentation:
 *
 * ```tsx
 * const slot = useCheckoutSlot("title");
 *
 * return <h1 className={cn("text-2xl font-medium", slot.className)} style={slot.style} />;
 * ```
 */
export function useCheckoutSlot(
  slot: CheckoutSlotName,
): CheckoutSlotAppearance {
  const resolved = useCheckoutAppearance();

  return getCheckoutSlotAppearance(resolved, slot) ?? {};
}
