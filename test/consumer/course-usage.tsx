import {
  CourseError,
  PanelCourse,
  createCourseDataSource,
  createRpcCourseDataSource,
  getCourseTexts,
  sanitizeLessonHtml,
  type Course,
  type CourseDataSource,
  type CourseTexts,
  type Lesson,
  type PanelCourseProps,
  type TestAnswers,
} from "bitsnap-react/course";

/** Consumer fixture for the course view of this package. */

const rpcSource: CourseDataSource = createRpcCourseDataSource({
  accessId: "access-id",
});

const texts: Partial<CourseTexts> = { previewBadge: "Draft" };

const props: PanelCourseProps = {
  accessId: "access-id",
  itemId: "lesson-1",
  onItemChange: (itemId: string) => void itemId,
  onBack: () => undefined,
  texts,
  theme: { colors: { brand: "#336699" } },
};

/** The creator preview injects its own source. */
const previewSource: CourseDataSource = {
  getCourse: async (): Promise<Course> => ({
    id: "c",
    type: "video",
    title: "Preview",
    description: "",
    totalLessons: 0,
    completedLessons: 0,
    progressPercent: 0,
    sections: [],
    finalItems: [],
    resumeItemId: "",
  }),
  getLesson: async (): Promise<Lesson> => {
    throw new CourseError("item_not_found");
  },
  saveProgress: async () => ({ completed: false, completedLessons: 0, progressPercent: 0 }),
  getTest: async () => {
    throw new CourseError("item_not_found");
  },
  submitTest: async (_testId: string, _answers: TestAnswers, _durationMs: number) => {
    throw new CourseError("no_attempts_left");
  },
  listSubmissions: async () => ({ submissions: [], bestScorePercent: 0, attemptCount: 0 }),
  listQuestions: async () => [],
  askQuestion: async () => {
    throw new CourseError("unavailable");
  },
  rate: async () => ({ myRating: 0, averageRating: 0, ratingCount: 0 }),
};

export const view = (
  <>
    <PanelCourse {...props} />
    <PanelCourse dataSource={previewSource} preview />
    <PanelCourse dataSource={rpcSource} initialCourse={undefined} />
  </>
);

export const html: string = sanitizeLessonHtml("<p>x</p>");
export const label: string = getCourseTexts(texts, "en-US").back;
export const factory: typeof createCourseDataSource = createCourseDataSource;
