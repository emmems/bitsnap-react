import type {
  Course,
  CourseItem,
  QuestionAnswer,
  TestAnswers,
  TestQuestion,
  TestQuestionConfig,
} from "./types";

/** Playback share from which a lesson counts as watched. */
export const COMPLETE_AT_FRACTION = 0.8;

/** How often the player reports the position while it plays. */
export const PROGRESS_SAVE_INTERVAL_MS = 15_000;

/** An item together with the section it sits in (empty for final tests). */
export type FlatItem = CourseItem & { sectionId: string };

/** All items of the course in the order they are taken. */
export function flattenItems(course: Course): FlatItem[] {
  return [
    ...course.sections.flatMap((section) =>
      section.items.map((item) => ({ ...item, sectionId: section.id })),
    ),
    ...course.finalItems.map((item) => ({ ...item, sectionId: "" })),
  ];
}

export function findItem(
  course: Course,
  itemId: string | undefined,
): FlatItem | undefined {
  if (itemId == null || itemId === "") {
    return undefined;
  }
  return flattenItems(course).find((item) => item.id === itemId);
}

export function getAdjacentItems(
  course: Course,
  itemId: string,
): { prev?: FlatItem; next?: FlatItem } {
  const items = flattenItems(course);
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) {
    return {};
  }
  return { prev: items[index - 1], next: items[index + 1] };
}

/**
 * The item to start autoplay with after `itemId` ended: the next item when it
 * is an unlocked lesson. A test or a locked lesson stops the playlist.
 */
export function getAutoplayTarget(
  course: Course,
  itemId: string,
): FlatItem | undefined {
  const { next } = getAdjacentItems(course, itemId);
  return next != null && next.kind === "lesson" && !next.locked
    ? next
    : undefined;
}

/** Progress counted from the lessons of the structure (tests do not count). */
export function computeProgress(course: Pick<Course, "sections">): {
  total: number;
  completed: number;
  percent: number;
} {
  let total = 0;
  let completed = 0;
  for (const section of course.sections) {
    for (const item of section.items) {
      if (item.kind !== "lesson") {
        continue;
      }
      total += 1;
      if (item.completed) {
        completed += 1;
      }
    }
  }
  return {
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

/** The course after a lesson was completed, progress recomputed. */
export function markLessonCompleted(course: Course, lessonId: string): Course {
  const sections = course.sections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.id === lessonId && item.kind === "lesson"
        ? { ...item, completed: true }
        : item,
    ),
  }));
  const progress = computeProgress({ sections });
  return {
    ...course,
    sections,
    totalLessons: progress.total,
    completedLessons: progress.completed,
    progressPercent: progress.percent,
  };
}

/**
 * Item to show first: the requested one when it exists, else the one to
 * resume with, else the first unlocked item.
 */
export function resolveInitialItemId(
  course: Course,
  requestedId?: string,
): string | undefined {
  if (findItem(course, requestedId) != null) {
    return requestedId;
  }
  if (findItem(course, course.resumeItemId)?.locked === false) {
    return course.resumeItemId;
  }
  return flattenItems(course).find((item) => !item.locked)?.id;
}

/** `{name}` placeholders of a text. Unknown placeholders stay untouched. */
export function fillTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function isPlaybackComplete(
  positionSeconds: number,
  durationSeconds: number,
): boolean {
  return (
    durationSeconds > 0 &&
    positionSeconds / durationSeconds >= COMPLETE_AT_FRACTION
  );
}

/** Whether a periodic save is due. */
export function isSaveDue(
  lastSavedAt: number | undefined,
  now: number,
  intervalMs: number = PROGRESS_SAVE_INTERVAL_MS,
): boolean {
  return lastSavedAt == null || now - lastSavedAt >= intervalMs;
}

