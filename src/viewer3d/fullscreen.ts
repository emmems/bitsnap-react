import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

/**
 * Full screen for the viewer section: the Fullscreen API where an element can
 * go full screen, else a fixed CSS overlay (iPhone Safari has no element
 * fullscreen). Escape or close returns to the page at the same scroll position.
 */
export type FullscreenMode = "native" | "overlay";

function canUseNativeFullscreen(element: HTMLElement | null): boolean {
  return (
    element != null &&
    typeof element.requestFullscreen === "function" &&
    document.fullscreenEnabled === true
  );
}

export function useViewerFullscreen(ref: RefObject<HTMLElement | null>) {
  const [mode, setMode] = useState<FullscreenMode | null>(null);
  const scrollRef = useRef(0);

  const exit = useCallback(() => {
    if (document.fullscreenElement != null) {
      void document.exitFullscreen().catch(() => setMode(null));
      return;
    }
    setMode(null);
  }, []);

  const enter = useCallback(() => {
    const element = ref.current;
    scrollRef.current = window.scrollY;
    if (canUseNativeFullscreen(element)) {
      element!
        .requestFullscreen({ navigationUI: "hide" })
        .then(() => setMode("native"))
        .catch(() => setMode("overlay"));
      return;
    }
    setMode("overlay");
  }, [ref]);

  // Native: leaving with Escape or the browser's own control.
  useEffect(() => {
    const onChange = () => {
      if (document.fullscreenElement == null) {
        setMode((current) => (current === "native" ? null : current));
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Native: browsers handle Escape themselves; this covers the ones that pass
  // the key to the page instead.
  useEffect(() => {
    if (mode !== "native") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.fullscreenElement != null) {
        void document.exitFullscreen().catch(() => setMode(null));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  // Overlay: lock the page behind it and close it with Escape.
  useEffect(() => {
    if (mode !== "overlay") return;
    const { body, documentElement } = document;
    const previous = {
      overflow: body.style.overflow,
      rootOverflow: documentElement.style.overflow,
    };
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMode(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      body.style.overflow = previous.overflow;
      documentElement.style.overflow = previous.rootOverflow;
    };
  }, [mode]);

  // Back on the page where the buyer left it.
  useEffect(() => {
    if (mode == null && scrollRef.current > 0) {
      const y = scrollRef.current;
      scrollRef.current = 0;
      requestAnimationFrame(() =>
        window.scrollTo({ top: y, behavior: "instant" }),
      );
    }
  }, [mode]);

  return { mode, isFullscreen: mode != null, enter, exit };
}
