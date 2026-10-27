import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleCourse, lessonItem, testItem } from "./fixtures.ts";
import {
  COMPLETE_AT_FRACTION,
  computeProgress,
  countUnanswered,
  describeAnswer,
  emptyAnswer,
  fillTemplate,
  findItem,
  flattenItems,
  formatBytes,
  formatDuration,
  getAdjacentItems,
  getAutoplayTarget,
  isAnswered,
  isPlaybackComplete,
  isSaveDue,
  markLessonCompleted,
  moveItem,
  resolveInitialItemId,
  resumePosition,
  splitGapTemplate,
} from "./logic.ts";
import type { TestQuestion } from "./types.ts";

describe("playlist order", () => {
  it("flattens sections in order and the tests of the whole course last", () => {
    const items = flattenItems(sampleCourse());
    assert.deepEqual(
      items.map((i) => i.id),
      ["l1", "l2", "t1", "l3", "l4", "t2"],
    );
    assert.equal(items[0]!.sectionId, "m1");
    assert.equal(items.at(-1)!.sectionId, "");
  });

  it("finds the neighbours of an item, including across sections", () => {
    const course = sampleCourse();
    assert.deepEqual(getAdjacentItems(course, "l1").prev, undefined);
    assert.equal(getAdjacentItems(course, "l1").next?.id, "l2");
    assert.equal(getAdjacentItems(course, "t1").next?.id, "l3");
    assert.equal(getAdjacentItems(course, "l3").prev?.id, "t1");
    assert.equal(getAdjacentItems(course, "t2").next, undefined);
    assert.deepEqual(getAdjacentItems(course, "missing"), {});
  });

  it("autoplays only into an unlocked lesson", () => {
    const course = sampleCourse();
    assert.equal(getAutoplayTarget(course, "l1")?.id, "l2");
    // next is a test
    assert.equal(getAutoplayTarget(course, "l2"), undefined);
    // next is a lesson locked by the gating test
    assert.equal(getAutoplayTarget(course, "t1"), undefined);
    assert.equal(getAutoplayTarget(course, "t2"), undefined);
  });

  it("finds an item by id and ignores empty ids", () => {
    const course = sampleCourse();
    assert.equal(findItem(course, "l4")?.sectionId, "m2");
    assert.equal(findItem(course, ""), undefined);
    assert.equal(findItem(course, undefined), undefined);
  });
});

describe("progress", () => {
  it("counts lessons only, not tests", () => {
    assert.deepEqual(computeProgress(sampleCourse()), {
      total: 4,
      completed: 1,
      percent: 25,
    });
  });

  it("is zero for a course without lessons", () => {
    assert.deepEqual(computeProgress({ sections: [] }), {
      total: 0,
      completed: 0,
      percent: 0,
    });
  });

  it("rounds the percentage", () => {
    const course = sampleCourse();
    course.sections[0]!.items = [
      lessonItem("a", { completed: true }),
      lessonItem("b"),
      lessonItem("c"),
    ];
    course.sections[1]!.items = [];
    assert.equal(computeProgress(course).percent, 33);
  });

  it("marks a lesson completed and recomputes the numbers", () => {
    const course = markLessonCompleted(sampleCourse(), "l2");
    assert.equal(findItem(course, "l2")?.completed, true);
    assert.equal(course.completedLessons, 2);
    assert.equal(course.progressPercent, 50);
    assert.equal(course.totalLessons, 4);
  });

  it("does not touch the course when the id is a test or unknown", () => {
    const before = sampleCourse();
    const after = markLessonCompleted(before, "t1");
    assert.equal(findItem(after, "t1")?.completed, false);
    assert.equal(after.completedLessons, 1);
    assert.equal(markLessonCompleted(before, "nope").progressPercent, 25);
  });
});

describe("initial item", () => {
  it("keeps a requested item that exists, even when it is locked", () => {
    assert.equal(resolveInitialItemId(sampleCourse(), "l3"), "l3");
  });

  it("falls back to the resume item, then to the first unlocked item", () => {
    assert.equal(resolveInitialItemId(sampleCourse(), "gone"), "l2");
    assert.equal(resolveInitialItemId(sampleCourse(), undefined), "l2");
    assert.equal(
      resolveInitialItemId(sampleCourse({ resumeItemId: "" }), undefined),
      "l1",
    );
    // A locked resume item is not used
    assert.equal(
      resolveInitialItemId(sampleCourse({ resumeItemId: "l3" }), undefined),
      "l1",
    );
  });

  it("is undefined when everything is locked", () => {
    const course = sampleCourse({ resumeItemId: "" });
    for (const item of flattenItems(course)) {
      const found = [...course.sections.flatMap((s) => s.items), ...course.finalItems].find(
        (i) => i.id === item.id,
      )!;
      found.locked = true;
    }
    assert.equal(resolveInitialItemId(course, undefined), undefined);
  });
});

