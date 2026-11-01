import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import type { AudioPlayerError, AudioPlayerMethods } from "./AudioPlayer.tsx";
import type { HlsConstructor, HlsErrorData } from "./hls-engine.ts";

const dom = new JSDOM("<!doctype html><div id=root></div>", {
  url: "https://shop.example.test/app",
});

// `hls.js` reads `window` while it loads, so the globals come first.
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLVideoElement: dom.window.HTMLVideoElement,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
Object.defineProperty(globalThis, "localStorage", {
  value: dom.window.localStorage,
  configurable: true,
});

type FakeHandler = (details: Record<string, unknown>) => void;

class FakeMediaMetadata {
  title = "";
  album: string | undefined;
  artist: string | undefined;
  artwork: Array<{ src: string; sizes?: string; type?: string }> | undefined;

  constructor(init: {
    title?: string;
    album?: string;
    artist?: string;
    artwork?: Array<{ src: string; sizes?: string; type?: string }>;
  }) {
    this.title = init.title ?? "";
    this.album = init.album;
    this.artist = init.artist;
    this.artwork = init.artwork;
  }
}
Object.assign(globalThis, { MediaMetadata: FakeMediaMetadata });

const handlers = new Map<string, FakeHandler>();
const positionStates: Array<{
  playbackRate?: number;
  duration?: number;
  position?: number;
}> = [];
const mediaSession = {
  metadata: null as unknown,
  playbackState: "none" as MediaSessionPlaybackState,
  setActionHandler(action: string, handler: FakeHandler | null) {
    if (handler == null) {
      handlers.delete(action);
      return;
    }
    handlers.set(action, handler);
  },
  setPositionState(state?: {
    playbackRate?: number;
    duration?: number;
    position?: number;
  }) {
    if (state != null) {
      positionStates.push(state);
    }
  },
};
Object.defineProperty(dom.window.navigator, "mediaSession", {
  value: mediaSession,
  configurable: true,
});

const playCalls: HTMLMediaElement[] = [];
const pauseCalls: HTMLMediaElement[] = [];
const loadCalls: HTMLMediaElement[] = [];
dom.window.HTMLMediaElement.prototype.play = function play(
  this: HTMLMediaElement,
) {
  playCalls.push(this);
  return Promise.resolve();
};
dom.window.HTMLMediaElement.prototype.pause = function pause(
  this: HTMLMediaElement,
) {
  pauseCalls.push(this);
};
dom.window.HTMLMediaElement.prototype.load = function load(
  this: HTMLMediaElement,
) {
  loadCalls.push(this);
};

let React: typeof import("react");
let act: typeof import("react").act;
let createRoot: typeof import("react-dom/client").createRoot;
let AudioPlayer: typeof import("./AudioPlayer.tsx").default;
let createHlsSource: typeof import("./hls-engine.ts").createHlsSource;
let prefersNativeHls: typeof import("./hls-engine.ts").prefersNativeHls;
let decideHlsError: typeof import("./hls-engine.ts").decideHlsError;
let mediaSessionCoordinator: typeof import("./media.session.coordinator.ts");

before(async () => {
  React = await import("react");
  act = React.act;
  createRoot = (await import("react-dom/client")).createRoot;
  AudioPlayer = (await import("./AudioPlayer.tsx")).default;
  const engine = await import("./hls-engine.ts");
  createHlsSource = engine.createHlsSource;
  prefersNativeHls = engine.prefersNativeHls;
  decideHlsError = engine.decideHlsError;
  mediaSessionCoordinator = await import("./media.session.coordinator.ts");
});

const chapter = (id: string, name = `Chapter ${id}`) => ({
  id,
  name,
  publicUrl: `https://stream.test/${id}.m3u8`,
});

const chapters = [chapter("one"), chapter("two")];

