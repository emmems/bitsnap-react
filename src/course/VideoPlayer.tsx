import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { useCourseView } from "./context";
import { PROGRESS_SAVE_INTERVAL_MS } from "./logic";

export type PlaybackReport = {
  positionSeconds: number;
  durationSeconds: number;
  reason: "periodic" | "pause" | "ended" | "leave";
};

type VideoPlayerProps = {
  /** HLS manifest URL. */
  src: string;
  poster?: string;
  /** Position to resume from, seconds. */
  startAt?: number;
  /** Length known from the lesson, used until the player knows it. */
  durationHint?: number;
  autoPlay?: boolean;
  /** Reports the position every ~15 s while playing, on pause and at the end. */
  onReport?: (report: PlaybackReport) => void;
  onEnded?: () => void;
  /** The signed URL was refused; the owner should load a fresh one. */
  onExpired?: () => void;
  className?: string;
};

function canPlayNativeHls(video: HTMLVideoElement): boolean {
  return video.canPlayType("application/vnd.apple.mpegurl") !== "";
}

/**
 * HLS player: hls.js where there is Media Source support, the native player
 * of Safari otherwise.
 */
export function VideoPlayer({
  src,
  poster,
  startAt = 0,
  durationHint = 0,
  autoPlay = false,
  onReport,
  onEnded,
  onExpired,
  className,
}: VideoPlayerProps) {
  const { texts } = useCourseView();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Callbacks change on every render of the owner; the player must not reload.
  const callbacks = useRef({ onReport, onEnded, onExpired, durationHint });
  callbacks.current = { onReport, onEnded, onExpired, durationHint };
  const lastReported = useRef<number | undefined>(undefined);

  const report = useCallback((reason: PlaybackReport["reason"]) => {
    const video = videoRef.current;
    if (video == null || callbacks.current.onReport == null) {
      return;
    }
    const positionSeconds = Math.floor(video.currentTime);
    if (positionSeconds <= 0 && reason !== "ended") {
      return;
    }
    const duration = Number.isFinite(video.duration)
      ? video.duration
      : callbacks.current.durationHint;
    lastReported.current = positionSeconds;
    callbacks.current.onReport({
      positionSeconds,
      durationSeconds: Math.floor(duration || 0),
      reason,
    });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video == null) {
      return;
    }
    setFailed(false);
    let hls: Hls | undefined;
    let retriedNetwork = false;
    let retriedMedia = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (startAt > 0) {
        video.currentTime = startAt;
      }
      if (autoPlay) {
        void video.play().catch(() => {
          // The browser blocked autoplay; the viewer presses play.
        });
      }
    };

    if (canPlayNativeHls(video)) {
      video.src = src;
      video.addEventListener("loadedmetadata", start, { once: true });
    } else if (Hls.isSupported()) {
      hls = new Hls();
      hls.attachMedia(video);
      hls.loadSource(src);
      hls.on(Hls.Events.MANIFEST_PARSED, start);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) {
          return;
        }
        const status = data.response?.code;
        if (status === 401 || status === 403) {
          callbacks.current.onExpired?.();
          setFailed(true);
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !retriedNetwork) {
          retriedNetwork = true;
          hls?.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !retriedMedia) {
          retriedMedia = true;
          hls?.recoverMediaError();
        } else {
          setFailed(true);
        }
      });
    } else {
      video.src = src;
    }

    const onPlay = () => {
      clearInterval(timer);
      timer = setInterval(() => report("periodic"), PROGRESS_SAVE_INTERVAL_MS);
    };
    const onPause = () => {
      clearInterval(timer);
      // `ended` has its own report.
      if (!video.ended) report("pause");
    };
    const onVideoEnded = () => {
      clearInterval(timer);
      report("ended");
      callbacks.current.onEnded?.();
    };
    const onVideoError = () => {
      if (hls == null) {
        setFailed(true);
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onVideoEnded);
    video.addEventListener("error", onVideoError);

    return () => {
      clearInterval(timer);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onVideoEnded);
      video.removeEventListener("error", onVideoError);
      video.removeEventListener("loadedmetadata", start);
      // Leaving the lesson mid-video keeps the position.
      if (!video.ended && video.currentTime > 0) report("leave");
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
    // `startAt` and `autoPlay` only matter when a video starts loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, attempt]);

  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-black", className)}>
      <video
        ref={videoRef}
        className="aspect-video w-full"
        poster={poster}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload"
      />
      {failed && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center text-sm text-white"
        >
          <p>{texts.videoError}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              callbacks.current.onExpired?.();
              setAttempt((n) => n + 1);
            }}
          >
            {texts.videoRetry}
          </Button>
        </div>
      )}
    </div>
  );
}
