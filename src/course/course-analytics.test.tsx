import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { getTracker, resetTracker } from "@/src/analytics/core";
import { collector, findPII, setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import { setPanelConfig } from "../panel/config.ts";
import { sampleCourse } from "./fixtures.ts";
import type { CourseDataSource, Lesson, Test } from "./types.ts";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let PanelCourse: typeof import("./PanelCourse.tsx").PanelCourse;
let PanelProvider: typeof import("../panel/PanelProvider.tsx").PanelProvider;
let VideoPlayer: typeof import("./VideoPlayer.tsx").VideoPlayer;
let CourseViewProvider: typeof import("./context.tsx").CourseViewProvider;
let getCourseTexts: typeof import("./texts.ts").getCourseTexts;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ PanelCourse } = await import("./PanelCourse.tsx"));
  ({ PanelProvider } = await import("../panel/PanelProvider.tsx"));
  ({ VideoPlayer } = await import("./VideoPlayer.tsx"));
  ({ CourseViewProvider } = await import("./context.tsx"));
  ({ getCourseTexts } = await import("./texts.ts"));
});

const texts = () => getCourseTexts(undefined, "en");
const roots: Array<{ unmount: () => void }> = [];

beforeEach(() => {
  resetTracker();
  setPanelConfig({ projectID: TEST_KEY });
  page.win.localStorage.clear();
});
afterEach(async () => {
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  resetTracker();
});

const lesson = (id: string): Lesson => ({
  id,
  sectionId: "m1",
  title: `Lesson ${id}`,
  description: "A lesson",
  contentHtml: "",
  attachments: [],
  completed: false,
  positionSeconds: 0,
  myRating: 0,
  averageRating: 0,
  ratingCount: 0,
});

const test: Test = {
  id: "t1",
  title: "Test t1",
  description: "",
  gating: true,
  passThresholdPercent: 50,
  attemptsAllowed: 0,
  attemptCount: 0,
  bestScorePercent: 0,
  passed: false,
  questions: [
    {
      id: "q1",
      prompt: "Pick one",
      points: 1,
      config: { type: "mcq", multiple: false, choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
    },
  ],
};

function dataSource(overrides: Partial<CourseDataSource> = {}): CourseDataSource {
  return {
    getCourse: async () => sampleCourse(),
    getLesson: async (id: string) => lesson(id),
    saveProgress: async () => ({ completed: true, completedLessons: 2, progressPercent: 50 }),
    getTest: async () => test,
    submitTest: async () => ({
      submission: { id: "s1", scorePercent: 80, passed: true, durationMs: 1000 },
      results: [],
    }),
    listSubmissions: async () => ({ submissions: [], bestScorePercent: 0, attemptCount: 0 }),
    listQuestions: async () => [],
    askQuestion: async () => {
      throw new Error("not used");
    },
    rate: async (_id: string, score: number) => ({ myRating: score, averageRating: score, ratingCount: 1 }),
    ...overrides,
  } as CourseDataSource;
}

const settle = () => React.act(async () => void (await new Promise((r) => setTimeout(r, 30))));

async function open(props: Partial<React.ComponentProps<typeof PanelCourse>> = {}) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(
      <PanelProvider>
        <PanelCourse dataSource={dataSource()} initialCourse={sampleCourse()} locale="en" {...props} />
      </PanelProvider>,
    );
  });
  await settle();
  return container;
}

const press = (el: Element | null | undefined) => React.act(async () => (el as HTMLElement).click());
const buttonWithText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);

