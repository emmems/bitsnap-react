/** Skip length of the player buttons and of the lock-screen skip handlers. */
export const SEEK_STEP_SECONDS = 10;

/** Under this position "previous track" restarts the chapter instead of going back. */
export const PREVIOUS_TRACK_RESTART_SECONDS = 3;

export type MediaSessionArtwork = {
  src: string;
  sizes?: string;
  type?: string;
};

export type MediaSessionMetadata = {
  title: string;
  album?: string;
  artist?: string;
  artwork?: string | MediaSessionArtwork | (string | MediaSessionArtwork)[];
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
};

/** Lock-screen artwork size we declare; the player does not decode the image. */
const ARTWORK_SIZES = "512x512";

function mediaSessionAvailable(): boolean {
  return (
    typeof navigator != "undefined" &&
    typeof navigator.mediaSession != "undefined"
  );
}

/**
 * Turns an image URL into a media-session artwork entry. The `type` comes from
 * the file extension and is omitted when the extension is unknown, so the
 * browser does not get a wrong MIME type.
 */
export function mediaSessionArtworkFromUrl(url: string): MediaSessionArtwork {
  if (typeof url != "string" || url.length === 0) {
    return { src: url, sizes: ARTWORK_SIZES };
  }
  const withoutQuery = url.split(/[?#]/)[0];
  const extension = withoutQuery.includes(".")
    ? withoutQuery.slice(withoutQuery.lastIndexOf(".") + 1).toLowerCase()
    : "";
  const type = MIME_BY_EXTENSION[extension];
  const artwork: MediaSessionArtwork = { src: url, sizes: ARTWORK_SIZES };
  if (type != null) {
    artwork.type = type;
  }
  return artwork;
}

function normalizeArtwork(
  artwork: MediaSessionMetadata["artwork"],
): MediaSessionArtwork[] | undefined {
  if (artwork == null) {
    return undefined;
  }
  const entries = Array.isArray(artwork) ? artwork : [artwork];
  const normalized: MediaSessionArtwork[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      if (entry.length > 0) {
        normalized.push(mediaSessionArtworkFromUrl(entry));
      }
      continue;
    }
    if (entry != null && entry.src.length > 0) {
      normalized.push({
        src: entry.src,
        sizes: entry.sizes ?? ARTWORK_SIZES,
        ...(entry.type != null ? { type: entry.type } : {}),
      });
    }
  }
  return normalized.length > 0 ? normalized : undefined;
}

export function mediaSessionSetMetadata(metadata: MediaSessionMetadata) {
  if (
    !mediaSessionAvailable() ||
    typeof MediaMetadata == "undefined"
  ) {
    return;
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: metadata.title,
    album: metadata.album,
    artist: metadata.artist,
    artwork: normalizeArtwork(metadata.artwork),
  });
}

export function mediaSessionPlay() {
  if (!mediaSessionAvailable()) return;
  navigator.mediaSession.playbackState = "playing";
}

export function mediaSessionPause() {
  if (!mediaSessionAvailable()) return;
  navigator.mediaSession.playbackState = "paused";
}

/**
 * Reports duration, position and the real playback rate to the lock screen.
 * `setPositionState` throws on values it does not accept (no duration yet,
 * position past the end), so those calls are skipped or clamped.
 */
export function mediaSessionUpdateDurationAndPosition(
  duration: number | undefined,
  currentTime: number | undefined,
  playbackRate = 1,
) {
  if (!mediaSessionAvailable()) return;
  if (duration == null || !Number.isFinite(duration) || duration <= 0) {
    return;
  }
  if (currentTime != null && isNaN(currentTime)) {
    return;
  }
  const position = Math.min(Math.max(currentTime ?? 0, 0), duration);
  const rate =
    Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  try {
    navigator.mediaSession.setPositionState({
      playbackRate: rate,
      duration,
      position,
    });
  } catch (e) {
    // Older browsers reject some combinations; the lock screen just keeps the
    // previous state.
  }
}

const MEDIA_SESSION_ACTIONS: MediaSessionAction[] = [
  "play",
  "pause",
  "stop",
  "seekbackward",
  "seekforward",
  "seekto",
  "previoustrack",
  "nexttrack",
];

export function startMediaSessionCoordinator(args: {
  title: string;
  album?: string;
  artist?: string;
  artwork?: MediaSessionMetadata["artwork"];

  action: (details: MediaSessionActionDetails) => void;
}) {
  if (!mediaSessionAvailable()) return;

  mediaSessionSetMetadata({
    title: args.title,
    album: args.album,
    artist: args.artist,
    artwork: args.artwork,
  });

  for (const action of MEDIA_SESSION_ACTIONS) {
    try {
      navigator.mediaSession.setActionHandler(action, (details) => {
        args.action(details);
      });
    } catch (e) {
      // The browser does not support this action (e.g. nexttrack).
    }
  }
}

export function stopMediaSessionCoordinator() {
  if (!mediaSessionAvailable()) return;
  navigator.mediaSession.metadata = null;
  for (const action of MEDIA_SESSION_ACTIONS) {
    try {
      navigator.mediaSession.setActionHandler(action, null);
    } catch (e) {
      // Unsupported action; nothing to clear.
    }
  }
}
