import { createContext, createElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import type { ClientEvent, Env, EventProps, PageType } from "./contract";
import { getTracker, initTracker, noopTracker, type BrowserEventName, type TrackExtra } from "./core";
import { useAnalytics, type AnalyticsApi } from "./react";

/**
 * The `analytics` prop of every instrumented bitsnap-react component.
 * `true` (the default) tracks, `false` opts out, an object tracks and can
 * forward each event to the merchant's own tools.
 */
export type AnalyticsOption =
  | boolean
  | {
      /** Called with every event this component emits, after Bitsnap Consent allows analytics. */
      onEvent?: (event: ClientEvent) => void;
      /** `test` events are stored but never reach the merchant's stats. */
      env?: Env;
    };

/** What the components call. It never throws and does nothing on the server. */
export interface Instrument {
  track<E extends BrowserEventName>(event: E, props: EventProps<E>, extra?: TrackExtra): void;
}

export const noopInstrument: Instrument = { track() {} };

type Latest = {
  projectKey: string | null | undefined;
  analytics: AnalyticsOption | undefined;
  pageType: PageType | undefined;
  provided: AnalyticsApi | null;
};

/** The instrument whose `track` call is running; lets `onEvent` listeners tell their own events apart. */
let emitting: symbol | null = null;

function createInstrument(read: () => Latest) {
  const id = Symbol("bitsnap-instrument");

  function target(): Pick<AnalyticsApi, "track"> | null {
    if (typeof window === "undefined") return null;
    const { projectKey, analytics, provided } = read();
    if (analytics === false) return null;
    // A <BitsnapAnalyticsProvider> owns the tracker.
    if (provided) return provided;
    if (!projectKey) return null;
    return initTracker({
      projectKey,
      source: "sdk_react",
      channel: "embed",
      env: typeof analytics === "object" ? analytics.env : undefined,
    });
  }

  const instrument: Instrument = {
    track(event, props, extra) {
      try {
        const tracker = target();
        if (!tracker) return;
        const { analytics, pageType } = read();
        const withPage = pageType && extra?.page_type === undefined ? { ...extra, page_type: pageType } : extra;
        emitting = typeof analytics === "object" && analytics.onEvent ? id : null;
        tracker.track(event, props, withPage);
      } catch {
        // Analytics never breaks the host page.
      } finally {
        emitting = null;
      }
    },
  };

  /** Starts the tracker on mount and wires `onEvent`. Returns the cleanup. */
  function attach(): () => void {
    try {
      if (!target()) return () => {};
      const tracker = getTracker();
      if (!tracker) return () => {};
      return tracker.onEvent((event) => {
        if (emitting !== id) return;
        try {
          const { analytics } = read();
          if (typeof analytics === "object") analytics.onEvent?.(event);
        } catch {}
      });
    } catch {
      return () => {};
    }
  }

  return { instrument, attach };
}

const InstrumentContext = createContext<Instrument | null>(null);

/** Hands the instrument of a top-level component to the parts below it. */
export function InstrumentProvider({ value, children }: { value: Instrument; children?: ReactNode }) {
  return createElement(InstrumentContext.Provider, { value }, children);
}

/** The instrument of the closest instrumented ancestor, or a no-op. */
export function useInstrumentContext(): Instrument {
  return useContext(InstrumentContext) ?? noopInstrument;
}

/**
 * The instrument of a top-level component. `projectKey` is the public
 * project id the component already has. When `analytics` is not given and an
 * ancestor is instrumented, the ancestor's instrument is reused.
 */
export function useInstrument(
  projectKey: string | null | undefined,
  analytics?: AnalyticsOption,
  pageType?: PageType,
): Instrument {
  const parent = useContext(InstrumentContext);
  const api = useAnalytics();
  const provided = api.track === noopTracker.track ? null : api;
  const latest = useRef<Latest>({ projectKey, analytics, pageType, provided });
  latest.current = { projectKey, analytics, pageType, provided };

  const own = useMemo(() => createInstrument(() => latest.current), []);
  const inherit = analytics === undefined && parent !== null;
  const hasListener = typeof analytics === "object" && !!analytics.onEvent;

  // A layout effect runs before the passive effects of the children, whose
  // first events (list viewed, cart opened) `onEvent` must not miss.
  useLayoutEffect(() => {
    if (inherit) return;
    return own.attach();
  }, [own, inherit, hasListener, projectKey]);

  return inherit ? parent : own.instrument;
}

// -- cart sink ---------------------------------------------------------------

let cartInstrument: Instrument = noopInstrument;

/**
 * The instrument used for cart changes made outside of a component (the
 * `Bitsnap.addProductToCart` helper). `<BitsnapCheckout>` registers its own.
 */
export function setCartInstrument(instrument: Instrument | null) {
  cartInstrument = instrument ?? noopInstrument;
}

let cartMuted = 0;

export function getCartInstrument(): Instrument {
  return cartMuted > 0 ? noopInstrument : cartInstrument;
}

/**
 * Runs `fn` with the cart sink muted, so a cart change made inside it (a custom
 * `onAddToCart` calling `Bitsnap.addProductToCart`) is not reported a second
 * time by the caller that reports it itself. Await the cart call inside `fn`.
 */
export async function withCartAnalyticsMuted<T>(fn: () => T | Promise<T>): Promise<T> {
  cartMuted++;
  try {
    return await fn();
  } finally {
    cartMuted--;
  }
}

/** Registers the instrument as the cart sink while the calling component is mounted. */
export function useCartInstrument(instrument: Instrument) {
  useEffect(() => {
    setCartInstrument(instrument);
    return () => {
      if (cartInstrument === instrument) setCartInstrument(null);
    };
  }, [instrument]);
}

// -- shared helpers ----------------------------------------------------------

/** Score (0..100) → the contract's bucket. */
export function scoreBucket(percent: number): "0-24" | "25-49" | "50-74" | "75-99" | "100" {
  const value = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  if (value >= 100) return "100";
  if (value >= 75) return "75-99";
  if (value >= 50) return "50-74";
  if (value >= 25) return "25-49";
  return "0-24";
}

/** Milestones (25/50/75/100) reached by `percent` that are not in `seen` yet. Adds them to `seen`. */
export function newMilestones(percent: number, seen: Set<number>): number[] {
  const reached: number[] = [];
  for (const milestone of [25, 50, 75, 100]) {
    if (percent >= milestone && !seen.has(milestone)) {
      seen.add(milestone);
      reached.push(milestone);
    }
  }
  return reached;
}
