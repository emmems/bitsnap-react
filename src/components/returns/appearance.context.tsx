import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import {
  getReturnsSlotAppearance,
  resolveReturnsAppearance,
  type ResolvedReturnsAppearance,
  type ReturnsAppearance,
  type ReturnsSlotAppearance,
  type ReturnsSlotName,
} from "./appearance";

const ReturnsAppearanceContext = createContext<ResolvedReturnsAppearance>(
  resolveReturnsAppearance(),
);

/**
 * Returns scoped appearance provider. It only wraps the returns views, so the
 * configuration never leaks into checkout, the panel or the host page.
 */
export function ReturnsAppearanceProvider({
  appearance,
  children,
}: {
  appearance?: ReturnsAppearance;
  children: ReactNode;
}) {
  const resolved = useMemo(
    () => resolveReturnsAppearance(appearance),
    [appearance],
  );

  return (
    <ReturnsAppearanceContext.Provider value={resolved}>
      {children}
    </ReturnsAppearanceContext.Provider>
  );
}

export function useReturnsAppearance(): ResolvedReturnsAppearance {
  return useContext(ReturnsAppearanceContext);
}

/**
 * Returns the caller overrides for a slot, meant to be merged with the
 * built-in presentation:
 *
 * ```tsx
 * const slot = useReturnsSlot("title");
 *
 * return <h2 className={cn("text-xl font-semibold", slot.className)} style={slot.style} />;
 * ```
 */
export function useReturnsSlot(slot: ReturnsSlotName): ReturnsSlotAppearance {
  const resolved = useReturnsAppearance();

  return getReturnsSlotAppearance(resolved, slot) ?? {};
}
