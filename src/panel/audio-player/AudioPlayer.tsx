import Hls from "hls.js";
import { Pause, Play } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Button } from "../../ui/button";
import LoadingIndicator from "../LoadingIndicator";
import {
  createHlsSource,
  playerErrorFromMediaError,
  prefersNativeHls,
  type HlsSource,
  type PlayerError,
} from "./hls-engine";
import {
  PREVIOUS_TRACK_RESTART_SECONDS,
  SEEK_STEP_SECONDS,
  mediaSessionPause,
  mediaSessionPlay,
  mediaSessionSetMetadata,
  mediaSessionUpdateDurationAndPosition,
  startMediaSessionCoordinator,
  stopMediaSessionCoordinator,
} from "./media.session.coordinator";

import "./audio-player.css";

type ChapterWithPublicUrl = {
  id: string;
  multimediaId?: string;
  name: string;
  description?: string;
  publicUrl: string;
  downloadableUrl?: string;
  duration?: number;
};

/** What the player could not play; `status` is the HTTP status when known. */
export type AudioPlayerError = PlayerError;

export type AudioPlayerMethods = {
  selectChapter: (chapter: ChapterWithPublicUrl) => void;
  /** Loads the current chapter again after an error, keeping the position. */
  retry: () => void;
  /** The error currently shown, if any. */
  getError: () => AudioPlayerError | null;
};

type AudioPlayerProps = {
  chapters: ChapterWithPublicUrl[];
  styles: CSSProperties;
  updateCurrentTime?: (currentTime: number) => void;

  title?: string;
  imageURL?: string;
  /** Book author, used as the lock-screen artist. */
  author?: string;

  setCurrentTimeHandler?: (seekTo: (second: number) => void) => void;
  uniqueProductID: string;

  onChapterChange?: (chapter: ChapterWithPublicUrl) => void;
  /** A fatal playback error the player could not recover from. */
  onError?: (error: AudioPlayerError) => void;
  /** The signed URL returned 401/403; the owner should refetch the chapters. */
  onExpiredUrl?: () => void;
  /** The last chapter ended. */
  onFinished?: () => void;
};

