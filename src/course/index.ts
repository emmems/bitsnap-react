/**
 * `bitsnap-react/course` subpath: the course view of the customer panel.
 * Loaded lazily by `Panel`, so the main bundle does not carry it. Load
 * `bitsnap-react/dist/index.css` once, as for every other component.
 */
export { PanelCourse, type PanelCourseProps } from "./PanelCourse";
export {
  createRpcCourseDataSource,
  type RpcCourseDataSourceOptions,
} from "./rpc";
export { createCourseDataSource } from "./datasource";
export { sanitizeLessonHtml } from "./sanitize";
export {
  COURSE_TEXT_TABLES,
  getCourseTexts,
  type CourseTexts,
} from "./texts";
export {
  CourseError,
  type Course,
  type CourseDataSource,
  type CourseErrorCode,
  type CourseItem,
  type CourseItemKind,
  type CourseSection,
  type CourseType,
  type ItemRef,
  type Lesson,
  type LessonAttachment,
  type LessonQuestion,
  type LessonRating,
  type LessonVideo,
  type LockReason,
  type ProgressSaved,
  type QuestionAnswer,
  type QuestionResult,
  type SaveProgressInput,
  type Test,
  type TestAnswers,
  type TestChoice,
  type TestQuestion,
  type TestQuestionConfig,
  type TestResult,
  type TestSubmission,
  type TestSubmissionList,
} from "./types";
