import { useState, useCallback, useEffect } from "react";

export function useUrlSearchParams<T extends Record<string, unknown>>(
  initialValue: T,
): [T, (params: Partial<T>) => void] {
  const [params, setParams] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const parsed: Partial<T> = {};
    
    (Object.keys(initialValue) as Array<keyof T>).forEach((key) => {
      const value = urlParams.get(key as string);
      if (value !== null) {
        try {
          (parsed as Record<string, unknown>)[key as string] = JSON.parse(value);
        } catch {
          (parsed as Record<string, unknown>)[key as string] = value as T[keyof T];
        }
      }
    });
    
    return { ...initialValue, ...parsed };
  });

  const updateParams = useCallback((newParams: Partial<T>) => {
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
        window.history.pushState({}, "", newUrl);
      }
      
      return updated;
    });
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const parsed: Partial<T> = {};
      
      (Object.keys(initialValue) as Array<keyof T>).forEach((key) => {
        const value = urlParams.get(key as string);
        if (value !== null) {
          try {
            (parsed as Record<string, unknown>)[key as string] = JSON.parse(value);
          } catch {
            (parsed as Record<string, unknown>)[key as string] = value as T[keyof T];
          }
        }
      });
      
      setParams({ ...initialValue, ...parsed });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [initialValue]);

  return [params, updateParams];
}