/** Where to resume: nothing when the video was (nearly) watched to the end. */
export function resumePosition(
  positionSeconds: number,
  durationSeconds: number,
): number {
  if (positionSeconds < 5) {
    return 0;
  }
  if (durationSeconds > 0 && positionSeconds >= durationSeconds - 5) {
    return 0;
  }
  return Math.floor(positionSeconds);
}

/** `m:ss`, or `h:mm:ss` from an hour on. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function formatBytes(bytes: number): string {
  if (!(bytes > 0)) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

// Tests

/** The empty answer of a question, with the order of sort items as given. */
export function emptyAnswer(config: TestQuestionConfig): QuestionAnswer {
  switch (config.type) {
    case "mcq":
      return { type: "mcq", selectedIds: [] };
    case "todolist":
      return { type: "todolist", checkedIds: [] };
    case "fill_gap":
      return { type: "fill_gap", values: {} };
    case "sort_order":
      return {
        type: "sort_order",
        orderedIds: config.items.map((item) => item.id),
      };
  }
}

/** Whether the customer did anything with the question. */
export function isAnswered(
  question: TestQuestion,
  answer: QuestionAnswer | undefined,
): boolean {
  if (answer == null || answer.type !== question.config.type) {
    return false;
  }
  switch (answer.type) {
    case "mcq":
      return answer.selectedIds.length > 0;
    case "todolist":
      return answer.checkedIds.length > 0;
    case "fill_gap":
      return Object.values(answer.values).some((value) => value.trim() !== "");
    case "sort_order":
      // The view stores a sort answer once the customer moved an item.
      return answer.orderedIds.length > 0;
  }
}

export function countUnanswered(
  questions: TestQuestion[],
  answers: TestAnswers,
): number {
  return questions.filter((q) => !isAnswered(q, answers[q.id])).length;
}

/** Moves the element at `from` to `to`; out of range moves change nothing. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  ) {
    return [...list];
  }
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

export type GapSegment =
  | { type: "text"; text: string }
  | { type: "blank"; id: string };

/**
 * Splits a fill-in-the-gap template (`Paris is in {{g1}}`) into text and
 * blanks. Placeholders that are not in `blanks` stay text.
 */
export function splitGapTemplate(
  template: string,
  blanks: readonly string[],
): GapSegment[] {
  const segments: GapSegment[] = [];
  const pattern = /\{\{\s*([^{}\s]+)\s*\}\}/g;
  let last = 0;
  for (const match of template.matchAll(pattern)) {
    const id = match[1]!;
    if (!blanks.includes(id)) {
      continue;
    }
    if (match.index > last) {
      segments.push({ type: "text", text: template.slice(last, match.index) });
    }
    segments.push({ type: "blank", id });
    last = match.index + match[0].length;
  }
  if (last < template.length) {
    segments.push({ type: "text", text: template.slice(last) });
  }
  return segments;
}

/** A readable form of an answer, used on the result screen. */
export function describeAnswer(
  question: TestQuestion,
  answer: QuestionAnswer | undefined,
): string {
  const { config } = question;
  if (answer == null || answer.type !== config.type) {
    return "";
  }
  const label = (list: { id: string; label: string }[], id: string) =>
    list.find((entry) => entry.id === id)?.label ?? id;

  if (config.type === "mcq" && answer.type === "mcq") {
    return answer.selectedIds.map((id) => label(config.choices, id)).join(", ");
  }
  if (config.type === "todolist" && answer.type === "todolist") {
    return answer.checkedIds.map((id) => label(config.steps, id)).join(", ");
  }
  if (config.type === "sort_order" && answer.type === "sort_order") {
    return answer.orderedIds.map((id) => label(config.items, id)).join(" → ");
  }
  if (config.type === "fill_gap" && answer.type === "fill_gap") {
    return splitGapTemplate(config.template, config.blanks)
      .map((segment) =>
        segment.type === "text"
          ? segment.text
          : `[${answer.values[segment.id] ?? ""}]`,
      )
      .join("");
  }
  return "";
}
