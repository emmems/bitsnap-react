import { useEffect, useState } from "react";

/**
 * Whole seconds left until `availableAt` (unix milliseconds), re-rendering once
 * a second and stopping at zero. `undefined` means nothing to wait for. The
 * value is read from the clock on every render, so a fresh deadline never
 * shows as elapsed for a frame.
 */
export function useSecondsUntil(availableAt: number | undefined): number {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (availableAt == null || Date.now() >= availableAt) {
      return;
    }
    const timer = setInterval(() => {
      setTick((tick) => tick + 1);
      if (Date.now() >= availableAt) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [availableAt]);

  return availableAt != null
    ? Math.max(0, Math.ceil((availableAt - Date.now()) / 1000))
    : 0;
}
