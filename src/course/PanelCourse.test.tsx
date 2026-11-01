import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import type { CourseDataSource, Lesson } from "./types.ts";

const dom = new JSDOM("<!doctype html><div id=root></div>", {
  url: "https://course.test",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.Element.prototype.scrollIntoView = () => {};
dom.window.HTMLMediaElement.prototype.load = () => {};

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let PanelCourse: typeof import("./PanelCourse.tsx").PanelCourse;
let LazyPanelCourse: typeof import("../panel/components/LazyPanelCourse.tsx").default;
let sampleCourse: typeof import("./fixtures.ts").sampleCourse;

before(async () => {
  React = await import("react");
  LazyPanelCourse = (await import("../panel/components/LazyPanelCourse.tsx")).default;
  createRoot = (await import("react-dom/client")).createRoot;
  PanelCourse = (await import("./PanelCourse.tsx")).PanelCourse;
  sampleCourse = (await import("./fixtures.ts")).sampleCourse;
});

// The data source of a course that is already loaded is never answered.
const dataSource = new Proxy(
  {},
  { get: () => () => new Promise(() => {}) },
) as CourseDataSource;

describe("panel course navigation", () => {
  it("shows the default item again when the controlled item id is cleared", async () => {
    const container = dom.window.document.getElementById("root")!;
    const root = createRoot(container);

    // Mimics the panel page: the item lives in the URL (`?item=`).
    function Page() {
      const [itemId, setItemId] = React.useState<string>();
      return (
        <>
          <button id="back" onClick={() => setItemId(undefined)} />
          <PanelCourse
            dataSource={dataSource}
            initialCourse={sampleCourse()}
            locale="en"
            itemId={itemId}
            onItemChange={setItemId}
          />
        </>
      );
    }

    const current = () =>
      container.querySelector("[aria-current]")?.getAttribute("data-item-id");
    const click = async (selector: string) => {
      await React.act(async () => {
        (container.querySelector(selector) as HTMLElement).click();
      });
    };

    await React.act(async () => {
      root.render(<Page />);
    });
    assert.equal(current(), "l2", "the resume item opens first");

    await click('[data-item-id="l1"]');
    assert.equal(current(), "l1");
    await click('[data-item-id="t1"]');
    assert.equal(current(), "t1");

    await click("#back");
    assert.equal(current(), "l2", "going back to the URL without an item");

    await React.act(async () => {
      root.unmount();
    });
  });
});

describe("course lesson controls", () => {
  async function mount(
    options: {
      locked?: boolean;
      panel?: boolean;
      itemId?: string;
      completed?: boolean;
      video?: boolean;
      autoplay?: boolean;
    } = {},
  ) {
    const container = dom.window.document.getElementById("root")!;
    const root = createRoot(container);
    const saved: unknown[] = [];
    const navigated: string[] = [];
    dom.window.localStorage.setItem(
      "bitsnap-course-autoplay",
      options.autoplay ? "1" : "0",
    );
    const course = sampleCourse({ type: "video", resumeItemId: "l2" });
    if (options.video)
      course.sections[0].items = course.sections[0].items.filter(
        (item) => item.kind === "lesson",
      );
    course.sections[1].items[0].locked = options.locked ?? false;
    const lesson: Lesson = {
      id: "l2",
      sectionId: "m1",
      title: "Current lesson",
      description: "Lesson description",
      video: options.video
        ? { hlsUrl: "https://course.test/lesson.m3u8", durationSeconds: 100 }
        : undefined,
      contentHtml: "",
      attachments: [
        {
          id: "f1",
          name: "Notes.pdf",
          size: 1024,
          url: "https://example.com/notes.pdf",
        },
      ],
      completed: options.completed ?? false,
      positionSeconds: 0,
      myRating: 0,
      averageRating: 0,
      ratingCount: 0,
      prev: { id: "l1", kind: "lesson" },
      next: { id: "l3", kind: "lesson" },
    };
    const source = {
      ...dataSource,
      getCourse: async () => course,
      getTest: () => new Promise(() => {}),
      listSubmissions: async () => [],
      getLesson: async () => lesson,
      listQuestions: async () => [],
      saveProgress: async (input: unknown) => {
        saved.push(input);
        return { completed: true, completedLessons: 4, progressPercent: 100 };
      },
    } as CourseDataSource;
    const Component = options.panel ? LazyPanelCourse : PanelCourse;
    await React.act(async () =>
      root.render(
        <Component
          dataSource={source}
          initialCourse={course}
          itemId={options.itemId ?? "l2"}
          onItemChange={(id) => navigated.push(id)}
          locale="en"
        />,
      ),
    );
    const click = async (element: Element | null | undefined) => {
      assert.ok(element);
      await React.act(async () => (element as HTMLElement).click());
    };
    const unmount = async () => {
      await React.act(async () => root.unmount());
    };
    return { container, root, saved, navigated, click, unmount };
  }

  it("offsets panel lesson controls and content above mobile panel navigation only", async () => {
    for (const panel of [false, true]) {
      const view = await mount({ panel });
      try {
        const bar = view.container.querySelector('[data-lesson-navigation="mobile"]')!;
        const article = view.container.querySelector("article")!;
        assert.ok(bar.classList.contains("bottom-[var(--course-mobile-bottom,0px)]"));
        assert.ok(article.classList.contains("pb-[calc(5rem+env(safe-area-inset-bottom)+var(--course-mobile-bottom,0px))]"));
        assert.ok(article.classList.contains("lg:pb-0"));
        const wrapper = view.container.querySelector('[class*="--course-mobile-bottom:calc"]');
        assert.equal(Boolean(wrapper), panel);
        if (wrapper) {
          assert.ok(wrapper.classList.contains("[--course-mobile-bottom:calc(56px+env(safe-area-inset-bottom))]"));
          assert.ok(wrapper.classList.contains("md:[--course-mobile-bottom:0px]"));
        }
      } finally {
        await view.unmount();
      }
    }
  });

  it("offers a mobile contents toggle on video tests and locked items", async () => {
    for (const itemId of ["t1", "l3"]) {
      const view = await mount({ itemId, locked: true });
      try {
        const toggle = view.container.querySelector<HTMLButtonElement>('button[aria-controls][aria-expanded]');
        assert.ok(toggle);
        assert.equal(toggle.getAttribute("aria-expanded"), "false");
        const outline = dom.window.document.getElementById(toggle.getAttribute("aria-controls")!)!;
        assert.ok(outline.classList.contains("hidden"));
        await view.click(toggle);
        assert.equal(toggle.getAttribute("aria-expanded"), "true");
        assert.ok(!outline.classList.contains("hidden"));
        assert.ok(outline.classList.contains("lg:hidden"));
        await view.click(outline.querySelector('[data-item-id="l1"]'));
        assert.deepEqual(view.navigated, ["l1"]);
        assert.equal(toggle.getAttribute("aria-expanded"), "false");
      } finally {
        await view.unmount();
      }
    }
  });

  it("renders mobile tabs, switches panels, and supports arrow keys", async () => {
    const view = await mount();
    try {
      const tabs = [
        ...view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
      ];
      assert.deepEqual(
        tabs.map((tab) => tab.textContent),
        ["Lessons", "Description", "Files", "Questions"],
      );
      assert.equal(tabs[0].getAttribute("aria-selected"), "true");
      await view.click(tabs[2]);
      assert.equal(tabs[2].getAttribute("aria-selected"), "true");
      assert.equal(
        view.container
          .querySelector(`[id="${tabs[2].getAttribute("aria-controls")}"]`)
          ?.classList.contains("hidden"),
        false,
      );
      await React.act(async () =>
        tabs[2].dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            key: "ArrowRight",
            bubbles: true,
          }),
        ),
      );
      assert.equal(tabs[3].getAttribute("aria-selected"), "true");
      assert.equal(dom.window.document.activeElement, tabs[3]);
    } finally {
      await view.unmount();
    }
  });

  it("uses the sticky bar handlers and reveals up next and completion feedback", async () => {
    const view = await mount();
    try {
      assert.equal(view.container.querySelector("[data-course-up-next]"), null);
      const buttons = view.container.querySelectorAll(
        '[data-lesson-navigation="mobile"] button',
      );
      await view.click(buttons[0]);
      assert.deepEqual(view.navigated, ["l1"]);
      await view.click(buttons[1]);
      assert.equal(view.saved.length, 1);
      assert.deepEqual(view.saved[0], {
        lessonId: "l2",
        completed: true,
        positionSeconds: 0,
        durationSeconds: 0,
      });
      assert.equal((buttons[1] as HTMLButtonElement).disabled, true);
      assert.match(
        view.container.querySelector('[aria-live="polite"]')?.textContent ?? "",
        /Lesson completed/,
      );
      assert.match(
        view.container.querySelector("header")?.textContent ?? "",
        /Course completed/,
      );
      assert.match(
        view.container.querySelector("[data-course-up-next]")?.textContent ??
          "",
        /Next lesson: Lesson l3/,
      );
      await view.click(buttons[2]);
      await view.click(
        view.container.querySelector("[data-course-up-next] button"),
      );
      assert.deepEqual(view.navigated, ["l1", "l3", "l3"]);
    } finally {
      await view.unmount();
    }
  });

  it("keeps a locked next item disabled in both navigation and up next", async () => {
    const view = await mount({ locked: true, completed: true });
    try {
      const upNext = view.container.querySelector("[data-course-up-next]");
      assert.ok(upNext);
      assert.match(upNext.textContent ?? "", /Pass the test/);
      const button = upNext.querySelector("button")!;
      assert.equal(button.disabled, true);
      assert.equal(
        (
          view.container.querySelector(
            '[data-lesson-navigation="mobile"] button:last-child',
          ) as HTMLButtonElement
        ).disabled,
        true,
      );
      await view.click(button);
      assert.deepEqual(view.navigated, []);
    } finally {
      await view.unmount();
    }
  });

  it("shows up next at video end and only autoplays an unlocked next lesson when enabled", async () => {
    for (const autoplay of [false, true]) {
      for (const locked of [false, true]) {
        const view = await mount({ video: true, autoplay, locked });
        try {
          const video = view.container.querySelector("video")!;
          Object.defineProperty(video, "duration", {
            value: 100,
            configurable: true,
          });
          Object.defineProperty(video, "currentTime", {
            value: 100,
            configurable: true,
          });
          await React.act(async () => {
            video.dispatchEvent(new dom.window.Event("ended"));
          });
          assert.ok(view.container.querySelector("[data-course-up-next]"));
          assert.deepEqual(view.navigated, autoplay && !locked ? ["l3"] : []);
          assert.equal(
            (
              view.container.querySelector(
                "[data-course-up-next] button",
              ) as HTMLButtonElement
            ).disabled,
            locked,
          );
        } finally {
          await view.unmount();
        }
      }
    }
  });

  it("opens the current section by default and toggles sections with aria-expanded", async () => {
    const view = await mount();
    try {
      const outline = view.container.querySelector('[role="tabpanel"] nav')!;
      const current = outline.querySelector(
        '[data-section-id="m1"] h3 button',
      )!;
      const other = outline.querySelector('[data-section-id="m2"] h3 button')!;
      assert.equal(current.getAttribute("aria-expanded"), "true");
      assert.equal(other.getAttribute("aria-expanded"), "false");
      await view.click(current);
      assert.equal(current.getAttribute("aria-expanded"), "false");
      await view.click(other);
      assert.equal(other.getAttribute("aria-expanded"), "true");
      assert.equal(
        outline.querySelector('[data-section-id="m2"] [hidden]'),
        null,
      );
    } finally {
      await view.unmount();
    }
  });
});
