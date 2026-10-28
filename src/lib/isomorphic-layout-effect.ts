import { useEffect, useLayoutEffect, type DependencyList, type EffectCallback } from "react";

/**
 * `useLayoutEffect` in the browser (it runs before any passive effect), `useEffect` on the server,
 * where React warns about layout effects. Chosen per call: a page's `window` can appear after import.
 */
export function useIsomorphicLayoutEffect(effect: EffectCallback, deps?: DependencyList): void {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- the environment never changes between renders
  (typeof window !== "undefined" ? useLayoutEffect : useEffect)(effect, deps);
}
