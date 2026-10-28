import { createContext, createElement, useContext, useMemo, useRef, type ReactNode } from "react";
import { useIsomorphicLayoutEffect } from "../lib/isomorphic-layout-effect";
import { initTracker, noopTracker, startAutoPageViews, type Tracker, type TrackerOptions } from "./core";
import type { ClientEvent } from "./contract";

export type AnalyticsApi = Pick<Tracker, "track" | "page">;

const noop: AnalyticsApi = { track: noopTracker.track, page: noopTracker.page };

const AnalyticsContext = createContext<AnalyticsApi>(noop);

export type BitsnapAnalyticsProviderProps = {
  /** Public project key (the `projectID` the rest of the SDK uses). */
  projectKey: string;
  env?: TrackerOptions["env"];
  /** `false` turns tracking off. */
  enabled?: boolean;
  endpoint?: string;
  /** Called with every event before it is sent, e.g. to forward it to the merchant's own tools. */
  onEvent?: (event: ClientEvent) => void;
  /**
   * Sends `page_view` on mount and on every path change (`pushState`, `replaceState`, Back/Forward).
   * Default `true`; set `false` to call `page()` yourself.
   */
  autoPageViews?: boolean;
  children?: ReactNode;
};

/**
 * Starts the page's tracker and hands `track` and `page` to `useAnalytics()`.
 * The tracker is a per-page singleton: the first valid `projectKey` wins, but
 * `env`, `endpoint` and `enabled` of any provider update the running tracker.
 * It sends a `page_view` for the current page and every path change, once per
 * path however many providers, instrumented components or `analytics.js`
 * embeds the page has.
 * Nothing is tracked on the server. The only thing stored on the visitor's
 * device is the `bs_vid_<projectKey>` cookie, and only while Bitsnap Consent grants analytics.
 */
export function BitsnapAnalyticsProvider({
  projectKey,
  env,
  enabled,
  endpoint,
  onEvent,
  autoPageViews,
  children,
}: BitsnapAnalyticsProviderProps) {
  const tracker = useMemo(
    () => initTracker({ projectKey, env, endpoint, enabled }),
    // The tracker is a per-page singleton; `initTracker` applies env/endpoint/enabled changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectKey, env, endpoint],
  );
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Before the passive effects of the children, whose first events must already respect it.
  useIsomorphicLayoutEffect(() => {
    tracker.setEnabled(enabled !== false);
  }, [tracker, enabled]);

  // Also before the children's events, so the page view comes first. The page type is cleared:
  // an automatic view must not inherit the type of an earlier manual `page(type)`.
  useIsomorphicLayoutEffect(() => {
    if (autoPageViews === false || enabled === false || tracker === noopTracker) return;
    return startAutoPageViews(() => tracker.page(null));
  }, [tracker, autoPageViews, enabled]);

  // Layout effects run before the passive effects of the children, whose
  // first events (list viewed, cart opened) would otherwise be missed.
  useIsomorphicLayoutEffect(() => tracker.onEvent((event) => onEventRef.current?.(event)), [tracker]);

  const api = useMemo<AnalyticsApi>(
    () => ({ track: tracker.track.bind(tracker), page: tracker.page.bind(tracker) }),
    [tracker],
  );
  return createElement(AnalyticsContext.Provider, { value: api }, children);
}

/** `track` and `page`; no-ops outside a `<BitsnapAnalyticsProvider>`. */
export function useAnalytics(): AnalyticsApi {
  return useContext(AnalyticsContext);
}
