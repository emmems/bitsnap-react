import { Code, ConnectError, type Client } from "@connectrpc/connect";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  PanelCourseFailure,
  PanelCourseItemKind,
  PanelCourseType,
  type PanelAnswer,
  type PanelCourse,
  type PanelCourseItem,
  type PanelItemRef,
  type PanelLesson,
  type PanelLessonQuestion,
  type PanelTest,
  type PanelTestQuestion,
  type PanelTestSubmission,
  type UserPanelCourseService,
} from "../gen/proto/public/v1/user_panel_course_pb";
import {
  CourseError,
  type Course,
  type CourseDataSource,
  type CourseErrorCode,
  type CourseItem,
  type ItemRef,
  type Lesson,
  type LessonQuestion,
  type QuestionAnswer,
  type Test,
  type TestAnswers,
  type TestQuestion,
  type TestSubmission,
} from "./types";

/** The part of the generated Connect client the data source calls. */
export type CourseRpcClient = Client<typeof UserPanelCourseService>;

export type CourseAuth = {
  /** `UserProduct.access_id` of the purchased course. */
  accessId: string;
  /** Panel session token; a function is read on every call. */
  accessToken: string | (() => string | undefined);
};

const FAILURE_CODES: Record<PanelCourseFailure, CourseErrorCode> = {
  [PanelCourseFailure.UNKNOWN]: "unknown",
  [PanelCourseFailure.UNAUTHORIZED]: "unauthorized",
  [PanelCourseFailure.COURSE_NOT_FOUND]: "course_not_found",
  [PanelCourseFailure.ITEM_NOT_FOUND]: "item_not_found",
  [PanelCourseFailure.ITEM_LOCKED]: "item_locked",
  [PanelCourseFailure.NO_ATTEMPTS_LEFT]: "no_attempts_left",
  [PanelCourseFailure.INVALID_ARGUMENT]: "invalid_argument",
  [PanelCourseFailure.RATE_LIMITED]: "rate_limited",
  [PanelCourseFailure.UNAVAILABLE]: "unavailable",
};

export function failureToCode(failure: PanelCourseFailure): CourseErrorCode {
  return FAILURE_CODES[failure] ?? "unknown";
}

/** Maps a transport error to a `CourseError`; other errors pass through. */
export function toCourseError(error: unknown): unknown {
  if (error instanceof CourseError) {
    return error;
  }
  const connectError = ConnectError.from(error);
  switch (connectError.code) {
    case Code.Unauthenticated:
    case Code.PermissionDenied:
      return new CourseError("unauthorized", connectError.rawMessage);
    case Code.NotFound:
      return new CourseError("course_not_found", connectError.rawMessage);
    case Code.ResourceExhausted:
      return new CourseError("rate_limited", connectError.rawMessage);
    case Code.Unavailable:
    case Code.DeadlineExceeded:
      return new CourseError("unavailable", connectError.rawMessage);
    default:
      return error;
  }
}

type Result<T> = {
  result:
    | { case: "success"; value: T }
    | { case: "failure"; value: PanelCourseFailure }
    | { case: undefined; value?: undefined };
};

/** The success value of a response, or a `CourseError` for a failure. */
export function unwrap<T>(response: Result<T>): T {
  const { result } = response;
  if (result.case === "success") {
    return result.value;
  }
  if (result.case === "failure") {
    throw new CourseError(failureToCode(result.value));
  }
  throw new CourseError("unknown", "empty response");
}

// Mapping from the protobuf messages

function mapItem(item: PanelCourseItem): CourseItem {
  return {
    id: item.id,
    kind:
      item.kind === PanelCourseItemKind.TEST ? "test" : "lesson",
    title: item.title,
    isFree: item.isFree,
    locked: item.locked,
    lockReason:
      item.locked && item.lockReason != null
        ? {
            gatingTestId: item.lockReason.gatingTestId,
            gatingTestTitle: item.lockReason.gatingTestTitle,
          }
        : undefined,
    completed: item.completed,
    durationSeconds: item.durationSeconds,
    thumbnailUrl: item.thumbnailUrl || undefined,
    gating: item.gating,
  };
}

