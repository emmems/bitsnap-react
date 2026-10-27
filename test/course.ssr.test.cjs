const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToString } = require("react-dom/server");
const course = require("../dist/course.js");

const item = (id, overrides = {}) => ({
  id,
  kind: "lesson",
  title: `Lesson ${id}`,
  isFree: false,
  locked: false,
  completed: false,
  durationSeconds: 0,
  gating: false,
  ...overrides,
});

const initialCourse = (type) => ({
  id: "c1",
  type,
  title: "Learn the thing",
  description: "",
  totalLessons: 2,
  completedLessons: 1,
  progressPercent: 50,
  resumeItemId: "l2",
  sections: [
    {
      id: "s1",
      title: "Basics",
      description: "",
      items: [
        item("l1", { completed: true, durationSeconds: 125 }),
        item("l2", { durationSeconds: 60 }),
        item("t1", { kind: "test", title: "Gate test", gating: true }),
      ],
    },
    {
      id: "s2",
      title: "Advanced",
      description: "",
      items: [
        item("l3", {
          locked: true,
          lockReason: { gatingTestId: "t1", gatingTestTitle: "Gate test" },
        }),
      ],
    },
  ],
  finalItems: [],
});

// The data source of a server render is never called: effects do not run.
const dataSource = new Proxy(
  {},
  {
    get() {
      return () => new Promise(() => {});
    },
  },
);

test("course module exposes the public API", () => {
  assert.equal(typeof course.PanelCourse, "function");
  assert.equal(typeof course.createRpcCourseDataSource, "function");
  assert.equal(typeof course.createCourseDataSource, "function");
  assert.equal(typeof course.sanitizeLessonHtml, "function");
  assert.equal(typeof course.CourseError, "function");
  assert.equal(typeof course.getCourseTexts, "function");
});

test("renders the loading state of a course on the server", () => {
  const html = renderToString(
    React.createElement(course.PanelCourse, { dataSource }),
  );
  assert.match(html, /data-bitsnap-course/);
  assert.match(html, /Ładowanie kursu/);
});

test("renders the structure of a standard course from initialCourse", () => {
  const html = renderToString(
    React.createElement(course.PanelCourse, {
      dataSource,
      initialCourse: initialCourse("standard"),
      locale: "en-US",
      theme: { colors: { brand: "#336699" } },
    }),
  );
  assert.match(html, /data-course-type="standard"/);
  assert.match(html, /Learn the thing/);
  assert.match(html, /Basics/);
  assert.match(html, /Advanced/);
  assert.match(html, /1 of 2 lessons/);
  assert.match(html, /Pass the test to unlock it: Gate test/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /--course-accent:#336699/);
  // the open lesson (resume item) loads on the client
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /Preview/);
});

test("renders a video course as a playlist with durations and the preview badge", () => {
  const html = renderToString(
    React.createElement(course.PanelCourse, {
      dataSource,
      initialCourse: initialCourse("video"),
      preview: true,
    }),
  );
  assert.match(html, /data-course-type="video"/);
  assert.match(html, /Podgląd/);
  assert.match(html, /2:05/);
  assert.match(html, /Zablokowane|Odblokuje je zaliczenie testu: Gate test/);
});

test("shows a locked lesson page when a deep link points at a locked item", () => {
  const html = renderToString(
    React.createElement(course.PanelCourse, {
      dataSource,
      initialCourse: initialCourse("standard"),
      itemId: "l3",
      locale: "en-US",
    }),
  );
  assert.match(html, /This lesson is locked\. Pass the test “Gate test” to unlock it\./);
});

test("never renders lesson html on the server", () => {
  assert.equal(course.sanitizeLessonHtml("<p>hi</p>"), "");
});
