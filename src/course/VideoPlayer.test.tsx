import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import type { PlaybackReport } from "./VideoPlayer.tsx";

const dom = new JSDOM("<!doctype html><div id=root></div>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLVideoElement: dom.window.HTMLVideoElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// jsdom does not implement media loading.
dom.window.HTMLMediaElement.prototype.load = () => {};

let React: typeof import("react");
let act: typeof import("react").act;
let createRoot: typeof import("react-dom/client").createRoot;
let VideoPlayer: typeof import("./VideoPlayer.tsx").VideoPlayer;
let CourseViewProvider: typeof import("./context.tsx").CourseViewProvider;
let getCourseTexts: typeof import("./texts.ts").getCourseTexts;

before(async () => {
  React = await import("react");
  act = React.act;
  createRoot = (await import("react-dom/client")).createRoot;
  VideoPlayer = (await import("./VideoPlayer.tsx")).VideoPlayer;
  CourseViewProvider = (await import("./context.tsx")).CourseViewProvider;
  getCourseTexts = (await import("./texts.ts")).getCourseTexts;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

async function renderWithMediaSource(url: string, unmountAtOnce: boolean) {
  const w = dom.window as unknown as Record<string, unknown>;
  w.MediaSource = function MediaSource() {};
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <CourseViewProvider
          value={{
            dataSource: {} as never,
            texts: getCourseTexts(undefined, "en"),
            preview: false,
          }}
        >
          <VideoPlayer src={url} />
        </CourseViewProvider>,
      );
    });
    const video = container.querySelector("video")!;
    if (unmountAtOnce) {
      await act(async () => {
        root.unmount();
      });
    }
    await act(async () => {
      await settle();
    });
    return video.getAttribute("src");
  } finally {
    delete w.MediaSource;
    if (!unmountAtOnce) {
      await act(async () => {
        root.unmount();
      });
    }
  }
}

describe("lazy hls.js", () => {
  it("loads the library on first use and falls back when the browser cannot use it", async () => {
    // jsdom has Media Source stubbed but no codecs: `Hls.isSupported()` is false.
    const src = await renderWithMediaSource("https://stream.test/lazy.m3u8", false);
    assert.equal(src, "https://stream.test/lazy.m3u8");
  });

  it("does not attach when the lesson is left before the library arrived", async () => {
    const src = await renderWithMediaSource("https://stream.test/gone.m3u8", true);
    assert.equal(src, null);
  });
});

describe("video player", () => {
  it("saves the position when the lesson is left mid-video", async () => {
    const reports: PlaybackReport[] = [];
    const container = dom.window.document.getElementById("root")!;
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CourseViewProvider
          value={{
            dataSource: {} as never,
            texts: getCourseTexts(undefined, "en"),
            preview: false,
          }}
        >
          <VideoPlayer
            src="https://stream.test/lesson.m3u8"
            onReport={(report) => reports.push(report)}
          />
        </CourseViewProvider>,
      );
    });

    const video = container.querySelector("video")!;
    Object.defineProperty(video, "currentTime", { value: 42.4, configurable: true });
    Object.defineProperty(video, "duration", { value: 120, configurable: true });

    await act(async () => {
      root.unmount();
    });

    assert.deepEqual(reports, [
      { positionSeconds: 42, durationSeconds: 120, reason: "leave" },
    ]);
  });

  it("plays on a dark 16:9 stage without a card shadow", async () => {
    const container = dom.window.document.getElementById("root")!;
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CourseViewProvider
          value={{
            dataSource: {} as never,
            texts: getCourseTexts(undefined, "en"),
            preview: false,
          }}
        >
          <VideoPlayer src="https://stream.test/lesson.m3u8" />
        </CourseViewProvider>,
      );
    });
    const stage = container.querySelector("[data-course-stage]")!;
    assert.ok(stage.classList.contains("bg-neutral-950"));
    assert.ok(stage.classList.contains("aspect-video"));
    assert.doesNotMatch(stage.className, /shadow/);
    assert.ok(stage.querySelector("video"));
    await act(async () => {
      root.unmount();
    });
  });
});
