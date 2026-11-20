import { useState, useCallback, useEffect, useRef } from "react";

export type UrlSearchParamsOptions<T> = {
  /**
   * Keys whose values are always strings (such as hashids like `"1e5"` that
   * `JSON.parse` would coerce to a number). A JSON-encoded string is unwrapped;
   * any other parsed value falls back to the raw URL string.
   */
  rawStringKeys?: ReadonlyArray<keyof T>;
};

export type SetUrlSearchParamsOptions = {
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
};

export function readUrlSearchParams<T extends Record<string, unknown>>(
  search: string,
  initialValue: T,
  rawStringKeys?: ReadonlyArray<keyof T>,
): T {
  const urlParams = new URLSearchParams(search);
  const parsed: Partial<T> = {};
  const rawSet = rawStringKeys ? new Set<keyof T>(rawStringKeys) : undefined;

  (Object.keys(initialValue) as Array<keyof T>).forEach((key) => {
    const value = urlParams.get(key as string);
    if (value !== null) {
      let decoded: unknown;
      try {
        decoded = JSON.parse(value);
      } catch {
        decoded = value;
      }
      if (rawSet?.has(key)) {
        (parsed as Record<string, unknown>)[key as string] =
          typeof decoded === "string" ? decoded : String(value);
      } else {
        (parsed as Record<string, unknown>)[key as string] = decoded;
      }
    }
  });

  return { ...initialValue, ...parsed };
}

export function useUrlSearchParams<T extends Record<string, unknown>>(
  initialValue: T,
  options?: UrlSearchParamsOptions<T>,
): [T, (params: Partial<T>, setOptions?: SetUrlSearchParamsOptions) => void] {
  const rawKeysRef = useRef(options?.rawStringKeys);
  rawKeysRef.current = options?.rawStringKeys;

  const [params, setParams] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    return readUrlSearchParams(
      window.location.search,
      initialValue,
      options?.rawStringKeys,
    );
  });

  const updateParams = useCallback(
    (newParams: Partial<T>, setOptions?: SetUrlSearchParamsOptions) => {
      setParams((prev) => {
        const updated = { ...prev, ...newParams };

        if (typeof window !== "undefined") {
          const urlParams = new URLSearchParams();
          (Object.keys(updated) as Array<keyof T>).forEach((key) => {
            const value = updated[key];
            if (value !== undefined && value !== null) {
              urlParams.set(key as string, JSON.stringify(value));
            }
          });

          const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
          if (setOptions?.replace) {
            window.history.replaceState({}, "", newUrl);
          } else {
            window.history.pushState({}, "", newUrl);
          }
        }

        return updated;
      });
    },
    [],
  );

  useEffect(() => {
    const handlePopState = () => {
      setParams(
        readUrlSearchParams(
          window.location.search,
          initialValue,
          rawKeysRef.current,
        ),
      );
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [initialValue]);

  return [params, updateParams];
}
