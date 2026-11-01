import { Box, Hand, Maximize2, Rotate3d, RotateCcw, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { formatModelSize, GESTURE_HINT_MS } from "./constants";
import { numberLocale, viewer3DCopy, type Viewer3DCopy } from "./copy";
import { modelFactRows } from "./facts";
import { useViewerFullscreen } from "./fullscreen";
import { hasSeenGestureHint, markGestureHintSeen } from "./gesture-hint";
import {
  initialShellState,
  isViewerMounted,
  shellReducer,
  type ShellModel,
} from "./shell.machine";
import { VIEWER3D_CSS, VIEWER3D_STYLE_HREF } from "./styles";
import type { Model3DView } from "./types";
import type { Viewer3DProps } from "./Viewer3D";

/** Theme of the viewer; each value sets one `--bitsnap-viewer3d-*` property. */
export type Viewer3DAppearance = {
  background?: string;
  foreground?: string;
  muted?: string;
  border?: string;
  accent?: string;
  radius?: string;
};

export type Model3DViewerProps = {
  model: Model3DView;
  /** The product name: the alt text of the poster. */
  productName: string;
  /** `pl-PL` (default) or an `en*` locale. */
  locale?: string;
  /** Overrides of any viewer string. */
  texts?: Partial<Viewer3DCopy>;
  appearance?: Viewer3DAppearance;
  /**
   * Draco decoder folder (trailing slash). Default: three's decoder files on
   * jsDelivr for the installed `three` revision.
   */
  decoderPath?: string;
  /**
   * "Report this model" link (DSA notice form); the viewer adds the page URL
   * as `url`. Absent = no link.
   */
  reportHref?: string;
  /** Bump to start loading now, whatever the size (e.g. from a "View in 3D" button). */
  startSignal?: number;
  /**
   * The bar at the bottom of the full screen view (name, price, buy button).
   * `close` leaves full screen. Absent = no bar.
   */
  renderFullscreenBar?: (args: { close: () => void }) => ReactNode;
  /** Hide the notes under the viewer (disclaimer, report link, model facts). */
  hideNotes?: boolean;
  id?: string;
  className?: string;
  style?: CSSProperties;
  /** @internal Tests replace the three viewer. */
  loadViewer?: () => Promise<{ default: ComponentType<Viewer3DProps> }>;
};

const loadDefaultViewer = () => import("./Viewer3D");

function appearanceStyle(appearance?: Viewer3DAppearance): CSSProperties {
  const style: Record<string, string> = {};
  if (appearance == null) return style;
  for (const [key, value] of Object.entries(appearance)) {
    if (value) style[`--bitsnap-viewer3d-${key}`] = value;
  }
  return style as CSSProperties;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) != null;
  } catch {
    return false;
  }
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [query]);
  return matches;
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

/**
 * The 3D viewer of one model, without data fetching (see `Product3DViewer`
 * for the product-id version). No three import: the poster, the states and
 * the controls live here; `Viewer3D` is loaded with `import()` in an effect
 * once the model may load, so the server render and the page's main chunk
 * never touch three.
 */
