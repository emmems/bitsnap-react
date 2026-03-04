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
  mediaSessionPause,
  mediaSessionPlay,
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

export type AudioPlayerMethods = {
  selectChapter: (chapter: ChapterWithPublicUrl) => void;
};

type AudioPlayerProps = {
  chapters: ChapterWithPublicUrl[];
  styles: CSSProperties;
  updateCurrentTime?: (currentTime: number) => void;

  title?: string;
  imageURL?: string;

  setCurrentTimeHandler?: (seekTo: (second: number) => void) => void;
  uniqueProductID: string;

  onChapterChange?: (chapter: ChapterWithPublicUrl) => void;
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
      uniqueProductID,
      onChapterChange,
    },
    ref,
  ) => {
    enum PlayState {
      Playing,
      Paused,
    }

    const [playState, setPlayState] = useState<PlayState>(PlayState.Paused);

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

    useImperativeHandle(ref, () => {
      return {
        selectChapter: (chapter: ChapterWithPublicUrl) => {
          playChapter(chapter);
        },
      };
    });

    const [currentTime, setCurrentTime] = useState<number | undefined>(
      undefined,
    );
    const [duration, setDuration] = useState<number | undefined>(undefined);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | undefined>(undefined);
    const timerRef = useRef<number | undefined>(undefined);

    const audioPlayerContainerRef = useRef<HTMLDivElement>(null!);

    const currentChapterRef = useRef<ChapterWithPublicUrl | null>(null);

    const [playWhenReady, setPlayWhenReady] = useState(true);
    const [isStarted, setIsStarted] = useState(false);
    const [isLoading, setIsLoading] = useState(!isSafari());

    function saveLastPlayedTime(timeInSeconds: number) {
      if (timeInSeconds < 10) {
        return;
      }
      localStorage.setItem(
        `__player__${uniqueProductID}_${currentChapterRef.current?.id}`,
        `${timeInSeconds}`,
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

    function setupObservers() {
      if (videoRef.current == null) {
        return;
      }
      videoRef.current.onloadeddata = () => {
        if (videoRef.current == null) {
          return;
        }
        if (videoRef.current.readyState < 2) {
          setIsLoading(true);
        }
        if (videoRef.current.readyState >= 2) {
          setIsLoading(false);
        }

        if (!isStarted) {
          const lastPlayedTime = getLastPlayedTime();
          if (lastPlayedTime != undefined) {
            seekTo(lastPlayedTime);
          }
          setIsStarted(true);
        }
        if (playWhenReady) {
          setPlayWhenReady(false);
          try {
            play();
          } catch (e) {
            console.log("play error", e);
          }
        }
      };
      videoRef.current.onplay = () => {};

      videoRef.current.onseeked = () => {};
      videoRef.current.onseeking = () => {};

      videoRef.current.onpause = () => {};

      videoRef.current.onended = () => {
        playNextChapter();
      };

      startMediaSessionCoordinator({
        title: title ?? "",
        artwork: imageURL,
        action: (details) => {
          switch (details.action) {
            case "play":
              play();
              break;
            case "pause":
              pause();
              break;
            case "seekbackward":
              seekBy(-15);
              break;
            case "seekforward":
              seekBy(15);
              break;
            case "seekto":
              if (details.seekTime) {
                seekTo(details.seekTime);
              }
              break;
            case "stop":
              pause();
              break;
            default:
              break;
          }
        },
      });

      startTimer();
    }

    function playNextChapter() {
      if (chapters == null || chapters.length == 0) {
        return;
      }
      const currentChapterIndex = chapters.findIndex(
        (chapter) => chapter.id == currentChapterRef.current?.id,
      );
      if (currentChapterIndex == -1) {
        return;
      }
      deleteMemoryChapter(chapters[currentChapterIndex].id);
      const nextChapterIndex = currentChapterIndex + 1;
      if (nextChapterIndex >= chapters.length) {
        return;
      }
      playChapter(chapters[currentChapterIndex + 1]);
    }

    function startTimer() {
      updatePlayerDetails();
      if (timerRef.current != null) return;

      timerRef.current = setTimeout(() => {
        updatePlayerDetails();
        timerRef.current = undefined;
        startTimer();
      }, 500) as unknown as number;
    }

    function stopTimer() {
      if (timerRef.current == null) return;
      clearTimeout(timerRef.current as unknown as number);
    }

    function updatePlayerDetails() {
      if (videoRef.current == null) {
        return;
      }
      setPlayState(
        videoRef.current.paused ? PlayState.Paused : PlayState.Playing,
      );
      setDuration(videoRef.current.duration);
      setCurrentTime(videoRef.current.currentTime);
      saveLastPlayedTime(videoRef.current.currentTime);
      mediaSessionUpdateDurationAndPosition(
        videoRef.current.duration,
        videoRef.current.currentTime,
      );
      if (
        videoRef.current.networkState === videoRef.current.NETWORK_LOADING &&
        videoRef.current.readyState <= videoRef.current.HAVE_FUTURE_DATA
      ) {
        setIsLoading(true);
      } else {
        setIsLoading(false);
      }
      if (updateCurrentTime) {
        updateCurrentTime(videoRef.current.currentTime);
      }
    }

    function play() {
      videoRef.current?.play().then().catch();
      updatePlayerDetails();
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

    function seekBy(seconds: number) {
      if (videoRef.current == null) {
        return;
      }
      const newTime = videoRef.current.currentTime + seconds;
      if (newTime < 0) {
        videoRef.current.currentTime = 0;
        return;
      }
      if (newTime > videoRef.current.duration) {
        videoRef.current.currentTime = videoRef.current.duration;
        return;
      }
      videoRef.current.currentTime += seconds;
    }

    function seekTo(toSecond: number) {
      if (videoRef.current == null) {
        return;
      }
      setCurrentTime(toSecond);
      if (toSecond < 0) {
        videoRef.current.currentTime = 0;
        return;
      }
      if (toSecond > videoRef.current.duration) {
        videoRef.current.currentTime = videoRef.current.duration;
        return;
      }
      videoRef.current.currentTime = toSecond;
    }

    function destroyPlayer() {
      if (videoRef.current == null) {
        return;
      }
      videoRef.current.onplay = null;
      videoRef.current.onseeked = null;
      videoRef.current.onseeking = null;
      videoRef.current.onpause = null;
      videoRef.current.onended = null;
      videoRef.current.src = "";
      hlsRef.current?.destroy();
    }

    function loadChapters(chapters: ChapterWithPublicUrl[]) {
      if (chapters.length == 0) {
        return;
      }

      const chapterID = getLastSelectedChapterID();
      if (chapterID == null) {
        playChapter(chapters[0]);
        return;
      }

      const chapter = chapters.find((chapter) => chapter.id == chapterID);
      if (chapter == null) {
        playChapter(chapters[0]);
        return;
      }

      playChapter(chapter);
    }

    function playChapter(chapter: ChapterWithPublicUrl) {
      setIsStarted(false);
      setPlayWhenReady(true);
      currentChapterRef.current = chapter;
      playURL(chapter.publicUrl);
      onChapterChange?.(chapter);
      setLastSelectedChapterID(chapter.id);
    }

    function playURL(src: string) {
      if (videoRef.current == null) {
        return;
      }
      if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
        videoRef.current.src = src;
      } else if (Hls.isSupported()) {
        if (hlsRef.current == null) {
          hlsRef.current = new Hls();
          hlsRef.current?.attachMedia(videoRef.current);
        }
        hlsRef.current?.loadSource(src);
      }
    }

    useEffect(() => {
      if (videoRef.current == null) {
        return;
      }
      setupObservers();
      loadChapters(chapters);
    }, [videoRef.current]);

    useEffect(() => {
      loadChapters(chapters);
    }, [chapters]);

    useEffect(() => {
      if (setCurrentTimeHandler != null) {
        setCurrentTimeHandler(seekTo);
      }

      return () => {
        setCurrentTime(undefined);
        videoRef.current?.pause();
        destroyPlayer();
        stopMediaSessionCoordinator();
      };
    }, []);

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
          max={duration != undefined ? Math.floor(duration).toString() : 100}
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
            onClick={() => seekBy(-10)}
            aria-label="Rewind 10 Seconds"
          >
            -10
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
            onClick={() => seekBy(10)}
            aria-label="Fast Forward 10 Seconds"
          >
            +10
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

function isSafari() {
  return navigator.userAgent.toLowerCase().indexOf("safari/") > -1;
}

export default AudioPlayer;
