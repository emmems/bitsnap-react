import { createContext, createElement, useContext, useMemo, useRef, type ReactNode } from "react";
import { useIsomorphicLayoutEffect } from "../lib/isomorphic-layout-effect";
import { initTracker, noopTracker, type Tracker, type TrackerOptions } from "./core";
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
  children?: ReactNode;
};

/**
 * Starts the page's tracker and hands `track` and `page` to `useAnalytics()`.
 * The tracker is a per-page singleton: the first valid `projectKey` wins, but
 * `env`, `endpoint` and `enabled` of any provider update the running tracker.
 * Nothing is tracked on the server, and nothing is stored on the visitor's device.
 */
export function BitsnapAnalyticsProvider({
  projectKey,
  env,
  enabled,
  endpoint,
  onEvent,
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