export function Model3DViewer({
  model,
  productName,
  locale,
  texts,
  appearance,
  decoderPath,
  reportHref,
  startSignal,
  renderFullscreenBar,
  hideNotes,
  id,
  className,
  style,
  loadViewer = loadDefaultViewer,
}: Model3DViewerProps) {
  const copy = viewer3DCopy(locale, texts);
  const shellModel: ShellModel = {
    key: model.previewUrl,
    size: model.previewSize,
  };
  const [state, dispatch] = useReducer(
    shellReducer,
    shellModel,
    initialShellState,
  );
  const [Viewer, setViewer] = useState<ComponentType<Viewer3DProps> | null>(
    null,
  );
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const pageVisible = usePageVisible();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  const [touchActive, setTouchActive] = useState(false);
  const [hint, setHint] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const fullscreen = useViewerFullscreen(frameRef);
  const titleID = useId();
  const themeStyle = appearanceStyle(appearance);

  // WebGL is checked once, in the browser.
  useEffect(() => {
    if (!hasWebGL()) dispatch({ type: "NO_WEBGL" });
  }, []);

  // Near the viewport → may load; on screen → may draw.
  useEffect(() => {
    const element = stageRef.current;
    if (element == null || typeof IntersectionObserver === "undefined") {
      setNear(true);
      setOnScreen(true);
      return;
    }
    const nearObserver = new IntersectionObserver(
      ([entry]) => setNear(entry?.isIntersecting ?? false),
      { rootMargin: "200px 0px" },
    );
    const screenObserver = new IntersectionObserver(
      ([entry]) => setOnScreen(entry?.isIntersecting ?? false),
      { threshold: 0.05 },
    );
    nearObserver.observe(element);
    screenObserver.observe(element);
    return () => {
      nearObserver.disconnect();
      screenObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (near) dispatch({ type: "VISIBLE" });
  }, [near, state.status]);

  // Another variant: the size rule is checked again for its model.
  useEffect(() => {
    dispatch({ type: "MODEL_CHANGED", model: shellModel, visible: near });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellModel.key, shellModel.size]);

  // An outside "View in 3D" button: start now, a big model included.
  const firstStart = useRef(startSignal);
  useEffect(() => {
    if (startSignal == null || startSignal === firstStart.current) return;
    dispatch({ type: "REQUEST" });
  }, [startSignal]);

  // The viewer code, only once the model may load.
  const mounted = isViewerMounted(state.status);
  useEffect(() => {
    if (!mounted || Viewer != null) return;
    let cancelled = false;
    loadViewer().then(
      (module) => {
        if (!cancelled) setViewer(() => module.default);
      },
      (error) => {
        console.warn(
          "[bitsnap-react/viewer3d] the viewer could not be loaded; are three, @react-three/fiber and @react-three/drei installed?",
          error,
        );
        if (!cancelled) dispatch({ type: "FAILED", key: state.model.key });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, Viewer, state.model.key, state.attempt]);

  // Gesture hint: once per browser, the first time the model is interactive.
  const ready = state.status === "ready";
  useEffect(() => {
    if (!ready || hasSeenGestureHint()) return;
    markGestureHintSeen();
    setHint(true);
    const timer = setTimeout(() => setHint(false), GESTURE_HINT_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  // Phones: rotating needs a tap first; a tap elsewhere or scrolling away gives the page back.
  useEffect(() => {
    if (!touchActive) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!frameRef.current?.contains(event.target as Node))
        setTouchActive(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [touchActive]);
  useEffect(() => {
    if (!onScreen && !fullscreen.isFullscreen) setTouchActive(false);
  }, [onScreen, fullscreen.isFullscreen]);

  const interactive = !coarsePointer || touchActive || fullscreen.isFullscreen;
  const onInteract = useCallback(() => setHint(false), []);

  const key = state.model.key;
  const onProgress = useCallback(
    (loaded: number, total: number) =>
      dispatch({ type: "PROGRESS", key, loaded, total }),
    [key],
  );
  const onLoaded = useCallback(() => dispatch({ type: "LOADED", key }), [key]);
  const onError = useCallback(
    (error: unknown) => {
      console.warn("[bitsnap-react/viewer3d] model failed", error);
      dispatch({ type: "FAILED", key });
    },
    [key],
  );

  const sizeLabel = formatModelSize(model.previewSize, numberLocale(locale));
  const percent = Math.round(state.progress * 100);
  const isFullscreen = fullscreen.isFullscreen;
  const motionAllowed =
    !reducedMotion && pageVisible && (onScreen || isFullscreen);

  // The overlay (no element fullscreen, e.g. iPhone) goes to <body>, so no
  // transformed or contained ancestor traps the fixed element.
  const portal = (node: ReactNode) =>
    fullscreen.mode === "overlay" ? createPortal(node, document.body) : node;

  return (
    <section
      id={id}
      aria-labelledby={titleID}
      data-bitsnap-viewer3d=""
      className={className}
      style={{ ...themeStyle, ...style }}
    >
      <style href={VIEWER3D_STYLE_HREF} precedence="default">
        {VIEWER3D_CSS}
      </style>
      <h2 id={titleID} className="bsv3d-sr">
        {copy.sectionLabel}
      </h2>
      {fullscreen.mode === "overlay" && (
        // Keeps the place of the frame while it is shown over the page.
        <div aria-hidden="true" className="bsv3d-placeholder" />
      )}
      {portal(
        <div
          ref={frameRef}
          data-viewer3d-frame=""
          data-state={state.status}
          data-motion={motionAllowed ? "on" : "off"}
          data-fullscreen={isFullscreen ? "" : undefined}
          className="bsv3d-frame"
          style={themeStyle}
          onClick={() => {
            if (ready && coarsePointer && !touchActive) {
              setTouchActive(true);
              setHint(false);
            }
          }}
        >
          <div ref={stageRef} className="bsv3d-stage">
            {mounted && Viewer != null && (
              <Viewer
                key={`${state.model.key}#${state.attempt}`}
                className="bsv3d-canvas"
                url={state.model.key}
                decoderPath={decoderPath}
                expectedSize={state.model.size}
                attempt={state.attempt}
                motionAllowed={motionAllowed}
                interactive={interactive}
                allowZoom={isFullscreen || (coarsePointer && touchActive)}
                resetSignal={resetSignal}
                onProgress={onProgress}
                onLoaded={onLoaded}
                onError={onError}
                onInteract={onInteract}
              />
            )}

            <Poster src={model.thumbnailUrl} alt={productName} hidden={ready} />

            {state.status === "loading" && (
              <div className="bsv3d-loading">
                <span className="bsv3d-chip" data-small="" aria-hidden="true">
                  {percent > 0 ? copy.loadingProgress(percent) : copy.loading}
                </span>
                <div className="bsv3d-bar">
                  <div style={{ width: `${Math.max(percent, 3)}%` }} />
                </div>
              </div>
            )}

            {state.status === "awaiting-click" && (
              <div className="bsv3d-center">
                <button
                  type="button"
                  className="bsv3d-button"
                  data-viewer3d-show=""
                  onClick={(event) => {
                    event.stopPropagation();
                    dispatch({ type: "REQUEST" });
                  }}
                >
                  <Box aria-hidden="true" />
                  {copy.show(sizeLabel)}
                </button>
              </div>
            )}

            {state.status === "error" && (
              <div className="bsv3d-center">
                <div role="alert" className="bsv3d-alert">
                  <p>{copy.error}</p>
                  <button
                    type="button"
                    className="bsv3d-button"
                    data-viewer3d-retry=""
                    onClick={(event) => {
                      event.stopPropagation();
                      dispatch({ type: "RETRY" });
                    }}
                  >
                    <RotateCcw aria-hidden="true" />
                    {copy.retry}
                  </button>
                </div>
              </div>
            )}

            {state.status === "unsupported" && (
              <p className="bsv3d-chip bsv3d-unsupported" data-small="">
                {copy.unsupported}
              </p>
            )}

            {/* The gesture hint, once per browser. */}
            {ready && (
              <div
                aria-hidden={!hint}
                className="bsv3d-hint"
                data-visible={hint ? "" : undefined}
              >
                <span className="bsv3d-chip">
                  {coarsePointer ? (
                    <Hand aria-hidden="true" />
                  ) : (
                    <Rotate3d aria-hidden="true" />
                  )}
                  {coarsePointer && !isFullscreen
                    ? copy.hintTap
                    : copy.hintDrag}
                </span>
              </div>
            )}

            {ready && (
              <div className="bsv3d-controls">
                <div>
                  {coarsePointer &&
                    !isFullscreen &&
                    (touchActive ? (
                      <button
                        type="button"
                        className="bsv3d-icon"
                        data-wide=""
                        onClick={(event) => {
                          event.stopPropagation();
                          setTouchActive(false);
                        }}
                      >
                        {copy.touchDone}
                      </button>
                    ) : (
                      !hint && (
                        <span className="bsv3d-chip" data-small="">
                          <Hand aria-hidden="true" />
                          {copy.hintTap}
                        </span>
                      )
                    ))}
                </div>
                <div>
                  <button
                    type="button"
                    aria-label={copy.reset}
                    title={copy.reset}
                    className="bsv3d-icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      setResetSignal((value) => value + 1);
                    }}
                  >
                    <RotateCcw aria-hidden="true" />
                  </button>
                  {!isFullscreen && (
                    <button
                      type="button"
                      aria-label={copy.fullscreen}
                      title={copy.fullscreen}
                      className="bsv3d-icon"
                      data-viewer3d-fullscreen=""
                      onClick={(event) => {
                        event.stopPropagation();
                        fullscreen.enter();
                      }}
                    >
                      <Maximize2 aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {isFullscreen && (
              <button
                type="button"
                aria-label={copy.closeFullscreen}
                title={copy.closeFullscreen}
                className="bsv3d-icon bsv3d-close"
                onClick={(event) => {
                  event.stopPropagation();
                  fullscreen.exit();
                }}
              >
                <X aria-hidden="true" />
              </button>
            )}

            <p className="bsv3d-sr" aria-live="polite">
              {state.status === "loading"
                ? percent > 0
                  ? copy.loadingProgress(percent)
                  : copy.loading
                : state.status === "error"
                  ? copy.error
                  : ""}
            </p>
          </div>

          {isFullscreen && renderFullscreenBar != null && (
            <div
              className="bsv3d-buybar"
              onClick={(event) => event.stopPropagation()}
            >
              {renderFullscreenBar({ close: fullscreen.exit })}
            </div>
          )}
        </div>,
      )}

      {!hideNotes && (
        <ModelNotes
          model={model}
          copy={copy}
          locale={locale}
          reportHref={reportHref}
        />
      )}
    </section>
  );
}

function Poster({
  src,
  alt,
  hidden,
}: {
  src?: string;
  alt: string;
  hidden: boolean;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      aria-hidden={hidden}
      className="bsv3d-poster"
      data-hidden={hidden ? "" : undefined}
    >
      {src != null && !broken ? (
        <img
          src={src}
          alt={alt}
          decoding="async"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <Box aria-hidden="true" strokeWidth={1.25} />
      )}
    </div>
  );
}

function ModelNotes({
  model,
  copy,
  locale,
  reportHref,
}: {
  model: Model3DView;
  copy: Viewer3DCopy;
  locale?: string;
  reportHref?: string;
}) {
  const [href, setHref] = useState(reportHref);
  // The notice form gets the page that is reported.
  useEffect(() => {
    if (reportHref == null) {
      setHref(undefined);
      return;
    }
    try {
      const url = new URL(reportHref, window.location.href);
      if (!url.searchParams.has("url"))
        url.searchParams.set("url", window.location.href);
      setHref(url.toString());
    } catch {
      setHref(reportHref);
    }
  }, [reportHref]);
  const facts =
    model.facts != null ? modelFactRows(model.facts, copy, locale) : [];

  if (!model.illustrative && href == null && facts.length === 0) return null;
  return (
    <div className="bsv3d-notes">
      {facts.length > 0 && (
        <div>
          <p className="bsv3d-facts-title">{copy.factsTitle}</p>
          <dl>
            {facts.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {(model.illustrative || href != null) && (
        <p className="bsv3d-links">
          {model.illustrative && <span>{copy.disclaimer}</span>}
          {href != null && <a href={href}>{copy.report}</a>}
        </p>
      )}
    </div>
  );
}