describe("playback", () => {
  it("completes at 80 percent, like the LMS", () => {
    assert.equal(COMPLETE_AT_FRACTION, 0.8);
    assert.equal(isPlaybackComplete(79, 100), false);
    assert.equal(isPlaybackComplete(80, 100), true);
    assert.equal(isPlaybackComplete(100, 100), true);
  });

  it("never completes a video of unknown length", () => {
    assert.equal(isPlaybackComplete(500, 0), false);
  });

  it("saves every 15 seconds", () => {
    assert.equal(isSaveDue(undefined, 1000), true);
    assert.equal(isSaveDue(1000, 15_999), false);
    assert.equal(isSaveDue(1000, 16_000), true);
  });

  it("resumes unless the start or the end was reached", () => {
    assert.equal(resumePosition(3, 600), 0);
    assert.equal(resumePosition(120.7, 600), 120);
    assert.equal(resumePosition(597, 600), 0);
    assert.equal(resumePosition(300, 0), 300);
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    assert.equal(formatDuration(0), "0:00");
    assert.equal(formatDuration(65), "1:05");
    assert.equal(formatDuration(3600), "1:00:00");
    assert.equal(formatDuration(3725.9), "1:02:05");
    assert.equal(formatDuration(-4), "0:00");
  });

  it("formats sizes", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1536), "1.5 KB");
    assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
    assert.equal(formatBytes(50 * 1024 * 1024), "50 MB");
  });

  it("fills placeholders and leaves unknown ones", () => {
    assert.equal(
      fillTemplate("{done} z {total} {x}", { done: 2, total: 5 }),
      "2 z 5 {x}",
    );
  });
});

describe("lock reasons", () => {
  it("carries the gating test of a locked item", () => {
    const l3 = findItem(sampleCourse(), "l3")!;
    assert.equal(l3.locked, true);
    assert.deepEqual(l3.lockReason, {
      gatingTestId: "t1",
      gatingTestTitle: "Test t1",
    });
    assert.equal(findItem(sampleCourse(), "l2")!.lockReason, undefined);
    assert.equal(findItem(sampleCourse(), "t1")!.gating, true);
    assert.equal(testItem("x").kind, "test");
  });
});

const mcq: TestQuestion = {
  id: "q1",
  prompt: "Pick",
  points: 1,
  config: {
    type: "mcq",
    multiple: true,
    choices: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
  },
};
const gap: TestQuestion = {
  id: "q2",
  prompt: "Fill",
  points: 1,
  config: { type: "fill_gap", template: "Paris is in {{g1}}.", blanks: ["g1"] },
};
const sort: TestQuestion = {
  id: "q3",
  prompt: "Sort",
  points: 1,
  config: {
    type: "sort_order",
    items: [
      { id: "y", label: "Y" },
      { id: "x", label: "X" },
    ],
  },
};
const todo: TestQuestion = {
  id: "q4",
  prompt: "Todo",
  points: 1,
  config: {
    type: "todolist",
    steps: [{ id: "s1", label: "Step 1", required: true }],
  },
};

describe("test answers", () => {
  it("starts with an empty answer per kind; sort keeps the shown order", () => {
    assert.deepEqual(emptyAnswer(mcq.config), { type: "mcq", selectedIds: [] });
    assert.deepEqual(emptyAnswer(todo.config), { type: "todolist", checkedIds: [] });
    assert.deepEqual(emptyAnswer(gap.config), { type: "fill_gap", values: {} });
    assert.deepEqual(emptyAnswer(sort.config), {
      type: "sort_order",
      orderedIds: ["y", "x"],
    });
  });

  it("knows which questions are answered", () => {
    assert.equal(isAnswered(mcq, undefined), false);
    assert.equal(isAnswered(mcq, { type: "mcq", selectedIds: [] }), false);
    assert.equal(isAnswered(mcq, { type: "mcq", selectedIds: ["a"] }), true);
    // an answer of another kind does not count
    assert.equal(isAnswered(mcq, { type: "todolist", checkedIds: ["s1"] }), false);
    assert.equal(isAnswered(gap, { type: "fill_gap", values: { g1: "  " } }), false);
    assert.equal(isAnswered(gap, { type: "fill_gap", values: { g1: "France" } }), true);
  });

  it("counts unanswered questions", () => {
    assert.equal(
      countUnanswered([mcq, gap, todo], {
        q1: { type: "mcq", selectedIds: ["b"] },
      }),
      2,
    );
  });

  it("moves items inside the list and ignores moves out of range", () => {
    assert.deepEqual(moveItem(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
    assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
    assert.deepEqual(moveItem(["a", "b"], 0, 5), ["a", "b"]);
    assert.deepEqual(moveItem(["a", "b"], 1, 1), ["a", "b"]);
  });

  it("splits a gap template on the declared blanks only", () => {
    assert.deepEqual(splitGapTemplate("Paris is in {{g1}}, not {{other}}.", ["g1"]), [
      { type: "text", text: "Paris is in " },
      { type: "blank", id: "g1" },
      { type: "text", text: ", not {{other}}." },
    ]);
    assert.deepEqual(splitGapTemplate("{{g1}}{{g2}}", ["g1", "g2"]), [
      { type: "blank", id: "g1" },
      { type: "blank", id: "g2" },
    ]);
    assert.deepEqual(splitGapTemplate("plain", []), [{ type: "text", text: "plain" }]);
  });

  it("describes answers with the labels of the question", () => {
    assert.equal(describeAnswer(mcq, { type: "mcq", selectedIds: ["a", "b"] }), "A, B");
    assert.equal(describeAnswer(sort, { type: "sort_order", orderedIds: ["x", "y"] }), "X → Y");
    assert.equal(
      describeAnswer(gap, { type: "fill_gap", values: { g1: "France" } }),
      "Paris is in [France].",
    );
    assert.equal(describeAnswer(todo, { type: "todolist", checkedIds: ["s1"] }), "Step 1");
    assert.equal(describeAnswer(mcq, undefined), "");
  });
});