const originalError = console.error;
const originalWarn = console.warn;
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  localStorage.clear();
  handlers.clear();
  positionStates.length = 0;
  playCalls.length = 0;
  pauseCalls.length = 0;
  loadCalls.length = 0;
  mediaSession.metadata = null;
  mediaSession.playbackState = "none";
  console.error = () => {};
  console.warn = () => {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root != null) {
    await act(async () => {
      root?.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
  console.error = originalError;
  console.warn = originalWarn;
});

async function renderPlayer(props: {
  chapters?: ReturnType<typeof chapter>[];
  onChapterChange?: (chapter: {
    id: string;
    name: string;
    publicUrl: string;
  }) => void;
  onError?: (error: AudioPlayerError) => void;
  onExpiredUrl?: () => void;
  onFinished?: () => void;
  ref?: { current: AudioPlayerMethods | null };
  title?: string;
  author?: string;
  imageURL?: string;
}) {
  const {
    chapters: list = chapters,
    onChapterChange,
    onError,
    onExpiredUrl,
    onFinished,
    ref,
    title,
    author,
    imageURL,
  } = props;
  const render = (nextChapters: ReturnType<typeof chapter>[]) =>
    React.createElement(AudioPlayer, {
      chapters: nextChapters,
      styles: {},
      uniqueProductID: "product-1",
      onChapterChange,
      onError,
      onExpiredUrl,
      onFinished,
      title,
      author,
      imageURL,
      ref,
    });
  await act(async () => {
    root!.render(render(list));
  });
  return {
    video: container!.querySelector("video")!,
    container: container!.querySelector("#audio-player-container")!,
    rerender: async (nextChapters: ReturnType<typeof chapter>[]) => {
      await act(async () => {
        root!.render(render(nextChapters));
      });
    },
  };
}

/** jsdom has no media pipeline: give the element a duration and a position. */
function giveMediaProperties(video: HTMLVideoElement, duration = 120) {
  Object.defineProperty(video, "duration", {
    value: duration,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(video, "currentTime", {
    value: 0,
    writable: true,
    configurable: true,
  });
}

async function dispatch(video: HTMLVideoElement, type: string) {
  await act(async () => {
    video.dispatchEvent(new dom.window.Event(type));
  });
}

describe("hls error handling", () => {
  class FakeHls {
    static isSupported() {
      return true;
    }
    static Events = { ERROR: "hlsError" };
    static ErrorTypes = {
      NETWORK_ERROR: "networkError",
      MEDIA_ERROR: "mediaError",
    };

    media: HTMLMediaElement | undefined;
    loaded: string[] = [];
    startLoadCalls = 0;
    recoverCalls = 0;
    destroyed = false;
    listener: ((event: string, data: HlsErrorData) => void) | undefined;

    attachMedia(media: HTMLMediaElement) {
      this.media = media;
    }
    loadSource(src: string) {
      this.loaded.push(src);
    }
    startLoad() {
      this.startLoadCalls += 1;
    }
    recoverMediaError() {
      this.recoverCalls += 1;
    }
    destroy() {
      this.destroyed = true;
    }
    on(_event: string, listener: (event: string, data: HlsErrorData) => void) {
      this.listener = listener;
    }
  }

  function source() {
    const errors: AudioPlayerError[] = [];
    const expired: number[] = [];
    let instance: FakeHls | undefined;
    const hlsSource = createHlsSource({
      media: {} as HTMLMediaElement,
      HlsCtor: class extends FakeHls {
        constructor() {
          super();
          instance = this;
        }
      } as unknown as HlsConstructor,
      handlers: {
        onError: (error) => errors.push(error),
        onExpiredUrl: () => expired.push(1),
      },
    });
    return {
      source: hlsSource,
      instance: () => instance!,
      errors,
      expired,
      emit: (data: HlsErrorData) =>
        instance!.listener!(FakeHls.Events.ERROR, data),
    };
  }

  it("hands an expired signed URL to the owner and reports it", () => {
    const { source: hlsSource, errors, expired, emit } = source();
    hlsSource.load("https://stream.test/one.m3u8");
    emit({
      fatal: true,
      type: "networkError",
      response: { code: 403 },
    });

    assert.deepEqual(expired, [1]);
    assert.deepEqual(errors, [{ kind: "network", status: 403 }]);
  });

  it("retries a fatal network error once, then reports it", () => {
    const { source: hlsSource, instance, errors, emit } = source();
    hlsSource.load("https://stream.test/one.m3u8");
    emit({ fatal: true, type: "networkError", response: { code: 500 } });
    assert.equal(instance().startLoadCalls, 1);
    assert.deepEqual(errors, []);

    emit({ fatal: true, type: "networkError", response: { code: 500 } });
    assert.equal(instance().startLoadCalls, 1);
    assert.deepEqual(errors, [{ kind: "network", status: 500 }]);
  });

  it("recovers a fatal media error once, then reports it", () => {
    const { source: hlsSource, instance, errors, emit } = source();
    hlsSource.load("https://stream.test/one.m3u8");
    emit({ fatal: true, type: "mediaError" });
    assert.equal(instance().recoverCalls, 1);
    assert.deepEqual(errors, []);

    emit({ fatal: true, type: "mediaError" });
    assert.equal(instance().recoverCalls, 1);
    assert.deepEqual(errors, [{ kind: "media" }]);
  });

  it("ignores non-fatal errors and reports unknown fatal ones", () => {
    assert.deepEqual(
      decideHlsError({ fatal: false }, { network: false, media: false }),
      {
        action: "ignore",
      },
    );
    const { source: hlsSource, errors, emit } = source();
    hlsSource.load("https://stream.test/one.m3u8");
    emit({ fatal: true, type: "otherError" });
    assert.deepEqual(errors, [{ kind: "unknown" }]);
  });

  it("retry loads the current source again and resets the retries", () => {
    const { source: hlsSource, instance, errors, emit } = source();
    hlsSource.load("https://stream.test/one.m3u8");
    emit({ fatal: true, type: "networkError" });
    emit({ fatal: true, type: "networkError" });
    assert.equal(errors.length, 1);

    hlsSource.retry();
    assert.equal(instance().loaded.length, 2);
    emit({ fatal: true, type: "networkError" });
    assert.equal(errors.length, 1);
    assert.equal(instance().startLoadCalls, 2);
  });
});

describe("native HLS decision", () => {
  it("uses canPlayType, not the user agent", () => {
    // Chrome and Edge user agents contain "Safari/" and must not matter here.
    assert.equal(
      prefersNativeHls({ canPlayType: () => "maybe" } as never),
      true,
    );
    assert.equal(prefersNativeHls({ canPlayType: () => "" } as never), false);
    assert.equal(
      prefersNativeHls({
        canPlayType: () => {
          throw new Error("no media element");
        },
      } as never),
      false,
    );
  });
});

describe("audio player", () => {
  it("does not autoplay when it is mounted", async () => {
    const player = await renderPlayer({});
    const video = player.video;
    giveMediaProperties(video);

    await dispatch(video, "loadeddata");

    assert.equal(playCalls.length, 0);
    assert.equal(video.src, "https://stream.test/one.m3u8");
    // Mount leaves the session paused; nothing started it.
    assert.notEqual(mediaSession.playbackState, "playing");
  });

  it("plays after the play button", async () => {
    const player = await renderPlayer({});
    giveMediaProperties(player.video);
    await dispatch(player.video, "loadeddata");

    const playButton = [...player.container.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-label") === "Odtwórz",
    )!;
    await act(async () => {
      playButton.dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      );
    });

    assert.equal(playCalls.length, 1);
  });

  it("does not reload when the same chapters arrive in a new array", async () => {
    const changes: string[] = [];
    const player = await renderPlayer({
      onChapterChange: (next) => changes.push(next.id),
    });
    giveMediaProperties(player.video);
    const loadsAfterMount = loadCalls.length;

    await player.rerender([chapter("one"), chapter("two")]);
    await player.rerender([chapter("one"), chapter("two")]);

    assert.equal(loadCalls.length, loadsAfterMount);
    assert.deepEqual(changes, ["one"]);
  });

  it("reloads a chapter whose signed URL changed without losing the position", async () => {
    const player = await renderPlayer({});
    giveMediaProperties(player.video);
    await dispatch(player.video, "loadeddata");
    player.video.currentTime = 42;

    await player.rerender([
      { ...chapter("one"), publicUrl: "https://stream.test/one.m3u8?sig=new" },
      chapter("two"),
    ]);

    assert.equal(player.video.src, "https://stream.test/one.m3u8?sig=new");
    assert.equal(loadCalls.length, 2);
    assert.equal(playCalls.length, 0);
    player.video.currentTime = 0; // The media element resets its position while loading.
    await dispatch(player.video, "loadeddata");
    assert.equal(player.video.currentTime, 42);
  });

  it("handles a seekto of 0", async () => {
    const player = await renderPlayer({});
    giveMediaProperties(player.video);
    await dispatch(player.video, "loadeddata");
    player.video.currentTime = 42;

    await act(async () => {
      handlers.get("seekto")!({ action: "seekto", seekTime: 0 });
    });

    assert.equal(player.video.currentTime, 0);
  });

  it("moves chapters with previoustrack and nexttrack", async () => {
    const changes: string[] = [];
    const player = await renderPlayer({
      onChapterChange: (next) => changes.push(next.id),
    });
    giveMediaProperties(player.video);
    await dispatch(player.video, "loadeddata");

    await act(async () => {
      handlers.get("nexttrack")!({ action: "nexttrack" });
    });
    assert.equal(changes.at(-1), "two");
    assert.equal(player.video.src, "https://stream.test/two.m3u8");

    // Past 3 s, previous restarts the chapter.
    player.video.currentTime = 12;
    await act(async () => {
      handlers.get("previoustrack")!({ action: "previoustrack" });
    });
    assert.equal(changes.at(-1), "two");
    assert.equal(player.video.currentTime, 0);

    // Within 3 s, previous goes to the previous chapter.
    player.video.currentTime = 1;
    await act(async () => {
      handlers.get("previoustrack")!({ action: "previoustrack" });
    });
    assert.equal(changes.at(-1), "one");
    assert.equal(player.video.src, "https://stream.test/one.m3u8");
  });

  it("uses skip steps the buttons and the lock screen share", () => {
    assert.equal(mediaSessionCoordinator.SEEK_STEP_SECONDS, 10);
    assert.equal(mediaSessionCoordinator.PREVIOUS_TRACK_RESTART_SECONDS, 3);
  });

  it("reports a media element error and can retry", async () => {
    const errors: AudioPlayerError[] = [];
    const playerRef = React.createRef<AudioPlayerMethods>();
    const player = await renderPlayer({
      onError: (error) => errors.push(error),
      ref: playerRef,
    });
    giveMediaProperties(player.video);
    await dispatch(player.video, "loadeddata");

    Object.defineProperty(player.video, "error", {
      value: { code: 2 },
      configurable: true,
    });
    await dispatch(player.video, "error");

    assert.deepEqual(errors, [{ kind: "network" }]);
    assert.equal(player.container.dataset.playerError, "network");
    assert.deepEqual(playerRef.current!.getError(), { kind: "network" });

    const loadsBeforeRetry = loadCalls.length;
    await act(async () => {
      playerRef.current!.retry();
    });
    assert.equal(loadCalls.length, loadsBeforeRetry + 1);
    assert.equal(playerRef.current!.getError(), null);
  });

  it("marks playback finished when the last chapter ends", async () => {
    let finished = 0;
    const player = await renderPlayer({ onFinished: () => (finished += 1) });
    giveMediaProperties(player.video);
    await dispatch(player.video, "loadeddata");

    await act(async () => {
      handlers.get("nexttrack")!({ action: "nexttrack" });
    });
    await dispatch(player.video, "loadeddata");
    await dispatch(player.video, "ended");

    assert.equal(finished, 1);
    assert.ok(pauseCalls.length > 0);
  });

  it("publishes chapter metadata to the lock screen", async () => {
    await renderPlayer({
      title: "The Book",
      author: "Jane Doe",
      imageURL: "https://cdn.test/cover.JPG?width=512",
    });

    const metadata = mediaSession.metadata as FakeMediaMetadata;
    assert.equal(metadata.title, "Chapter one");
    assert.equal(metadata.album, "The Book");
    assert.equal(metadata.artist, "Jane Doe");
    assert.deepEqual(metadata.artwork, [
      {
        src: "https://cdn.test/cover.JPG?width=512",
        sizes: "512x512",
        type: "image/jpeg",
      },
    ]);
  });
});

describe("media session position", () => {
  it("reports the real playback rate and clamps the position", () => {
    mediaSessionCoordinator.mediaSessionUpdateDurationAndPosition(120, 30, 1.5);
    assert.deepEqual(positionStates.at(-1), {
      playbackRate: 1.5,
      duration: 120,
      position: 30,
    });

    mediaSessionCoordinator.mediaSessionUpdateDurationAndPosition(10, 30, 2);
    assert.deepEqual(positionStates.at(-1), {
      playbackRate: 2,
      duration: 10,
      position: 10,
    });

    const callsBefore = positionStates.length;
    mediaSessionCoordinator.mediaSessionUpdateDurationAndPosition(NaN, 3);
    mediaSessionCoordinator.mediaSessionUpdateDurationAndPosition(undefined, 3);
    assert.equal(positionStates.length, callsBefore);
  });

  it("omits the artwork type when the extension is unknown", () => {
    assert.deepEqual(
      mediaSessionCoordinator.mediaSessionArtworkFromUrl(
        "https://cdn.test/cover",
      ),
      { src: "https://cdn.test/cover", sizes: "512x512" },
    );
    assert.deepEqual(
      mediaSessionCoordinator.mediaSessionArtworkFromUrl(
        "https://cdn.test/cover.webp",
      ),
      {
        src: "https://cdn.test/cover.webp",
        sizes: "512x512",
        type: "image/webp",
      },
    );
  });
});

async function clickLabel(label: string) {
  const button = [...container!.querySelectorAll("button")].find(
    (item) =>
      item.getAttribute("aria-label") === label || item.textContent === label,
  );
  assert.ok(button, `Missing button: ${label}`);
  await act(async () =>
    button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })),
  );
}
async function choose(label: string, value: string) {
  const select = container!.querySelector(
    `select[aria-label="${label}"]`,
  ) as HTMLSelectElement;
  assert.ok(select);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

describe("audiobook controls", () => {
  it("renders player and chapters safely on the server", async () => {
    const { renderToString } = await import("react-dom/server");
    const ChapterList = (await import("./ChapterList")).default;
    const html = renderToString(
      React.createElement(AudioPlayer, {
        chapters,
        styles: {},
        uniqueProductID: "ssr",
        locale: "en",
      }),
    );
    assert.ok(html.includes("Playback progress"));
    assert.ok(html.includes("Previous chapter"));
    assert.ok(
      renderToString(
        React.createElement(ChapterList, {
          chapters,
          productID: "ssr",
          onSelect: () => {},
          locale: "en",
        }),
      ).includes("Chapters"),
    );
  });

  it("shows a localized error and retries from the inline button", async () => {
    const ref = React.createRef<AudioPlayerMethods>();
    let reported: AudioPlayerError | undefined;
    const player = await renderPlayer({
      ref,
      onError: (error) => {
        reported = error;
      },
    });
    await dispatch(player.video, "error");
    assert.ok(
      player.container
        .querySelector('[role="alert"]')
        ?.textContent?.includes("Nie udało"),
    );
    assert.deepEqual(ref.current?.getError(), reported);
    const before = loadCalls.length;
    await clickLabel("Spróbuj ponownie");
    assert.equal(ref.current?.getError(), null);
    assert.equal(player.container.querySelector('[role="alert"]'), null);
    assert.ok(loadCalls.length > before);
  });

  it("applies speed, updates MediaSession and restores the device preference", async () => {
    const player = await renderPlayer({});
    giveMediaProperties(player.video);
    await choose("Prędkość", "1.5");
    assert.equal(player.video.playbackRate, 1.5);
    assert.equal(localStorage.getItem("__player__speed"), "1.5");
    assert.equal(positionStates.at(-1)?.playbackRate, 1.5);
    await act(async () => root!.unmount());
    root = createRoot(container!);
    const restored = await renderPlayer({});
    assert.equal(restored.video.playbackRate, 1.5);
    assert.equal(
      (
        container!.querySelector(
          'select[aria-label="Prędkość"]',
        ) as HTMLSelectElement
      ).value,
      "1.5",
    );
    await dispatch(restored.video, "loadeddata");
    assert.equal(restored.video.playbackRate, 1.5);
  });

  it("pauses when the sleep deadline expires and supports cancel", async (context) => {
    context.mock.timers.enable({ apis: ["setInterval", "Date"] });
    await renderPlayer({});
    await choose("Wyłącznik czasowy", "15");
    assert.equal(
      container!.querySelector('[role="timer"]')?.textContent,
      "15:00",
    );
    const before = pauseCalls.length;
    await act(async () => context.mock.timers.tick(15 * 60 * 1000));
    assert.ok(pauseCalls.length > before);
    assert.equal(container!.querySelector('[role="timer"]'), null);
    await choose("Wyłącznik czasowy", "30");
    await clickLabel("Anuluj wyłącznik");
    assert.equal(container!.querySelector('[role="timer"]'), null);
    context.mock.timers.reset();
  });

  it("pauses at the chapter end without advancing", async () => {
    const changed: string[] = [];
    const player = await renderPlayer({
      onChapterChange: (chapter) => changed.push(chapter.id),
    });
    await choose("Wyłącznik czasowy", "chapter");
    const before = pauseCalls.length;
    await dispatch(player.video, "ended");
    assert.ok(pauseCalls.length > before);
    assert.deepEqual(changed, ["one"]);
    assert.equal(container!.querySelector('[role="timer"]'), null);
  });

  it("navigates chapters with previous and next buttons", async () => {
    const changed: string[] = [];
    const player = await renderPlayer({
      onChapterChange: (chapter) => changed.push(chapter.id),
    });
    await clickLabel("Następny rozdział");
    await dispatch(player.video, "loadeddata");
    await clickLabel("Poprzedni rozdział");
    assert.deepEqual(changed, ["one", "two", "one"]);
  });

  it("updates scrubber fill and its spoken position during playback", async () => {
    const player = await renderPlayer({});
    giveMediaProperties(player.video, 2710);
    player.video.currentTime = 724;
    await dispatch(player.video, "timeupdate");
    const range = player.container.querySelector('input[type="range"]')!;
    assert.equal(range.getAttribute("aria-label"), "Postęp odtwarzania");
    assert.equal(range.getAttribute("aria-valuetext"), "12:04 z 45:10");
    assert.ok(player.container.getAttribute("style")?.includes("26.715"));
  });

  it("scopes every range selector to the player", () => {
    const css = readFileSync("src/panel/audio-player/audio-player.css", "utf8");
    const selectors = css.match(/[^{}]+(?=\{)/g) ?? [];
    for (const group of selectors)
      for (const selector of group.split(",")) {
        if (selector.includes('input[type="range"]'))
          assert.ok(
            selector.trim().startsWith(".bitsnap-audio-player "),
            selector,
          );
      }
  });

  it("marks the current chapter, played rows and offers the saved position", async () => {
    const ChapterList = (await import("./ChapterList")).default;
    localStorage.setItem("__player__book_last_chapter", "two");
    localStorage.setItem("__player__book_two", "724");
    let selected = "";
    await act(async () =>
      root!.render(
        React.createElement(ChapterList, {
          chapters: chapters.map((chapter) => ({
            ...chapter,
            downloadableUrl: chapter.publicUrl,
          })),
          productID: "book",
          currentID: "two",
          downloadable: true,
          onSelect: (chapter) => {
            selected = chapter.id;
          },
        }),
      ),
    );
    assert.ok(
      container!
        .querySelector('[aria-current="true"]')
        ?.textContent?.includes("Chapter two"),
    );
    assert.ok(container!.querySelector('[aria-label="Odsłuchane"]'));
    assert.ok(container!.querySelector('a[aria-label="Pobierz rozdział 2"]'));
    await clickLabel("Kontynuuj: Rozdział 2, 12:04");
    assert.equal(selected, "two");
  });
});
