import type { Course, CourseItem } from "./types";

export function lessonItem(
  id: string,
  overrides: Partial<CourseItem> = {},
): CourseItem {
  return {
    id,
    kind: "lesson",
    title: `Lesson ${id}`,
    isFree: false,
    locked: false,
    completed: false,
    durationSeconds: 0,
    gating: false,
    ...overrides,
  };
}

export function testItem(
  id: string,
  overrides: Partial<CourseItem> = {},
): CourseItem {
  return lessonItem(id, { kind: "test", title: `Test ${id}`, ...overrides });
}

/**
 * Two modules, the second locked by the gating test `t1`, and a test of the
 * whole course at the end.
 */
export function sampleCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    type: "standard",
    title: "Course",
    description: "",
    totalLessons: 4,
    completedLessons: 1,
    progressPercent: 25,
    sections: [
      {
        id: "m1",
        title: "Module 1",
        description: "",
        items: [
          lessonItem("l1", { completed: true }),
          lessonItem("l2"),
          testItem("t1", { gating: true }),
        ],
      },
      {
        id: "m2",
        title: "Module 2",
        description: "",
        items: [
          lessonItem("l3", {
            locked: true,
            lockReason: { gatingTestId: "t1", gatingTestTitle: "Test t1" },
          }),
          lessonItem("l4", {
            locked: true,
            lockReason: { gatingTestId: "t1", gatingTestTitle: "Test t1" },
          }),
        ],
      },
    ],
    finalItems: [testItem("t2")],
    resumeItemId: "l2",
    ...overrides,
  };
}