export function mapCourse(course: PanelCourse): Course {
  return {
    id: course.id,
    type: course.type === PanelCourseType.VIDEO ? "video" : "standard",
    title: course.title,
    description: course.description,
    coverUrl: course.coverUrl || undefined,
    totalLessons: course.totalLessons,
    completedLessons: course.completedLessons,
    progressPercent: course.progressPercent,
    sections: course.sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      items: section.items.map(mapItem),
    })),
    finalItems: course.finalItems.map(mapItem),
    resumeItemId: course.resumeItemId,
  };
}

function mapRef(ref: PanelItemRef | undefined): ItemRef | undefined {
  return ref == null
    ? undefined
    : {
        id: ref.id,
        kind: ref.kind === PanelCourseItemKind.TEST ? "test" : "lesson",
      };
}

export function mapLesson(lesson: PanelLesson): Lesson {
  return {
    id: lesson.id,
    sectionId: lesson.sectionId,
    title: lesson.title,
    description: lesson.description,
    contentHtml: lesson.contentHtml,
    video:
      lesson.video != null && lesson.video.hlsUrl !== ""
        ? {
            hlsUrl: lesson.video.hlsUrl,
            posterUrl: lesson.video.posterUrl || undefined,
            durationSeconds: lesson.video.durationSeconds,
          }
        : undefined,
    attachments: lesson.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      size: Number(a.size),
      url: a.url,
    })),
    prev: mapRef(lesson.prev),
    next: mapRef(lesson.next),
    completed: lesson.completed,
    positionSeconds: lesson.positionSeconds,
    myRating: lesson.myRating,
    averageRating: lesson.averageRating,
    ratingCount: lesson.ratingCount,
    urlsExpireAt:
      lesson.urlsExpireAt != null ? timestampDate(lesson.urlsExpireAt) : undefined,
  };
}

function mapQuestion(question: PanelTestQuestion): TestQuestion | undefined {
  const base = { id: question.id, prompt: question.prompt, points: question.points };
  const { config } = question;
  switch (config.case) {
    case "mcq":
      return {
        ...base,
        config: {
          type: "mcq",
          choices: config.value.choices.map((c) => ({ id: c.id, label: c.label })),
          multiple: config.value.multiple,
        },
      };
    case "todolist":
      return {
        ...base,
        config: {
          type: "todolist",
          steps: config.value.steps.map((s) => ({
            id: s.id,
            label: s.label,
            required: s.required,
          })),
        },
      };
    case "fillGap":
      return {
        ...base,
        config: {
          type: "fill_gap",
          template: config.value.template,
          blanks: [...config.value.blanks],
        },
      };
    case "sortOrder":
      return {
        ...base,
        config: {
          type: "sort_order",
          items: config.value.items.map((c) => ({ id: c.id, label: c.label })),
        },
      };
    default:
      // A kind this version of the panel does not know.
      return undefined;
  }
}

export function mapTest(test: PanelTest): Test {
  return {
    id: test.id,
    title: test.title,
    description: test.description,
    gating: test.gating,
    passThresholdPercent: test.passThresholdPercent,
    attemptsAllowed: test.attemptsAllowed,
    attemptsLeft: test.attemptsLeft,
    attemptCount: test.attemptCount,
    bestScorePercent: test.bestScorePercent,
    passed: test.passed,
    questions: test.questions
      .map(mapQuestion)
      .filter((q): q is TestQuestion => q != null),
  };
}

export function mapSubmission(submission: PanelTestSubmission): TestSubmission {
  return {
    id: submission.id,
    scorePercent: submission.scorePercent,
    passed: submission.passed,
    durationMs: Number(submission.durationMs),
    createdAt:
      submission.createdAt != null ? timestampDate(submission.createdAt) : undefined,
  };
}

export function mapAnswerFromProto(answer: PanelAnswer): QuestionAnswer | undefined {
  const { value } = answer;
  switch (value.case) {
    case "mcq":
      return { type: "mcq", selectedIds: [...value.value.selectedIds] };
    case "todolist":
      return { type: "todolist", checkedIds: [...value.value.checkedIds] };
    case "fillGap":
      return { type: "fill_gap", values: { ...value.value.values } };
    case "sortOrder":
      return { type: "sort_order", orderedIds: [...value.value.orderedIds] };
    default:
      return undefined;
  }
}

