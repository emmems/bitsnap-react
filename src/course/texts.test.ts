import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COURSE_TEXT_TABLES, courseText, getCourseTexts, type CourseTexts } from "./texts.ts";

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

describe("course texts", () => {
  it("has the same keys and placeholders in Polish and English", () => {
    assert.deepEqual(
      Object.keys(COURSE_TEXT_TABLES.pl).sort(),
      Object.keys(COURSE_TEXT_TABLES.en).sort(),
    );
    for (const key of Object.keys(COURSE_TEXT_TABLES.pl) as Array<
      keyof typeof COURSE_TEXT_TABLES.pl
    >) {
      assert.deepEqual(
        placeholders(COURSE_TEXT_TABLES.pl[key]),
        placeholders(COURSE_TEXT_TABLES.en[key]),
        key,
      );
      assert.notEqual(COURSE_TEXT_TABLES.pl[key].trim(), "", key);
    }
  });

  it("picks the language by locale and applies overrides", () => {
    assert.equal(getCourseTexts(undefined, "en-US").previewBadge, "Preview");
    assert.equal(getCourseTexts(undefined, "pl-PL").previewBadge, "Podgląd");
    assert.equal(getCourseTexts(undefined, "de-DE").previewBadge, "Podgląd");
    assert.equal(
      getCourseTexts({ previewBadge: "Draft" }, "pl-PL").previewBadge,
      "Draft",
    );
  });

  it("has the strings of the player shell, overview and tests in both languages", () => {
    const keys = [
      "courseOverview",
      "hideOutline",
      "showOutline",
      "theaterMode",
      "outlineButton",
      "progressCompact",
      "previewNote",
      "previewQuestionsNote",
      "goToTest",
      "ratingTab",
      "completeAndNext",
      "nextLesson",
      "resumeFrom",
      "hubStart",
      "hubContinue",
      "hubSolveTest",
      "testChipThreshold",
      "testChipRequired",
      "testContinue",
    ] as const;
    for (const key of keys) {
      assert.ok(COURSE_TEXT_TABLES.pl[key], `pl ${key}`);
      assert.ok(COURSE_TEXT_TABLES.en[key], `en ${key}`);
    }
    assert.equal(getCourseTexts(undefined, "pl").completeAndNext, "Ukończ i przejdź dalej");
    assert.equal(getCourseTexts(undefined, "pl").descriptionTab, "Treść");
    assert.equal(getCourseTexts(undefined, "en").goToTest, "Go to the test: {test}");
  });

  it("fills a string missing from an older complete texts object", () => {
    const old = { ...getCourseTexts(undefined, "en") } as CourseTexts;
    delete old.completeAndNext;
    assert.equal(courseText(old, "completeAndNext"), "Ukończ i przejdź dalej");
    assert.equal(courseText(old, "back"), "Back");
  });
});
