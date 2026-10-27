/**
 * Domain model of the course view. It is independent of the generated
 * protobuf messages, so a creator preview can feed `PanelCourse` through its
 * own `CourseDataSource` without the RPC layer.
 */

export type CourseType = "standard" | "video";

export type CourseItemKind = "lesson" | "test";

/** The gating test that has to be passed before the item opens. */
export type LockReason = {
  gatingTestId: string;
  gatingTestTitle: string;
};

/** A lesson or a test in the list of a course. */
export type CourseItem = {
  /** Unique among all items of the course. */
  id: string;
  kind: CourseItemKind;
  title: string;
  isFree: boolean;
  locked: boolean;
  lockReason?: LockReason;
  /** A lesson: completed. A test: passed. */
  completed: boolean;
  /** Video length, 0 when unknown. */
  durationSeconds: number;
  thumbnailUrl?: string;
  /** Tests only: passing it unlocks the following sections. */
  gating: boolean;
};

/** A module (standard course) or a section (video course). */
export type CourseSection = {
  id: string;
  title: string;
  description: string;
  items: CourseItem[];
};

export type Course = {
  id: string;
  type: CourseType;
  title: string;
  description: string;
  coverUrl?: string;
  totalLessons: number;
  completedLessons: number;
  /** 0 to 100. */
  progressPercent: number;
  sections: CourseSection[];
  /** Tests of the whole course, after the last section. */
  finalItems: CourseItem[];
  /** Item to continue with; empty when everything is done. */
  resumeItemId: string;
};

export type ItemRef = {
  id: string;
  kind: CourseItemKind;
};

export type LessonVideo = {
  hlsUrl: string;
  posterUrl?: string;
  durationSeconds: number;
};

export type LessonAttachment = {
  id: string;
  name: string;
  /** Bytes. */
  size: number;
  url: string;
};

export type Lesson = {
  id: string;
  sectionId: string;
  title: string;
  description: string;
  /** Raw HTML of the editor. Always pass it through `sanitizeLessonHtml`. */
  contentHtml: string;
  video?: LessonVideo;
  attachments: LessonAttachment[];
  prev?: ItemRef;
  next?: ItemRef;
  completed: boolean;
  /** Where the customer stopped the video. */
  positionSeconds: number;
  /** 0 when the customer has not rated the lesson. */
  myRating: number;
  averageRating: number;
  ratingCount: number;
  /** When the signed URLs stop working. */
  urlsExpireAt?: Date;
};

export type SaveProgressInput = {
  lessonId: string;
  completed: boolean;
  positionSeconds: number;
  durationSeconds: number;
};

export type ProgressSaved = {
  completed: boolean;
  completedLessons: number;
  progressPercent: number;
};

// Tests

export type TestChoice = { id: string; label: string };

export type TestQuestionConfig =
  | { type: "mcq"; choices: TestChoice[]; multiple: boolean }
  | {
      type: "todolist";
      steps: { id: string; label: string; required: boolean }[];
    }
  | { type: "fill_gap"; template: string; blanks: string[] }
  | { type: "sort_order"; items: TestChoice[] };

export type TestQuestion = {
  id: string;
  prompt: string;
  points: number;
  config: TestQuestionConfig;
};

export type QuestionAnswer =
  | { type: "mcq"; selectedIds: string[] }
  | { type: "todolist"; checkedIds: string[] }
  | { type: "fill_gap"; values: Record<string, string> }
  | { type: "sort_order"; orderedIds: string[] };

/** Answers by question id. */
export type TestAnswers = Record<string, QuestionAnswer>;

export type Test = {
  id: string;
  title: string;
  description: string;
  gating: boolean;
  passThresholdPercent: number;
  /** 0 means unlimited. */
  attemptsAllowed: number;
  /** `undefined` when the attempts are unlimited. */
  attemptsLeft?: number;
  attemptCount: number;
  bestScorePercent: number;
  passed: boolean;
  questions: TestQuestion[];
};

export type TestSubmission = {
  id: string;
  scorePercent: number;
  passed: boolean;
  durationMs: number;
  createdAt?: Date;
};

export type QuestionResult = {
  questionId: string;
  correct: boolean;
  points: number;
  /** Only when the show-answers rule of the test allows it. */
  correctAnswer?: QuestionAnswer;
};

export type TestResult = {
  submission: TestSubmission;
  results: QuestionResult[];
  attemptsLeft?: number;
};

export type TestSubmissionList = {
  submissions: TestSubmission[];
  bestScorePercent: number;
  attemptCount: number;
};

// Questions and ratings

export type LessonQuestion = {
  id: string;
  content: string;
  authorName: string;
  isMine: boolean;
  createdAt?: Date;
  answer?: { content: string; createdAt?: Date };
};

export type LessonRating = {
  myRating: number;
  averageRating: number;
  ratingCount: number;
};

export type CourseErrorCode =
  | "unauthorized"
  | "course_not_found"
  | "item_not_found"
  | "item_locked"
  | "no_attempts_left"
  | "invalid_argument"
  | "rate_limited"
  | "unavailable"
  | "unknown";

/** Failure reported by a data source. */
export class CourseError extends Error {
  readonly code: CourseErrorCode;

  constructor(code: CourseErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CourseError";
    this.code = code;
  }
}

/**
 * Everything `PanelCourse` needs from a backend, scoped to one course and one
 * customer. Methods reject with `CourseError` for failures the view can
 * explain (any other error is shown as a generic one).
 *
 * The default implementation is `createRpcCourseDataSource`; the creator
 * preview of the Bitsnap dashboard passes its own.
 */
export interface CourseDataSource {
  getCourse(): Promise<Course>;
  getLesson(lessonId: string): Promise<Lesson>;
  saveProgress(input: SaveProgressInput): Promise<ProgressSaved>;
  getTest(testId: string): Promise<Test>;
  submitTest(
    testId: string,
    answers: TestAnswers,
    durationMs: number,
  ): Promise<TestResult>;
  listSubmissions(testId: string): Promise<TestSubmissionList>;
  listQuestions(lessonId: string): Promise<LessonQuestion[]>;
  askQuestion(lessonId: string, content: string): Promise<LessonQuestion>;
  rate(
    lessonId: string,
    score: number,
    comment?: string,
  ): Promise<LessonRating>;
}