/** Request shape of an answer (plain init object of `PanelAnswer`). */
export function mapAnswerToProto(questionId: string, answer: QuestionAnswer) {
  switch (answer.type) {
    case "mcq":
      return {
        questionId,
        value: { case: "mcq" as const, value: { selectedIds: answer.selectedIds } },
      };
    case "todolist":
      return {
        questionId,
        value: { case: "todolist" as const, value: { checkedIds: answer.checkedIds } },
      };
    case "fill_gap":
      return {
        questionId,
        value: { case: "fillGap" as const, value: { values: answer.values } },
      };
    case "sort_order":
      return {
        questionId,
        value: { case: "sortOrder" as const, value: { orderedIds: answer.orderedIds } },
      };
  }
}

function mapLessonQuestion(question: PanelLessonQuestion): LessonQuestion {
  return {
    id: question.id,
    content: question.content,
    authorName: question.authorName,
    isMine: question.isMine,
    createdAt:
      question.createdAt != null ? timestampDate(question.createdAt) : undefined,
    answer:
      question.answer != null
        ? {
            content: question.answer.content,
            createdAt:
              question.answer.createdAt != null
                ? timestampDate(question.answer.createdAt)
                : undefined,
          }
        : undefined,
  };
}

/**
 * Data source over `UserPanelCourseService`. Every call carries the access id
 * and the panel session token; failures become `CourseError`.
 */
export function createCourseDataSource(
  client: CourseRpcClient,
  auth: CourseAuth,
): CourseDataSource {
  const credentials = () => ({
    accessId: auth.accessId,
    accessToken:
      typeof auth.accessToken === "function"
        ? (auth.accessToken() ?? "")
        : auth.accessToken,
  });

  async function call<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw toCourseError(error);
    }
  }

  return {
    getCourse: () =>
      call(async () => mapCourse(unwrap(await client.getCourse(credentials())))),

    getLesson: (lessonId) =>
      call(async () =>
        mapLesson(unwrap(await client.getLesson({ ...credentials(), lessonId }))),
      ),

    saveProgress: (input) =>
      call(async () => {
        const saved = unwrap(
          await client.saveLessonProgress({ ...credentials(), ...input }),
        );
        return {
          completed: saved.completed,
          completedLessons: saved.completedLessons,
          progressPercent: saved.progressPercent,
        };
      }),

    getTest: (testId) =>
      call(async () =>
        mapTest(unwrap(await client.getTest({ ...credentials(), testId }))),
      ),

    submitTest: (testId, answers: TestAnswers, durationMs) =>
      call(async () => {
        const result = unwrap(
          await client.submitTest({
            ...credentials(),
            testId,
            durationMs: BigInt(Math.max(0, Math.round(durationMs))),
            answers: Object.entries(answers).map(([questionId, answer]) =>
              mapAnswerToProto(questionId, answer),
            ),
          }),
        );
        if (result.submission == null) {
          throw new CourseError("unknown", "missing submission");
        }
        return {
          submission: mapSubmission(result.submission),
          results: result.results.map((r) => ({
            questionId: r.questionId,
            correct: r.correct,
            points: r.points,
            correctAnswer:
              r.correctAnswer != null
                ? mapAnswerFromProto(r.correctAnswer)
                : undefined,
          })),
          attemptsLeft: result.attemptsLeft,
        };
      }),

    listSubmissions: (testId) =>
      call(async () => {
        const list = unwrap(
          await client.listTestSubmissions({ ...credentials(), testId }),
        );
        return {
          submissions: list.submissions.map(mapSubmission),
          bestScorePercent: list.bestScorePercent,
          attemptCount: list.attemptCount,
        };
      }),

    listQuestions: (lessonId) =>
      call(async () =>
        unwrap(
          await client.listLessonQuestions({ ...credentials(), lessonId }),
        ).questions.map(mapLessonQuestion),
      ),

    askQuestion: (lessonId, content) =>
      call(async () =>
        mapLessonQuestion(
          unwrap(
            await client.askLessonQuestion({
              ...credentials(),
              lessonId,
              content,
            }),
          ),
        ),
      ),

    rate: (lessonId, score, comment = "") =>
      call(async () => {
        const rating = unwrap(
          await client.rateLesson({ ...credentials(), lessonId, score, comment }),
        );
        return {
          myRating: rating.myRating,
          averageRating: rating.averageRating,
          ratingCount: rating.ratingCount,
        };
      }),
  };
}
