export type PlayerErrorKind = "network" | "media" | "unknown";

/** Playback failure the parent can show and offer a retry for. */
export type PlayerError = {
  kind: PlayerErrorKind;
  status?: number;
};

/** Statuses a signed URL returns once it expired; the owner should refetch it. */
const EXPIRED_STATUSES = [401, 403];

/** hls.js `ErrorTypes.NETWORK_ERROR`. */
const NETWORK_ERROR = "networkError";
/** hls.js `ErrorTypes.MEDIA_ERROR`. */
const MEDIA_ERROR = "mediaError";

export type HlsErrorData = {
  fatal?: boolean;
  type?: string;
  response?: { code?: number };
};

/** The subset of the hls.js API the player uses; kept small so tests can fake it. */
export type HlsLike = {
  attachMedia: (media: HTMLMediaElement) => void;
  loadSource: (src: string) => void;
  startLoad: () => void;
  recoverMediaError: () => void;
  destroy: () => void;
  on: (event: string, listener: (event: string, data: HlsErrorData) => void) => void;
};

export type HlsConstructor = {
  isSupported: () => boolean;
  Events: { ERROR: string };
  ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
  new (): HlsLike;
};

export type HlsErrorDecision =
  | { action: "ignore" }
  | { action: "expired"; error: PlayerError }
  | { action: "restart-load" }
  | { action: "recover-media" }
  | { action: "fail"; error: PlayerError };

/**
 * What to do with an hls.js error. Only fatal errors matter: a signed URL that
 * expired asks the owner for a fresh one, a network failure gets one
 * `startLoad()` retry, a media failure one `recoverMediaError()` retry, and
 * anything else is reported to the parent.
 */
export function decideHlsError(
  data: HlsErrorData | null | undefined,
  retried: { network: boolean; media: boolean },
): HlsErrorDecision {
  if (data == null || data.fatal !== true) {
    return { action: "ignore" };
  }
  const status = data.response?.code;
  const kind: PlayerErrorKind =
    data.type === NETWORK_ERROR
      ? "network"
      : data.type === MEDIA_ERROR
        ? "media"
        : "unknown";
  const error: PlayerError = status == null ? { kind } : { kind, status };

  if (status != null && EXPIRED_STATUSES.includes(status)) {
    return { action: "expired", error: { kind: "network", status } };
  }
  if (data.type === NETWORK_ERROR && !retried.network) {
    return { action: "restart-load" };
  }
  if (data.type === MEDIA_ERROR && !retried.media) {
    return { action: "recover-media" };
  }
  return { action: "fail", error };
}

export type HlsSourceHandlers = {
  /** A fatal error the player could not recover from. */
  onError?: (error: PlayerError) => void;
  /** The signed URL was refused (401/403); the owner should refetch it. */
  onExpiredUrl?: () => void;
  /**
   * hls.js loaded but this browser cannot use it (`Hls.isSupported()` is
   * false): the owner should let the media element try the URL itself.
   */
  onUnsupported?: (src: string) => void;
};

export type HlsSource = {
  load: (src: string) => void;
  /** Loads the current source again, giving the error retries a new chance. */
  retry: () => void;
  destroy: () => void;
  readonly src: string | undefined;
};

/**
 * True when the browser has Media Source Extensions, the precondition for
 * hls.js. Cheap and library-free, so the player can decide before it loads
 * hls.js; the exact `Hls.isSupported()` check runs once the library is in.
 */
export function hasMediaSource(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.MediaSource || w.ManagedMediaSource || w.WebKitMediaSource);
}

/** Loads hls.js on first use; bundlers split it into its own chunk. */
async function loadHlsConstructor(): Promise<HlsConstructor> {
  const module = await import("hls.js");
  return module.default as unknown as HlsConstructor;
}

/**
 * hls.js playback for one media element, mirroring the course `VideoPlayer`:
 * one network retry, one media recovery, expired URLs handed to the owner.
 * `HlsCtor` is injectable so the error paths can be tested without a stream.
 * Without it, hls.js is imported on first use: `load()` records the URL and
 * the stream starts once the library arrived; `destroy()` before that cancels.
 */
export function createHlsSource(args: {
  media: HTMLMediaElement;
  handlers?: HlsSourceHandlers;
  HlsCtor?: HlsConstructor;
}): HlsSource {
  let instance: HlsLike | undefined;
  let destroyed = false;
  let src: string | undefined;
  let retriedNetwork = false;
  let retriedMedia = false;

  function start(HlsImpl: HlsConstructor) {
    if (destroyed) {
      return;
    }
    if (args.HlsCtor == null && !HlsImpl.isSupported()) {
      if (src != null) {
        args.handlers?.onUnsupported?.(src);
      }
      return;
    }
    const created = new HlsImpl();
    instance = created;
    created.attachMedia(args.media);
    created.on(HlsImpl.Events.ERROR, (_event, data) => {
      const decision = decideHlsError(data, {
        network: retriedNetwork,
        media: retriedMedia,
      });
      switch (decision.action) {
        case "expired":
          args.handlers?.onExpiredUrl?.();
          args.handlers?.onError?.(decision.error);
          break;
        case "restart-load":
          retriedNetwork = true;
          created.startLoad();
          break;
        case "recover-media":
          retriedMedia = true;
          created.recoverMediaError();
          break;
        case "fail":
          args.handlers?.onError?.(decision.error);
          break;
        case "ignore":
          break;
      }
    });
    if (src != null) {
      created.loadSource(src);
    }
  }

  if (args.HlsCtor != null) {
    start(args.HlsCtor);
  } else {
    loadHlsConstructor().then(start, () => {
      if (!destroyed) {
        // The chunk did not arrive (offline, blocked): the player offers a retry.
        args.handlers?.onError?.({ kind: "network" });
      }
    });
  }

  return {
    load(nextSrc) {
      src = nextSrc;
      retriedNetwork = false;
      retriedMedia = false;
      instance?.loadSource(nextSrc);
    },
    retry() {
      if (src == null) {
        return;
      }
      retriedNetwork = false;
      retriedMedia = false;
      instance?.loadSource(src);
    },
    destroy() {
      destroyed = true;
      instance?.destroy();
    },
    get src() {
      return src;
    },
  };
}

/** True when the element plays HLS itself (Safari, iOS); no user-agent sniffing. */
export function prefersNativeHls(
  video: Pick<HTMLMediaElement, "canPlayType">,
): boolean {
  try {
    return video.canPlayType("application/vnd.apple.mpegurl") !== "";
  } catch (e) {
    return false;
  }
}

/** Maps a media element `MediaError` to the error the parent sees. */
export function playerErrorFromMediaError(
  mediaError: MediaError | null | undefined,
): PlayerError {
  switch (mediaError?.code) {
    case 2:
      return { kind: "network" };
    case 3:
    case 4:
      return { kind: "media" };
    default:
      return { kind: "unknown" };
  }
}
