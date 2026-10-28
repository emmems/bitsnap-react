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
});
