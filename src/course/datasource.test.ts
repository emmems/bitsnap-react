import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError } from "@connectrpc/connect";
import {
  PanelCourseFailure,
  PanelCourseItemKind,
  PanelCourseSchema,
  PanelCourseType,
  PanelLessonSchema,
  PanelTestSchema,
  UserPanelGetCourseResponseSchema,
  UserPanelGetLessonResponseSchema,
  UserPanelGetTestResponseSchema,
  UserPanelRateLessonResponseSchema,
  UserPanelSubmitTestResponseSchema,
} from "../gen/proto/public/v1/user_panel_course_pb.ts";
import {
  createCourseDataSource,
  failureToCode,
  mapAnswerToProto,
  toCourseError,
  type CourseRpcClient,
} from "./datasource.ts";
import { CourseError } from "./types.ts";

const AUTH = { accessId: "access-1", accessToken: "token-1" };

function clientWith(methods: Record<string, (req: any) => unknown>): CourseRpcClient {
  return Object.fromEntries(
    Object.entries(methods).map(([name, fn]) => [name, async (req: any) => fn(req)]),
  ) as unknown as CourseRpcClient;
}

describe("course data source", () => {
  it("sends the access id and the session token and maps the course", async () => {
    const requests: unknown[] = [];
    const ds = createCourseDataSource(
      clientWith({
        getCourse: (req) => {
          requests.push(req);
          return create(UserPanelGetCourseResponseSchema, {
            result: {
              case: "success",
              value: create(PanelCourseSchema, {
                id: "c1",
                type: PanelCourseType.VIDEO,
                title: "Video course",
                coverUrl: "https://cdn/cover.jpg",
                totalLessons: 2,
                completedLessons: 1,
                progressPercent: 50,
                resumeItemId: "l2",
                sections: [
                  {
                    id: "s1",
                    title: "Section",
                    items: [
                      {
                        id: "l1",
                        kind: PanelCourseItemKind.LESSON,
                        title: "One",
                        durationSeconds: 90,
                        thumbnailUrl: "https://cdn/t.jpg",
                        completed: true,
                      },
                      {
                        id: "l2",
                        kind: PanelCourseItemKind.LESSON,
                        title: "Two",
                        locked: true,
                        lockReason: { gatingTestId: "t1", gatingTestTitle: "Gate" },
                      },
                    ],
                  },
                ],
                finalItems: [
                  { id: "t1", kind: PanelCourseItemKind.TEST, title: "Gate", gating: true },
                ],
              }),
            },
          });
        },
      }),
      AUTH,
    );

    const course = await ds.getCourse();
    assert.deepEqual(requests, [{ accessId: "access-1", accessToken: "token-1" }]);
    assert.equal(course.type, "video");
    assert.equal(course.coverUrl, "https://cdn/cover.jpg");
    assert.equal(course.progressPercent, 50);
    assert.equal(course.sections[0]!.items[0]!.thumbnailUrl, "https://cdn/t.jpg");
    assert.equal(course.sections[0]!.items[0]!.completed, true);
    assert.deepEqual(course.sections[0]!.items[1]!.lockReason, {
      gatingTestId: "t1",
      gatingTestTitle: "Gate",
    });
    assert.equal(course.finalItems[0]!.kind, "test");
    assert.equal(course.finalItems[0]!.gating, true);
  });

  it("reads the token on every call when it is a function", async () => {
    let token = "first";
    const seen: string[] = [];
    const ds = createCourseDataSource(
      clientWith({
        getCourse: (req) => {
          seen.push(req.accessToken);
          return create(UserPanelGetCourseResponseSchema, {
            result: { case: "success", value: create(PanelCourseSchema, {}) },
          });
        },
      }),
      { accessId: "a", accessToken: () => token },
    );
    await ds.getCourse();
    token = "second";
    await ds.getCourse();
    assert.deepEqual(seen, ["first", "second"]);
  });

  it("maps a lesson with video, attachments and neighbours", async () => {
    const ds = createCourseDataSource(
      clientWith({
        getLesson: (req) => {
          assert.equal(req.lessonId, "l1");
          return create(UserPanelGetLessonResponseSchema, {
            result: {
              case: "success",
              value: create(PanelLessonSchema, {
                id: "l1",
                sectionId: "s1",
                title: "One",
                contentHtml: "<p>Hi</p>",
                video: {
                  hlsUrl: "https://stream/x.m3u8?token=t",
                  posterUrl: "https://stream/p.jpg",
                  durationSeconds: 120,
                },
                attachments: [{ id: "f1", name: "notes.pdf", size: 2048n, url: "https://s3/x" }],
                next: { id: "t1", kind: PanelCourseItemKind.TEST },
                positionSeconds: 30,
                myRating: 4,
                averageRating: 4.5,
                ratingCount: 10,
                urlsExpireAt: timestampFromDate(new Date("2030-01-01T00:00:00Z")),
              }),
            },
          });
        },
      }),
      AUTH,
    );
    const lesson = await ds.getLesson("l1");
    assert.equal(lesson.video?.hlsUrl, "https://stream/x.m3u8?token=t");
    assert.equal(lesson.video?.durationSeconds, 120);
    assert.deepEqual(lesson.attachments, [
      { id: "f1", name: "notes.pdf", size: 2048, url: "https://s3/x" },
    ]);
    assert.equal(lesson.prev, undefined);
    assert.deepEqual(lesson.next, { id: "t1", kind: "test" });
    assert.equal(lesson.positionSeconds, 30);
    assert.equal(lesson.urlsExpireAt?.toISOString(), "2030-01-01T00:00:00.000Z");
  });

  it("treats a lesson without a video url as a lesson without a video", async () => {
    const ds = createCourseDataSource(
      clientWith({
        getLesson: () =>
          create(UserPanelGetLessonResponseSchema, {
            result: {
              case: "success",
              value: create(PanelLessonSchema, { id: "l1", video: { hlsUrl: "" } }),
            },
          }),
      }),
      AUTH,
    );
    assert.equal((await ds.getLesson("l1")).video, undefined);
  });

  it("maps test questions of every kind and drops unknown ones", async () => {
    const ds = createCourseDataSource(
      clientWith({
        getTest: () =>
          create(UserPanelGetTestResponseSchema, {
            result: {
              case: "success",
              value: create(PanelTestSchema, {
                id: "t1",
                title: "Quiz",
                passThresholdPercent: 70,
                attemptsAllowed: 3,
                attemptsLeft: 2,
                questions: [
                  {
                    id: "q1",
                    prompt: "MCQ",
                    points: 1,
                    config: {
                      case: "mcq",
                      value: { choices: [{ id: "a", label: "A" }], multiple: true },
                    },
                  },
                  {
                    id: "q2",
                    prompt: "Todo",
                    config: {
                      case: "todolist",
                      value: { steps: [{ id: "s", label: "S", required: true }] },
                    },
                  },
                  {
                    id: "q3",
                    prompt: "Gap",
                    config: {
                      case: "fillGap",
                      value: { template: "{{g}}", blanks: ["g"] },
                    },
                  },
                  {
                    id: "q4",
                    prompt: "Sort",
                    config: {
                      case: "sortOrder",
                      value: { items: [{ id: "x", label: "X" }] },
                    },
                  },
                  { id: "q5", prompt: "From the future" },
                ],
              }),
            },
          }),
      }),
      AUTH,
    );
    const test = await ds.getTest("t1");
    assert.deepEqual(
      test.questions.map((q) => q.config.type),
      ["mcq", "todolist", "fill_gap", "sort_order"],
    );
    assert.equal(test.attemptsLeft, 2);
    assert.equal(test.passThresholdPercent, 70);
  });

  it("keeps attempts left unset for unlimited tests", async () => {
    const ds = createCourseDataSource(
      clientWith({
        getTest: () =>
          create(UserPanelGetTestResponseSchema, {
            result: { case: "success", value: create(PanelTestSchema, { id: "t" }) },
          }),
      }),
      AUTH,
    );
    assert.equal((await ds.getTest("t")).attemptsLeft, undefined);
  });

  it("submits answers in the shape of the contract and maps the result", async () => {
    let request: any;
    const ds = createCourseDataSource(
      clientWith({
        submitTest: (req) => {
          request = req;
          return create(UserPanelSubmitTestResponseSchema, {
            result: {
              case: "success",
              value: {
                submission: { id: "s1", scorePercent: 50, passed: false, durationMs: 1200n },
                results: [
                  {
                    questionId: "q1",
                    correct: false,
                    points: 0,
                    correctAnswer: {
                      questionId: "q1",
                      value: { case: "mcq", value: { selectedIds: ["a"] } },
                    },
                  },
                  { questionId: "q2", correct: true, points: 1 },
                ],
                attemptsLeft: 1,
              },
            },
          });
        },
      }),
      AUTH,
    );
    const result = await ds.submitTest(
      "t1",
      {
        q1: { type: "mcq", selectedIds: ["b"] },
        q2: { type: "fill_gap", values: { g: "x" } },
        q3: { type: "sort_order", orderedIds: ["2", "1"] },
        q4: { type: "todolist", checkedIds: ["s"] },
      },
      1234.6,
    );
    assert.equal(request.testId, "t1");
    assert.equal(request.durationMs, 1235n);
    assert.deepEqual(request.answers, [
      { questionId: "q1", value: { case: "mcq", value: { selectedIds: ["b"] } } },
      { questionId: "q2", value: { case: "fillGap", value: { values: { g: "x" } } } },
      { questionId: "q3", value: { case: "sortOrder", value: { orderedIds: ["2", "1"] } } },
      { questionId: "q4", value: { case: "todolist", value: { checkedIds: ["s"] } } },
    ]);
    assert.equal(result.submission.scorePercent, 50);
    assert.equal(result.submission.durationMs, 1200);
    assert.deepEqual(result.results[0]!.correctAnswer, { type: "mcq", selectedIds: ["a"] });
    assert.equal(result.results[1]!.correctAnswer, undefined);
    assert.equal(result.attemptsLeft, 1);
  });

  it("maps answers to the proto oneof", () => {
    assert.deepEqual(mapAnswerToProto("q", { type: "mcq", selectedIds: ["a"] }), {
      questionId: "q",
      value: { case: "mcq", value: { selectedIds: ["a"] } },
    });
  });

  it("passes progress through and maps the rating", async () => {
    let progress: any;
    const ds = createCourseDataSource(
      clientWith({
        saveLessonProgress: (req) => {
          progress = req;
          return {
            result: {
              case: "success",
              value: { completed: true, completedLessons: 3, progressPercent: 60 },
            },
          };
        },
        rateLesson: (req) => {
          assert.deepEqual(
            [req.lessonId, req.score, req.comment],
            ["l1", 5, "great"],
          );
          return create(UserPanelRateLessonResponseSchema, {
            result: {
              case: "success",
              value: { myRating: 5, averageRating: 4.5, ratingCount: 2 },
            },
          });
        },
      }),
      AUTH,
    );
    const saved = await ds.saveProgress({
      lessonId: "l1",
      completed: true,
      positionSeconds: 100,
      durationSeconds: 110,
    });
    assert.deepEqual(progress, {
      accessId: "access-1",
      accessToken: "token-1",
      lessonId: "l1",
      completed: true,
      positionSeconds: 100,
      durationSeconds: 110,
    });
    assert.deepEqual(saved, { completed: true, completedLessons: 3, progressPercent: 60 });
    assert.deepEqual(await ds.rate("l1", 5, "great"), {
      myRating: 5,
      averageRating: 4.5,
      ratingCount: 2,
    });
  });

  it("turns a failure of the response into a CourseError", async () => {
    const ds = createCourseDataSource(
      clientWith({
        getLesson: () =>
          create(UserPanelGetLessonResponseSchema, {
            result: { case: "failure", value: PanelCourseFailure.ITEM_LOCKED },
          }),
        getCourse: () => create(UserPanelGetCourseResponseSchema, {}),
      }),
      AUTH,
    );
    await assert.rejects(ds.getLesson("l"), (error: unknown) => {
      assert.ok(error instanceof CourseError);
      assert.equal(error.code, "item_locked");
      return true;
    });
    await assert.rejects(ds.getCourse(), (error: unknown) => {
      assert.ok(error instanceof CourseError);
      assert.equal(error.code, "unknown");
      return true;
    });
  });

  it("maps transport errors and passes unknown ones through", async () => {
    const down = createCourseDataSource(
      {
        getCourse: async () => {
          throw new ConnectError("no session", Code.Unauthenticated);
        },
      } as unknown as CourseRpcClient,
      AUTH,
    );
    await assert.rejects(down.getCourse(), (error: unknown) => {
      assert.ok(error instanceof CourseError);
      assert.equal(error.code, "unauthorized");
      return true;
    });
    const boom = new TypeError("boom");
    assert.equal(toCourseError(boom), boom);
    assert.equal(
      (toCourseError(new ConnectError("x", Code.Unavailable)) as CourseError).code,
      "unavailable",
    );
  });

  it("maps every failure value to a code", () => {
    assert.equal(failureToCode(PanelCourseFailure.UNAUTHORIZED), "unauthorized");
    assert.equal(failureToCode(PanelCourseFailure.COURSE_NOT_FOUND), "course_not_found");
    assert.equal(failureToCode(PanelCourseFailure.ITEM_NOT_FOUND), "item_not_found");
    assert.equal(failureToCode(PanelCourseFailure.NO_ATTEMPTS_LEFT), "no_attempts_left");
    assert.equal(failureToCode(PanelCourseFailure.INVALID_ARGUMENT), "invalid_argument");
    assert.equal(failureToCode(PanelCourseFailure.RATE_LIMITED), "rate_limited");
    assert.equal(failureToCode(PanelCourseFailure.UNAVAILABLE), "unavailable");
    assert.equal(failureToCode(PanelCourseFailure.UNKNOWN), "unknown");
  });
});
