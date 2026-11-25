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
      position?: number;
      preview?: boolean;
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
      positionSeconds: options.position ?? 0,
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
          preview={options.preview}
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

  it("offsets the lesson action bar above mobile panel navigation only", async () => {
    for (const panel of [false, true]) {
      const view = await mount({ panel });
      try {
        const bar = view.container.querySelector('[data-lesson-navigation="bar"]')!;
        const article = view.container.querySelector("article")!;
        assert.ok(bar.classList.contains("bottom-[var(--course-mobile-bottom,0px)]"));
        assert.ok(bar.classList.contains("lg:sticky"), "sticky at the bottom on desktop");
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

  it("opens the outline in a mobile bottom sheet and closes it with Escape, the backdrop or a pick", async () => {
    for (const itemId of ["l2", "t1", "l3"]) {
      const view = await mount({ itemId, locked: true });
      try {
        const toggle = view.container.querySelector<HTMLButtonElement>("[data-course-drawer-toggle]")!;
        assert.ok(toggle);
        assert.match(toggle.textContent ?? "", /Outline \(1\/4\)/);
        assert.equal(toggle.getAttribute("aria-expanded"), "false");
        assert.equal(view.container.querySelector('[role="dialog"]'), null);

        await view.click(toggle);
        let drawer = view.container.querySelector('[role="dialog"]')!;
        assert.equal(drawer.id, toggle.getAttribute("aria-controls"));
        assert.equal(drawer.getAttribute("aria-modal"), "true");
        await React.act(async () => {
          dom.window.document.dispatchEvent(
            new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
          );
        });
        assert.equal(view.container.querySelector('[role="dialog"]'), null);

        await view.click(toggle);
        await view.click(view.container.querySelector("[data-course-drawer-backdrop]"));
        assert.equal(view.container.querySelector('[role="dialog"]'), null);

        await view.click(toggle);
        drawer = view.container.querySelector('[role="dialog"]')!;
        await view.click(drawer.querySelector('[data-item-id="l1"]'));
        assert.deepEqual(view.navigated, ["l1"]);
        assert.equal(view.container.querySelector('[role="dialog"]'), null);
        assert.equal(toggle.getAttribute("aria-expanded"), "false");
      } finally {
        await view.unmount();
      }
    }
  });

  it("collapses the outline rail for a wider lesson and remembers it", async () => {
    const view = await mount();
    try {
      const toggle = view.container.querySelector<HTMLButtonElement>("[data-course-rail-toggle]")!;
      assert.ok(view.container.querySelector("[data-course-rail]"));
      assert.equal(toggle.getAttribute("aria-expanded"), "true");
      assert.match(toggle.textContent ?? "", /Theater mode/);
      await view.click(toggle);
      assert.equal(view.container.querySelector("[data-course-rail]"), null);
      assert.equal(toggle.getAttribute("aria-expanded"), "false");
      assert.match(toggle.textContent ?? "", /Show outline/);
      assert.equal(dom.window.localStorage.getItem("bitsnap-course-outline"), "0");
      await view.click(toggle);
      assert.ok(view.container.querySelector("[data-course-rail]"));
    } finally {
      dom.window.localStorage.removeItem("bitsnap-course-outline");
      await view.unmount();
    }
  });

  it("renders underline tabs with counts, switches panels, and supports arrow keys", async () => {
    const view = await mount();
    try {
      const tabs = [
        ...view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
      ];
      assert.deepEqual(
        tabs.map((tab) => tab.textContent),
        ["Content", "Attachments (1)", "Questions", "Rating"],
      );
      assert.equal(tabs[0].getAttribute("aria-selected"), "true");
      await view.click(tabs[1]);
      assert.equal(tabs[1].getAttribute("aria-selected"), "true");
      const files = view.container.querySelector(
        `[id="${tabs[1].getAttribute("aria-controls")}"]`,
      )!;
      assert.equal(files.classList.contains("hidden"), false);
      const attachment = files.querySelector("[data-course-attachment]")!;
      assert.match(attachment.textContent ?? "", /PDF/);
      assert.match(attachment.textContent ?? "", /1\.0 KB/);
      await React.act(async () =>
        tabs[1].dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            key: "ArrowRight",
            bubbles: true,
          }),
        ),
      );
      assert.equal(tabs[2].getAttribute("aria-selected"), "true");
      assert.equal(dom.window.document.activeElement, tabs[2]);
    } finally {
      await view.unmount();
    }
  });

  it("completes the lesson and moves on with one click from the sticky bar", async () => {
    const view = await mount();
    try {
      assert.equal(view.container.querySelector("[data-course-up-next]"), null);
      const bar = () =>
        view.container.querySelector('[data-lesson-navigation="bar"]')!;
      await view.click(bar().querySelectorAll("button")[0]);
      assert.deepEqual(view.navigated, ["l1"]);

      const complete = bar().querySelector<HTMLButtonElement>("[data-course-complete]")!;
      assert.match(complete.textContent ?? "", /Complete and continue/);
      await view.click(complete);
      assert.equal(view.saved.length, 1);
      assert.deepEqual(view.saved[0], {
        lessonId: "l2",
        completed: true,
        positionSeconds: 0,
        durationSeconds: 0,
      });
      assert.deepEqual(view.navigated, ["l1", "l3"]);
      assert.match(
        view.container.querySelector('[aria-live="polite"]')?.textContent ?? "",
        /Lesson completed/,
      );
      assert.match(
        view.container.querySelector("header")?.textContent ?? "",
        /Course completed/,
      );

      // The owner kept the lesson open: it now reads as done, with a next button.
      assert.equal(bar().querySelector("[data-course-complete]"), null);
      assert.match(bar().querySelector("[data-course-completed]")?.textContent ?? "", /Completed/);
      const next = bar().querySelector<HTMLButtonElement>("[data-course-next]")!;
      assert.match(next.textContent ?? "", /Next lesson/);
      await view.click(next);
      assert.deepEqual(view.navigated, ["l1", "l3", "l3"]);
    } finally {
      await view.unmount();
    }
  });

  it("completes without moving on when the next item is locked, and offers the gating test", async () => {
    const view = await mount({ locked: true });
    try {
      const bar = view.container.querySelector('[data-lesson-navigation="bar"]')!;
      const complete = bar.querySelector<HTMLButtonElement>("[data-course-complete]")!;
      assert.match(complete.textContent ?? "", /Mark as completed/);
      await view.click(complete);
      assert.deepEqual(view.navigated, []);
      const upNext = view.container.querySelector("[data-course-up-next]")!;
      assert.match(upNext.textContent ?? "", /Pass the test/);
      assert.equal(
        bar.querySelector<HTMLButtonElement>("[data-course-next]")!.disabled,
        true,
      );
      await view.click(upNext.querySelector("button"));
      assert.deepEqual(view.navigated, ["t1"]);
    } finally {
      await view.unmount();
    }
  });

  it("jumps from a locked lesson straight to its gating test", async () => {
    const view = await mount({ itemId: "l3", locked: true });
    try {
      const button = view.container.querySelector<HTMLButtonElement>("[data-locked-go-to-test]")!;
      assert.ok(button);
      assert.match(button.textContent ?? "", /Go to the test: Test t1/);
      await view.click(button);
      assert.deepEqual(view.navigated, ["t1"]);
    } finally {
      await view.unmount();
    }
  });

  it("shows up next at video end and only autoplays an unlocked next lesson when enabled", async () => {
    for (const autoplay of [false, true]) {
      for (const locked of [false, true]) {
        const view = await mount({ video: true, autoplay, locked });
        try {
          const toggle = view.container.querySelector('[role="switch"]')!;
          assert.equal(toggle.getAttribute("aria-checked"), String(autoplay));
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
          const upNext = view.container.querySelector("[data-course-up-next]")!;
          assert.ok(upNext);
          assert.deepEqual(view.navigated, autoplay && !locked ? ["l3"] : []);
          assert.match(
            upNext.querySelector("button")?.textContent ?? "",
            locked ? /Go to the test/ : /Continue/,
          );
        } finally {
          await view.unmount();
        }
      }
    }
  });

  it("shows the video bar with duration, resume point and an autoplay switch", async () => {
    const view = await mount({ video: true, position: 42 });
    try {
      const bar = view.container.querySelector("[data-course-video-bar]")!;
      assert.match(bar.textContent ?? "", /Current lesson/);
      assert.match(bar.textContent ?? "", /1:40/);
      assert.match(bar.querySelector("[data-course-resume]")?.textContent ?? "", /Resuming at 0:42/);
      const toggle = bar.querySelector<HTMLButtonElement>('[role="switch"]')!;
      assert.equal(toggle.getAttribute("aria-checked"), "false");
      await view.click(toggle);
      assert.equal(toggle.getAttribute("aria-checked"), "true");
      assert.equal(dom.window.localStorage.getItem("bitsnap-course-autoplay"), "1");
      assert.ok(view.container.querySelector("[data-course-stage]")?.classList.contains("bg-neutral-950"));
    } finally {
      await view.unmount();
    }
  });

  it("opens the current section by default and toggles sections with aria-expanded", async () => {
    const view = await mount();
    try {
      const outline = view.container.querySelector("[data-course-rail] nav")!;
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

describe("course overview and preview", () => {
  async function render(props: Record<string, unknown> = {}) {
    const container = dom.window.document.getElementById("root")!;
    const root = createRoot(container);
    const navigated: string[] = [];
    const course = sampleCourse({
      description: "Everything about the thing.",
      coverUrl: "https://course.test/cover.jpg",
    });
    course.sections[0].description = "Start here.";
    const source = {
      ...dataSource,
      getLesson: async (id: string) => ({
        id,
        sectionId: "m1",
        title: `Lesson ${id}`,
        description: "",
        contentHtml: "",
        attachments: [],
        completed: false,
        positionSeconds: 0,
        myRating: 0,
        averageRating: 0,
        ratingCount: 0,
      }),
      listQuestions: async () => [],
    } as CourseDataSource;
    await React.act(async () =>
      root.render(
        <PanelCourse
          dataSource={source}
          initialCourse={course}
          locale="en"
          onItemChange={(id) => navigated.push(id)}
          {...props}
        />,
      ),
    );
    const click = async (element: Element | null | undefined) => {
      assert.ok(element);
      await React.act(async () => (element as HTMLElement).click());
    };
    return {
      container,
      navigated,
      click,
      unmount: () => React.act(async () => root.unmount()),
    };
  }

  it("opens the course overview with cover, description, modules and a continue button", async () => {
    const view = await render();
    try {
      assert.equal(view.container.querySelector("[data-course-hub]"), null, "the lesson opens first");
      const toggle = view.container.querySelector("[data-course-overview-toggle]")!;
      await view.click(toggle);
      const hub = view.container.querySelector("[data-course-hub]")!;
      assert.ok(hub);
      assert.equal(toggle.getAttribute("aria-pressed"), "true");
      assert.equal(
        hub.querySelector("[data-course-cover]")?.getAttribute("src"),
        "https://course.test/cover.jpg",
      );
      assert.match(hub.querySelector("[data-course-description]")?.textContent ?? "", /Everything about the thing/);
      assert.match(hub.textContent ?? "", /Start here\./);
      assert.match(hub.textContent ?? "", /Module 1/);
      assert.match(hub.textContent ?? "", /1\/2 lessons/);
      assert.equal(hub.querySelector('[data-hub-section-id="m2"]')?.getAttribute("data-locked"), "true");

      const cta = hub.querySelector("[data-course-hub-cta]")!;
      assert.match(cta.textContent ?? "", /Continue: Lesson l2/);
      await view.click(cta);
      assert.deepEqual(view.navigated, ["l2"]);
      assert.equal(view.container.querySelector("[data-course-hub]"), null);

      await view.click(toggle);
      await view.click(view.container.querySelector('[data-hub-solve-test="t1"]'));
      assert.deepEqual(view.navigated, ["l2", "t1"]);
    } finally {
      await view.unmount();
    }
  });

  it("starts a fresh course from the overview and falls back to a typographic cover", async () => {
    const course = sampleCourse({ completedLessons: 0, progressPercent: 0, coverUrl: undefined });
    course.sections[0].items[0].completed = false;
    const view = await render({ initialCourse: course });
    try {
      await view.click(view.container.querySelector("[data-course-overview-toggle]"));
      const hub = view.container.querySelector("[data-course-hub]")!;
      assert.equal(hub.querySelector("[data-course-cover]"), null);
      assert.match(hub.querySelector("[data-course-hub-cta]")?.textContent ?? "", /Start the course/);
    } finally {
      await view.unmount();
    }
  });

  it("flags a partly locked module and a locked final test with the reason", async () => {
    const course = sampleCourse();
    // Only one lesson of the module waits for the test.
    course.sections[1].items[1] = { ...course.sections[1].items[1], locked: false, lockReason: undefined };
    course.finalItems[0] = {
      ...course.finalItems[0],
      locked: true,
      lockReason: { gatingTestId: "t1", gatingTestTitle: "Test t1" },
    };
    const view = await render({ initialCourse: course });
    try {
      await view.click(view.container.querySelector("[data-course-overview-toggle]"));
      const hub = view.container.querySelector("[data-course-hub]")!;
      const module2 = hub.querySelector('[data-hub-section-id="m2"]')!;
      assert.equal(module2.getAttribute("data-locked"), "true");
      assert.ok(module2.querySelector('[data-hub-solve-test="t1"]'));
      assert.match(
        module2.querySelector('[data-hub-item-id="l3"] [data-hub-lock-text]')?.textContent ?? "",
        /Test t1/,
      );
      assert.equal(module2.querySelector('[data-hub-item-id="l4"] [data-hub-lock-text]'), null);

      const final = hub.querySelector('[data-hub-section-id="final"]')!;
      assert.ok(final.querySelector("[data-hub-locked-banner]"));
      assert.match(final.querySelector('[data-hub-item-id="t2"]')?.getAttribute("title") ?? "", /Test t1/);
      await view.click(final.querySelector('[data-hub-solve-test="t1"]'));
      assert.deepEqual(view.navigated, ["t1"]);
    } finally {
      await view.unmount();
    }
  });

  it("leaves the overview when the owner selects another item", async () => {
    const container = dom.window.document.getElementById("root")!;
    const root = createRoot(container);
    function Page() {
      const [itemId, setItemId] = React.useState<string>();
      return (
        <>
          <button id="pick" onClick={() => setItemId("l1")} />
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
    await React.act(async () => root.render(<Page />));
    try {
      await React.act(async () =>
        (container.querySelector("[data-course-overview-toggle]") as HTMLElement).click(),
      );
      assert.ok(container.querySelector("[data-course-hub]"));
      await React.act(async () => (container.querySelector("#pick") as HTMLElement).click());
      assert.equal(container.querySelector("[data-course-hub]"), null);
      assert.equal(
        container.querySelector("[aria-current]")?.getAttribute("data-item-id"),
        "l1",
      );
    } finally {
      await React.act(async () => root.unmount());
    }
  });

  it("shows the preview banner and never lets the preview send a question", async () => {
    const view = await render({ preview: true });
    try {
      assert.match(
        view.container.querySelector("[data-course-preview]")?.textContent ?? "",
        /Preview.*not saved/,
      );
      await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      const form = view.container.querySelector("form")!;
      assert.equal(form.querySelector("textarea")?.disabled, true);
      assert.equal(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled, true);
      assert.ok(view.container.querySelector("[data-course-preview-note]"));
      // The preview cannot complete a lesson either: the bar only moves on.
      const bar = view.container.querySelector('[data-lesson-navigation="bar"]')!;
      assert.equal(bar.querySelector("[data-course-complete]"), null);
      assert.ok(bar.querySelector("[data-course-next]"));
    } finally {
      await view.unmount();
    }
  });
});
