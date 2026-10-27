import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncResource<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: undefined; error: unknown };

/**
 * Loads a value on the client when `deps` change. `reload` shows the loading
 * state again, `refresh` replaces the data quietly, `mutate` edits it locally.
 * An answer to an outdated request is dropped.
 */
export function useAsyncResource<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  initialData?: T,
): AsyncResource<T> & {
  reload: () => void;
  refresh: () => void;
  mutate: (update: (data: T) => T) => void;
} {
  const [state, setState] = useState<AsyncResource<T>>(
    initialData !== undefined
      ? { status: "success", data: initialData }
      : { status: "loading" },
  );
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const skipFirst = useRef(initialData !== undefined);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const id = ++requestId.current;
    setState({ status: "loading" });
    loadRef
      .current()
      .then((data) => {
        if (id === requestId.current) setState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (id === requestId.current) setState({ status: "error", error });
      });
    return () => {
      requestId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    loadRef
      .current()
      .then((data) => {
        if (id === requestId.current) setState({ status: "success", data });
      })
      .catch(() => {
        // Keep what is on screen; a quiet refresh must not replace it with an error.
      });
  }, []);

  const mutate = useCallback((update: (data: T) => T) => {
    setState((current) =>
      current.status === "success"
        ? { status: "success", data: update(current.data) }
        : current,
    );
  }, []);

  return { ...state, reload, refresh, mutate } as AsyncResource<T> & {
    reload: () => void;
    refresh: () => void;
    mutate: (update: (data: T) => T) => void;
  };
}
