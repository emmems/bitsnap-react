import { useCallback, useEffect, useRef, useState } from "react";
import type { FailureMessage } from "../../../gen/proto/public/v1/public_api_pb";

/** What one product RPC call answered. */
export type LoadResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: FailureMessage };

export type LoadState<T> =
  | { status: "loading"; value?: T }
  | { status: "ok"; value: T }
  /** The server answered with a failure code (not found, unauthorized, ...). */
  | { status: "failure"; failure: FailureMessage }
  /** The call threw: network, server error. */
  | { status: "error" };

/**
 * Runs `run` on mount and whenever `key` changes, and keeps the outcome as a
 * state. `reload()` runs it again (a retry button); `reload({ keep: true })`
 * keeps showing the last value while it runs (a refresh of signed URLs).
 * Answers of an older run, or after unmount, are dropped.
 */
export function useProductLoad<T>(
  run: () => Promise<LoadResult<T>>,
  key: string,
): [LoadState<T>, (options?: { keep?: boolean }) => void] {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const runRef = useRef(run);
  runRef.current = run;
  const callRef = useRef(0);

  const load = useCallback((options?: { keep?: boolean }) => {
    const call = ++callRef.current;
    setState((previous) =>
      options?.keep && previous.status === "ok"
        ? { status: "loading", value: previous.value }
        : { status: "loading" },
    );
    runRef
      .current()
      .then((result) => {
        if (call !== callRef.current) return;
        setState(
          result.ok
            ? { status: "ok", value: result.value }
            : { status: "failure", failure: result.failure },
        );
      })
      .catch((error: unknown) => {
        if (call !== callRef.current) return;
        console.warn("[bitsnap panel] product request failed", error);
        setState({ status: "error" });
      });
  }, []);

  useEffect(() => {
    load();
    return () => {
      callRef.current++;
    };
  }, [key, load]);

  return [state, load];
}
