import { getTracker } from "@/src/analytics/core";

/** Matches the contract's `positions` / `product_ids` array limit. */
const MAX_PER_EVENT = 50;
const FLUSH_DELAY_MS = 1000;

export type ImpressionBatch = { productIds: string[]; positions: number[] };

/**
 * Collects the products that were at least half visible, each one once, and
 * hands them over in batches. Without `IntersectionObserver` nothing is
 * reported. Never throws.
 */
export function createImpressionTracker(
  onBatch: (batch: ImpressionBatch) => void,
  delayMs = FLUSH_DELAY_MS,
) {
  const seen = new Set<string>();
  const targets = new Map<Element, { id: string; position: number }>();
  let pendingIds: string[] = [];
  let pendingPositions: number[] = [];
  let observer: IntersectionObserver | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let listening = false;

  function flush() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    while (pendingIds.length > 0) {
      const productIds = pendingIds.slice(0, MAX_PER_EVENT);
      const positions = pendingPositions.slice(0, MAX_PER_EVENT);
      pendingIds = pendingIds.slice(MAX_PER_EVENT);
      pendingPositions = pendingPositions.slice(MAX_PER_EVENT);
      try {
        onBatch({ productIds, positions });
      } catch {}
    }
  }

  // The tracker flushes its own queue on `pagehide`; ours must be in it by then.
  function flushAll() {
    flush();
    try {
      getTracker()?.flush();
    } catch {}
  }
  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") flushAll();
  };

  function listen() {
    if (listening || typeof window === "undefined") return;
    listening = true;
    window.addEventListener("pagehide", flushAll, true);
    document.addEventListener("visibilitychange", onVisibility, true);
  }

  function getObserver(): IntersectionObserver | undefined {
    if (observer) return observer;
    if (typeof IntersectionObserver === "undefined") return undefined;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = targets.get(entry.target);
          if (!target || !entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
          targets.delete(entry.target);
          observer?.unobserve(entry.target);
          if (seen.has(target.id)) continue;
          seen.add(target.id);
          pendingIds.push(target.id);
          pendingPositions.push(target.position);
        }
        if (pendingIds.length > 0 && timer === undefined) {
          timer = setTimeout(flush, delayMs);
          (timer as { unref?: () => void }).unref?.();
        }
      },
      { threshold: [0.5] },
    );
    listen();
    return observer;
  }

  return {
    /** Starts watching a card. Returns a function that stops. */
    observe(element: Element, id: string, position: number): () => void {
      try {
        if (seen.has(id)) return () => {};
        const watcher = getObserver();
        if (!watcher) return () => {};
        targets.set(element, { id, position });
        watcher.observe(element);
        return () => {
          targets.delete(element);
          watcher.unobserve(element);
        };
      } catch {
        return () => {};
      }
    },
    flush,
    destroy() {
      try {
        flush();
        observer?.disconnect();
        if (listening) {
          window.removeEventListener("pagehide", flushAll, true);
          document.removeEventListener("visibilitychange", onVisibility, true);
          listening = false;
        }
      } catch {}
      observer = undefined;
      targets.clear();
    },
  };
}