describe("course analytics", () => {
  it("reports opening the course and starting the resume lesson, with the course id", async () => {
    const seen = collector();
    await open({ analytics: { onEvent: seen.onEvent } });
    assert.deepEqual(seen.named("course_opened").map((e) => e.props), [{ course_id: "course-1" }]);
    assert.deepEqual(seen.named("lesson_started").map((e) => e.props), [
      { course_id: "course-1", lesson_id: "l2", position: 2 },
    ]);
    assert.equal(seen.named("lesson_started")[0].page_type, "course");
  });

  it("reports completing, rating and a test submission", async () => {
    const seen = collector();
    const container = await open({ analytics: { onEvent: seen.onEvent } });

    await press(buttonWithText(container, texts().markComplete));
    await settle();
    assert.deepEqual(seen.named("lesson_completed").map((e) => e.props), [
      { course_id: "course-1", lesson_id: "l2", position: 2 },
    ]);

    await press(container.querySelectorAll('[role="radio"]')[3]);
    await press(buttonWithText(container, texts().rateSubmit));
    await settle();
    assert.deepEqual(seen.named("lesson_rated").map((e) => e.props), [
      { course_id: "course-1", lesson_id: "l2", rating: 4 },
    ]);

    await press(container.querySelector('[data-item-id="t1"]'));
    await settle();
    assert.deepEqual(seen.named("lesson_started").map((e) => (e.props as { lesson_id: string }).lesson_id), ["l2"]);
    await press(container.querySelector('input[type="radio"], input[type="checkbox"]'));
    await press(buttonWithText(container, texts().testSubmit));
    await settle();
    assert.deepEqual(seen.named("test_submitted").map((e) => e.props), [
      { course_id: "course-1", lesson_id: "t1", score_bucket: "75-99" },
    ]);
    assert.deepEqual(findPII(seen.events), []);
  });

  it("does not repeat the completion when it was already saved", async () => {
    const seen = collector();
    const container = await open({ analytics: { onEvent: seen.onEvent } });
    await press(buttonWithText(container, texts().markComplete));
    await settle();
    await press(buttonWithText(container, texts().markedComplete));
    await settle();
    assert.equal(seen.named("lesson_completed").length, 1);
  });

  it("reports nothing in the creator preview", async () => {
    const seen = collector();
    await open({ preview: true, analytics: { onEvent: seen.onEvent } });
    assert.equal(seen.events.length, 0);
  });

  it("reports nothing with analytics={false}, and writes no cookie", async () => {
    const seen = collector();
    await open({ analytics: false });
    getTracker()?.flush();
    assert.equal(seen.events.length, 0);
    // The surrounding <PanelProvider> still reports the page itself, but nothing of the course.
    assert.deepEqual((await page.events()).filter((e) => e.event !== "page_view"), []);
    assert.equal(page.win.document.cookie, "");
  });
});

describe("video progress", () => {
  async function player(lessonId: string | undefined, seen: ReturnType<typeof collector>) {
    const container = page.win.document.createElement("div");
    page.win.document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    const { useInstrument } = await import("@/src/analytics/instrument");
    function Harness() {
      const real = useInstrument(TEST_KEY, { onEvent: seen.onEvent }, "course");
      return (
        <CourseViewProvider
          value={{
            dataSource: {} as CourseDataSource,
            texts: texts(),
            preview: false,
            analytics: { courseId: "course-1", instrument: real },
          }}
        >
          <VideoPlayer src="https://stream.test/lesson.m3u8" lessonId={lessonId} />
        </CourseViewProvider>
      );
    }
    await React.act(async () => root.render(<Harness />));
    const video = container.querySelector("video")!;
    let now = 0;
    Object.defineProperty(video, "currentTime", { get: () => now, set: (v) => void (now = v), configurable: true });
    Object.defineProperty(video, "duration", { value: 100, configurable: true });
    Object.defineProperty(video, "seeking", { value: false, configurable: true });
    const play = async (to: number, step = 1) => {
      while (now < to) {
        now = Math.min(to, now + step);
        await React.act(async () => void video.dispatchEvent(new page.win.Event("timeupdate")));
      }
    };
    const jump = async (to: number) => {
      now = to;
      await React.act(async () => void video.dispatchEvent(new page.win.Event("timeupdate")));
    };
    const end = () => React.act(async () => void video.dispatchEvent(new page.win.Event("ended")));
    return { play, jump, end };
  }

  const milestones = (seen: ReturnType<typeof collector>) =>
    seen.named("video_progress").map((e) => (e.props as { milestone: number }).milestone);

  it("reports each milestone once while the video plays", async () => {
    const seen = collector();
    const video = await player("l2", seen);
    await video.play(52);
    await video.play(80);
    assert.deepEqual(milestones(seen), [25, 50, 75]);
    await video.end();
    await video.end();
    assert.deepEqual(milestones(seen), [25, 50, 75, 100]);
    assert.deepEqual(seen.named("video_progress")[0].props, {
      course_id: "course-1",
      lesson_id: "l2",
      milestone: 25,
    });
  });

  it("does not count a jump forward as watched", async () => {
    const seen = collector();
    const video = await player("l2", seen);
    await video.play(10);
    await video.jump(90);
    assert.deepEqual(milestones(seen), []);
    await video.end();
    assert.deepEqual(milestones(seen), [100]);
  });

  it("reports nothing without a lesson id", async () => {
    const seen = collector();
    const video = await player(undefined, seen);
    await video.play(60);
    await video.end();
    assert.deepEqual(milestones(seen), []);
  });
});

process.on("exit", teardownReactPage);