const AudioPlayer = forwardRef<AudioPlayerMethods, AudioPlayerProps>(
  (
    {
      chapters,
      styles,
      updateCurrentTime,
      setCurrentTimeHandler,
      title,
      imageURL,
      author,
      uniqueProductID,
      onChapterChange,
      onError,
      onExpiredUrl,
      onFinished,
    },
    ref,
  ) => {
    enum PlayState {
      Playing,
      Paused,
    }

    const [playState, setPlayState] = useState<PlayState>(PlayState.Paused);
    const [currentTime, setCurrentTime] = useState<number | undefined>(
      undefined,
    );
    const [duration, setDuration] = useState<number | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);
    const [playerError, setPlayerError] = useState<AudioPlayerError | null>(
      null,
    );

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<HlsSource | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(
      undefined,
    );

    const audioPlayerContainerRef = useRef<HTMLDivElement>(null!);

    const currentChapterRef = useRef<ChapterWithPublicUrl | null>(null);
    const playerErrorRef = useRef<AudioPlayerError | null>(null);

    /** Set by a user action; the next `loadeddata` starts playback once. */
    const playWhenReadyRef = useRef(false);
    /** Position restored for the chapter that is loading, once. */
    const resumedRef = useRef(false);
    /** Position to restore instead of the remembered one (URL refresh, retry). */
    const pendingSeekRef = useRef<number | null>(null);
    const chaptersRef = useRef(chapters);
    const chaptersSignatureRef = useRef<string | null>(null);

    // The owner passes new callbacks on every render; the player must keep the
    // current ones without restarting playback.
    const callbacksRef = useRef({
      onChapterChange,
      onError,
      onExpiredUrl,
      onFinished,
      updateCurrentTime,
      title,
      imageURL,
      author,
    });
    callbacksRef.current = {
      onChapterChange,
      onError,
      onExpiredUrl,
      onFinished,
      updateCurrentTime,
      title,
      imageURL,
      author,
    };

    function saveLastPlayedTime(timeInSeconds: number) {
      if (!Number.isFinite(timeInSeconds) || timeInSeconds < 10) {
        return;
      }
      localStorage.setItem(
        `__player__${uniqueProductID}_${currentChapterRef.current?.id}`,
        `${Math.floor(timeInSeconds)}`,
      );
    }

    function getLastPlayedTime(): number | undefined {
      const time = localStorage.getItem(
        `__player__${uniqueProductID}_${currentChapterRef.current?.id}`,
      );

      if (time == null) {
        return undefined;
      }
      try {
        const result = parseInt(time);

        if (isNaN(result) || result < 0) {
          return undefined;
        }

        return result;
      } catch (e) {
        return undefined;
      }
    }

    function getLastSelectedChapterID(): string | undefined {
      const lastSelectedChapterID = localStorage.getItem(
        `__player__${uniqueProductID}_last_chapter`,
      );
      if (lastSelectedChapterID == null) {
        return undefined;
      }
      return lastSelectedChapterID;
    }

    function setLastSelectedChapterID(chapterID: string) {
      localStorage.setItem(
        `__player__${uniqueProductID}_last_chapter`,
        chapterID,
      );
    }

    function deleteMemoryChapter(chapterID: string) {
      localStorage.removeItem(`__player__${uniqueProductID}_${chapterID}`);
    }

    function syncMediaSessionMetadata(chapter: ChapterWithPublicUrl | null) {
      mediaSessionSetMetadata({
        title: chapter?.name ?? callbacksRef.current.title ?? "",
        album: callbacksRef.current.title,
        artist: callbacksRef.current.author,
        artwork: callbacksRef.current.imageURL,
      });
    }

    function reportError(error: AudioPlayerError) {
      playerErrorRef.current = error;
      setPlayerError(error);
      setIsLoading(false);
      callbacksRef.current.onError?.(error);
    }

    function clearError() {
      playerErrorRef.current = null;
      setPlayerError(null);
    }

    function attemptPlay() {
      const video = videoRef.current;
      if (video == null) {
        return;
      }
      const result = video.play() as Promise<void> | undefined;
      if (result != null && typeof result.catch == "function") {
        result.catch(() => {
          // The browser blocked playback; the user presses play.
        });
      }
      updatePlayerDetails();
    }

    function play() {
      attemptPlay();
    }

    function pause() {
      videoRef.current?.pause();
      updatePlayerDetails();
    }

    function togglePlayState() {
      if (playState === PlayState.Playing) {
        pause();
        return;
      }
      play();
    }

    function seekTo(toSecond: number) {
      const video = videoRef.current;
      if (video == null || !Number.isFinite(toSecond)) {
        return;
      }
      const knownDuration = Number.isFinite(video.duration) ? video.duration : 0;
      const target =
        knownDuration > 0
          ? Math.min(Math.max(toSecond, 0), knownDuration)
          : Math.max(toSecond, 0);
      setCurrentTime(target);
      video.currentTime = target;
      updatePlayerDetails();
    }

    function seekBy(seconds: number) {
      const video = videoRef.current;
      if (video == null) {
        return;
      }
      const knownDuration = Number.isFinite(video.duration)
        ? video.duration
        : undefined;
      let target = Math.max(video.currentTime + seconds, 0);
      if (knownDuration != null && target > knownDuration) {
        target = knownDuration;
      }
      seekTo(target);
    }

    function loadSource(src: string) {
      const video = videoRef.current;
      if (video == null) {
        return;
      }
      clearError();
      setIsLoading(true);

      if (prefersNativeHls(video)) {
        destroyHls();
        video.src = src;
        video.load();
        return;
      }

      if (Hls.isSupported()) {
        if (hlsRef.current == null) {
          hlsRef.current = createHlsSource({
            media: video,
            handlers: {
              onError: (error) => {
                reportError(error);
              },
              onExpiredUrl: () => {
                callbacksRef.current.onExpiredUrl?.();
              },
            },
          });
        }
        hlsRef.current.load(src);
        return;
      }

      // No Media Source and no native HLS: let the browser try the URL itself.
      destroyHls();
      video.src = src;
      video.load();
    }

    function destroyHls() {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    }

    function playChapter(
      chapter: ChapterWithPublicUrl,
      options?: { play?: boolean },
    ) {
      const shouldPlay = options?.play === true;
      resumedRef.current = false;
      pendingSeekRef.current = null;
      playWhenReadyRef.current = shouldPlay;
      currentChapterRef.current = chapter;
      loadSource(chapter.publicUrl);
      syncMediaSessionMetadata(chapter);
      callbacksRef.current.onChapterChange?.(chapter);
      setLastSelectedChapterID(chapter.id);
    }

    function loadChapters(list: ChapterWithPublicUrl[]) {
      if (list.length === 0) {
        return;
      }

      const chapterID = getLastSelectedChapterID();
      const chapter =
        (chapterID != null
          ? list.find((candidate) => candidate.id === chapterID)
          : undefined) ?? list[0];

      // Mount and content changes never start playback on their own.
      playChapter(chapter, { play: false });
    }

    function playNextChapter() {
      const list = chaptersRef.current;
      const current = currentChapterRef.current;
      if (list == null || list.length === 0 || current == null) {
        return;
      }
      const currentChapterIndex = list.findIndex(
        (chapter) => chapter.id === current.id,
      );
      if (currentChapterIndex === -1) {
        return;
      }
      deleteMemoryChapter(current.id);
      const nextChapterIndex = currentChapterIndex + 1;
      if (nextChapterIndex >= list.length) {
        finishPlayback(current);
        return;
      }
      playChapter(list[nextChapterIndex], { play: true });
    }

    function playPreviousChapter() {
      const list = chaptersRef.current;
      const current = currentChapterRef.current;
      if (current == null) {
        return;
      }
      const video = videoRef.current;
      if (
        video != null &&
        video.currentTime > PREVIOUS_TRACK_RESTART_SECONDS
      ) {
        seekTo(0);
        return;
      }
      const currentChapterIndex =
        list == null
          ? -1
          : list.findIndex((chapter) => chapter.id === current.id);
      if (currentChapterIndex > 0) {
        playChapter(list[currentChapterIndex - 1], { play: true });
        return;
      }
      seekTo(0);
    }

    function finishPlayback(chapter: ChapterWithPublicUrl) {
      // The chapter is done: no resume point, and the element stays at the end.
      deleteMemoryChapter(chapter.id);
      playWhenReadyRef.current = false;
      videoRef.current?.pause();
      setPlayState(PlayState.Paused);
      callbacksRef.current.onFinished?.();
    }

    function handleEnded() {
      const current = currentChapterRef.current;
      if (current == null) {
        return;
      }
      playNextChapter();
      updatePlayerDetails();
    }

    function handleLoadedData() {
      const video = videoRef.current;
      if (video == null) {
        return;
      }
      setIsLoading(false);
      if (!resumedRef.current) {
        resumedRef.current = true;
        const pending = pendingSeekRef.current;
        pendingSeekRef.current = null;
        if (pending != null) {
          seekTo(pending);
        } else {
          const lastPlayedTime = getLastPlayedTime();
          if (lastPlayedTime != null) {
            seekTo(lastPlayedTime);
          }
        }
      }
      if (playWhenReadyRef.current) {
        playWhenReadyRef.current = false;
        attemptPlay();
      }
    }

    function handleMediaElementError() {
      reportError(playerErrorFromMediaError(videoRef.current?.error));
    }

    function retry() {
      const chapter = currentChapterRef.current;
      const src = chapter?.publicUrl ?? hlsRef.current?.src;
      if (src == null) {
        return;
      }
      const video = videoRef.current;
      const position = video?.currentTime ?? 0;
      clearError();
      resumedRef.current = position > 0;
      pendingSeekRef.current = position > 0 ? position : null;
      setCurrentTime(position);
      if (hlsRef.current != null) {
        hlsRef.current.retry();
      } else {
        loadSource(src);
      }
    }

    function handleMediaSessionAction(details: MediaSessionActionDetails) {
      switch (details.action) {
        case "play":
          play();
          break;
        case "pause":
        case "stop":
          pause();
          break;
        case "seekbackward":
          seekBy(-(details.seekOffset ?? SEEK_STEP_SECONDS));
          break;
        case "seekforward":
          seekBy(details.seekOffset ?? SEEK_STEP_SECONDS);
          break;
        case "seekto":
          // A seek to 0 is valid: only a missing time is ignored.
          if (details.seekTime != null) {
            seekTo(details.seekTime);
          }
          break;
        case "previoustrack":
          playPreviousChapter();
          break;
        case "nexttrack":
          playNextChapter();
          break;
        default:
          break;
      }
    }

    useImperativeHandle(ref, () => {
      return {
        selectChapter: (chapter: ChapterWithPublicUrl) => {
          playChapter(chapter, { play: true });
        },
        retry,
        getError: () => playerErrorRef.current,
      };
    });

    function updatePlayerDetails() {
      const video = videoRef.current;
      if (video == null) {
        return;
      }
      setPlayState(video.paused ? PlayState.Paused : PlayState.Playing);
      setDuration(video.duration);
      setCurrentTime(video.currentTime);
      if (!video.ended) {
        saveLastPlayedTime(video.currentTime);
      }
      mediaSessionUpdateDurationAndPosition(
        video.duration,
        video.currentTime,
        video.playbackRate,
      );
      if (
        video.networkState === video.NETWORK_LOADING &&
        video.readyState <= video.HAVE_FUTURE_DATA
      ) {
        setIsLoading(true);
      } else {
        setIsLoading(false);
      }
      callbacksRef.current.updateCurrentTime?.(video.currentTime);
    }

    // Lock-screen handlers are registered once; they read refs, so they always
    // see the current chapters and callbacks.
    useEffect(() => {
      startMediaSessionCoordinator({
        title: title ?? "",
        album: title,
        artist: author,
        artwork: imageURL,
        action: handleMediaSessionAction,
      });

      return () => {
        stopMediaSessionCoordinator();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The book title, cover or author arrive after the details request.
    useEffect(() => {
      syncMediaSessionMetadata(currentChapterRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title, author, imageURL]);

    useEffect(() => {
      const video = videoRef.current;
      if (video == null) {
        return;
      }
      video.addEventListener("loadeddata", handleLoadedData);
      video.addEventListener("ended", handleEnded);
      video.addEventListener("error", handleMediaElementError);

      updatePlayerDetails();
      timerRef.current = setInterval(updatePlayerDetails, 500);

      return () => {
        video.removeEventListener("loadeddata", handleLoadedData);
        video.removeEventListener("ended", handleEnded);
        video.removeEventListener("error", handleMediaElementError);
        if (timerRef.current != null) {
          clearInterval(timerRef.current);
          timerRef.current = undefined;
        }
        setCurrentTime(undefined);
        video.pause();
        destroyHls();
        video.removeAttribute("src");
        video.load();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      if (setCurrentTimeHandler != null) {
        setCurrentTimeHandler(seekTo);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Compare by chapter ids and URLs: a new array with the same content must
    // not reload the stream or restart playback.
    const chaptersSignature = chapters
      .map((chapter) => `${chapter.id}|${chapter.publicUrl ?? ""}`)
      .join("\n");

    useEffect(() => {
      chaptersRef.current = chapters;
      const previousSignature = chaptersSignatureRef.current;
      if (previousSignature === chaptersSignature) {
        return;
      }
      chaptersSignatureRef.current = chaptersSignature;

      if (previousSignature == null) {
        loadChapters(chapters);
        return;
      }

      const current = currentChapterRef.current;
      if (current == null) {
        loadChapters(chapters);
        return;
      }
      const replacement = chapters.find(
        (chapter) => chapter.id === current.id,
      );
      if (replacement != null && replacement.publicUrl === current.publicUrl) {
        // Same stream, different array: keep playing.
        return;
      }
      if (replacement != null) {
        // A fresh signed URL for the chapter that is playing: keep the position
        // and whether it was playing.
        const video = videoRef.current;
        const position = video?.currentTime ?? 0;
        const wasPlaying = video != null && !video.paused;
        currentChapterRef.current = replacement;
        resumedRef.current = true;
        pendingSeekRef.current = position > 0 ? position : null;
        playWhenReadyRef.current = wasPlaying;
        loadSource(replacement.publicUrl);
        syncMediaSessionMetadata(replacement);
        callbacksRef.current.onChapterChange?.(replacement);
        setLastSelectedChapterID(replacement.id);
        return;
      }
      loadChapters(chapters);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chaptersSignature]);

    useEffect(() => {
      switch (playState) {
        case PlayState.Playing:
          mediaSessionPlay();
          break;
        case PlayState.Paused:
          mediaSessionPause();
          break;
      }
    }, [playState]);

    const calculateTime = (secs: number) => {
      const hours = Math.floor(secs / 3600);
      const minutes = Math.floor(secs / 60) % 60;
      const seconds = Math.floor(secs % 60);
      const returnedHours =
        hours > 0 ? (hours < 10 ? `0${hours}:` : `${hours}:`) : "";
      const returnedSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`;
      if (isNaN(seconds) || isNaN(minutes) || isNaN(hours)) {
        return "";
      }
      return `${returnedHours}${minutes}:${returnedSeconds}`;
    };

    const showRangeProgress = (rangeInput: HTMLInputElement) => {
      const barProgress =
        (parseFloat(rangeInput.value) / parseFloat(rangeInput.max)) * 100;
      audioPlayerContainerRef.current.style.setProperty(
        "--seek-before-width",
        barProgress + "%",
      );

      const selectedTime = (duration! * barProgress) / 100;
      seekTo(selectedTime);
    };

    return (
      <div
        id="audio-player-container"
        className="flex flex-col"
        style={styles}
        ref={audioPlayerContainerRef}
        data-player-error={playerError?.kind}
      >
        <video
          ref={videoRef}
          className="hidden"
          poster={imageURL}
          title={title}
        ></video>

        <input
          type="range"
          min="0"
          max={
            duration != null && Number.isFinite(duration)
              ? Math.floor(duration).toString()
              : "100"
          }
          value={currentTime ?? 0}
          onChange={(e) => showRangeProgress(e.target as HTMLInputElement)}
          className="w-full"
        />

        <section className="flex w-full items-center justify-between text-sm font-medium">
          <span id="current-time">{calculateTime(currentTime!)}</span>
          <span id="duration">{calculateTime(duration!)}</span>
        </section>
        <div className="mt-6 flex items-center justify-center gap-x-12">
          <Button
            variant="outline"
            onClick={() => seekBy(-SEEK_STEP_SECONDS)}
            aria-label={`Rewind ${SEEK_STEP_SECONDS} Seconds`}
          >
            -{SEEK_STEP_SECONDS}
          </Button>
          <Button
            variant="outline"
            onClick={togglePlayState}
            aria-label="Play Or Pause"
          >
            {playState === PlayState.Paused && <Play className="h-5 w-5" />}
            {playState === PlayState.Playing && <Pause className="h-5 w-5" />}
          </Button>
          <Button
            variant="outline"
            onClick={() => seekBy(SEEK_STEP_SECONDS)}
            aria-label={`Fast Forward ${SEEK_STEP_SECONDS} Seconds`}
          >
            +{SEEK_STEP_SECONDS}
          </Button>
        </div>
        {isLoading && (
          <div className="mt-2 flex w-full justify-center">
            <LoadingIndicator />
          </div>
        )}
      </div>
    );
  },
);

export default AudioPlayer;
