import { getLocale } from "../components/checkout/locale";
import { resolveTexts, type LocaleTables } from "../lib/texts";

/**
 * Every string of the course view. Pass a partial object through the `texts`
 * prop of `PanelCourse` to override any of them, whatever the locale.
 * Placeholders like `{count}` stay in overrides.
 */
export type CourseTexts = {
  back: string;
  loading: string;
  retry: string;
  errorGeneric: string;
  errorUnauthorized: string;
  errorNotFound: string;
  errorUnavailable: string;
  previewBadge: string;
  /** Placeholders `{done}` and `{total}`. */
  progressLessons: string;
  /** Placeholder `{percent}`. */
  progressPercent: string;
  contents: string;
  free: string;
  locked: string;
  /** Placeholder `{test}`. */
  lockedByTest: string;
  /** Placeholder `{test}`. */
  lockedPage: string;
  testBadge: string;
  completed: string;
  continueCourse: string;
  noItem: string;
  // Lesson
  markComplete: string;
  markedComplete: string;
  prevItem: string;
  nextItem: string;
  attachments: string;
  download: string;
  autoplay: string;
  videoError: string;
  videoRetry: string;
  noContent: string;
  // Test
  testGating: string;
  testAttemptsLeft: string;
  testAttemptsUnlimited: string;
  testNoAttemptsLeft: string;
  testPassThreshold: string;
  testBestScore: string;
  testSubmit: string;
  testSubmitting: string;
  /** Placeholder `{count}`. */
  testUnanswered: string;
  testPassed: string;
  testFailed: string;
  /** Placeholder `{percent}`. */
  testScore: string;
  testCorrect: string;
  testIncorrect: string;
  testCorrectAnswer: string;
  testTryAgain: string;
  testPreviousAttempts: string;
  /** Placeholders `{percent}` and `{date}`. */
  testAttemptRow: string;
  testNoQuestions: string;
  mcqSingle: string;
  mcqMultiple: string;
  todoHint: string;
  todoRequired: string;
  gapPlaceholder: string;
  sortHint: string;
  moveUp: string;
  moveDown: string;
  // Questions and ratings
  questionsTitle: string;
  questionsEmpty: string;
  questionPlaceholder: string;
  questionSubmit: string;
  questionSent: string;
  questionMine: string;
  questionTeamAnswer: string;
  rateTitle: string;
  /** Placeholder `{n}`. */
  rateStar: string;
  ratePlaceholder: string;
  rateSubmit: string;
  rateSaved: string;
  /** Placeholders `{average}` and `{count}`. */
  rateAverage: string;
};

export const COURSE_TEXT_TABLES: LocaleTables<keyof CourseTexts> = {
  pl: {
    back: "Wróć",
    loading: "Ładowanie kursu...",
    retry: "Spróbuj ponownie",
    errorGeneric: "Nie udało się załadować danych. Spróbuj ponownie za chwilę.",
    errorUnauthorized:
      "Nie masz dostępu do tego kursu. Zaloguj się ponownie lub skontaktuj się z pomocą.",
    errorNotFound: "Nie znaleziono tego kursu lub lekcji.",
    errorUnavailable:
      "Kurs jest chwilowo niedostępny. Spróbuj ponownie za chwilę.",
    previewBadge: "Podgląd",
    progressLessons: "{done} z {total} lekcji",
    progressPercent: "{percent}% ukończono",
    contents: "Spis treści",
    free: "Darmowa",
    locked: "Zablokowane",
    lockedByTest: "Odblokuje je zaliczenie testu: {test}",
    lockedPage:
      "Ta lekcja jest zablokowana. Zalicz test „{test}”, aby ją odblokować.",
    testBadge: "Test",
    completed: "Ukończono",
    continueCourse: "Kontynuuj kurs",
    noItem: "Wybierz lekcję z listy.",
    markComplete: "Oznacz jako ukończoną",
    markedComplete: "Lekcja ukończona",
    prevItem: "Poprzednia",
    nextItem: "Następna",
    attachments: "Materiały do pobrania",
    download: "Pobierz",
    autoplay: "Autoodtwarzanie następnej lekcji",
    videoError: "Nie udało się odtworzyć wideo.",
    videoRetry: "Odśwież wideo",
    noContent: "Ta lekcja nie ma jeszcze treści.",
    testGating: "Zaliczenie tego testu odblokowuje kolejne lekcje.",
    testAttemptsLeft: "Pozostało prób: {count}",
    testAttemptsUnlimited: "Liczba prób nie jest ograniczona.",
    testNoAttemptsLeft: "Wykorzystano wszystkie próby.",
    testPassThreshold: "Próg zaliczenia: {percent}%",
    testBestScore: "Najlepszy wynik: {percent}%",
    testSubmit: "Sprawdź odpowiedzi",
    testSubmitting: "Sprawdzanie...",
    testUnanswered: "Pytania bez odpowiedzi: {count}",
    testPassed: "Test zaliczony",
    testFailed: "Test niezaliczony",
    testScore: "Wynik: {percent}%",
    testCorrect: "Poprawnie",
    testIncorrect: "Niepoprawnie",
    testCorrectAnswer: "Poprawna odpowiedź",
    testTryAgain: "Spróbuj ponownie",
    testPreviousAttempts: "Poprzednie podejścia",
    testAttemptRow: "{percent}% · {date}",
    testNoQuestions: "Ten test nie ma jeszcze pytań.",
    mcqSingle: "Wybierz jedną odpowiedź",
    mcqMultiple: "Zaznacz wszystkie poprawne odpowiedzi",
    todoHint: "Zaznacz wykonane kroki",
    todoRequired: "wymagany",
    gapPlaceholder: "uzupełnij",
    sortHint: "Ułóż elementy w poprawnej kolejności",
    moveUp: "Przesuń w górę",
    moveDown: "Przesuń w dół",
    questionsTitle: "Pytania do lekcji",
    questionsEmpty: "Nikt jeszcze nie zadał pytania.",
    questionPlaceholder: "Zadaj pytanie autorowi kursu",
    questionSubmit: "Wyślij pytanie",
    questionSent: "Pytanie wysłane.",
    questionMine: "Ty",
    questionTeamAnswer: "Odpowiedź autora",
    rateTitle: "Oceń lekcję",
    rateStar: "{n} z 5",
    ratePlaceholder: "Komentarz (opcjonalnie)",
    rateSubmit: "Zapisz ocenę",
    rateSaved: "Dziękujemy za ocenę.",
    rateAverage: "Średnia ocena {average} ({count})",
  },
  en: {
    back: "Back",
    loading: "Loading the course...",
    retry: "Try again",
    errorGeneric: "Could not load the data. Please try again in a moment.",
    errorUnauthorized:
      "You do not have access to this course. Sign in again or contact support.",
    errorNotFound: "This course or lesson was not found.",
    errorUnavailable:
      "The course is temporarily unavailable. Please try again in a moment.",
    previewBadge: "Preview",
    progressLessons: "{done} of {total} lessons",
    progressPercent: "{percent}% complete",
    contents: "Contents",
    free: "Free",
    locked: "Locked",
    lockedByTest: "Pass the test to unlock it: {test}",
    lockedPage: "This lesson is locked. Pass the test “{test}” to unlock it.",
    testBadge: "Test",
    completed: "Completed",
    continueCourse: "Continue the course",
    noItem: "Pick a lesson from the list.",
    markComplete: "Mark as completed",
    markedComplete: "Lesson completed",
    prevItem: "Previous",
    nextItem: "Next",
    attachments: "Downloads",
    download: "Download",
    autoplay: "Autoplay the next lesson",
    videoError: "The video could not be played.",
    videoRetry: "Reload the video",
    noContent: "This lesson has no content yet.",
    testGating: "Passing this test unlocks the following lessons.",
    testAttemptsLeft: "Attempts left: {count}",
    testAttemptsUnlimited: "The number of attempts is unlimited.",
    testNoAttemptsLeft: "You have used all attempts.",
    testPassThreshold: "Passing score: {percent}%",
    testBestScore: "Best score: {percent}%",
    testSubmit: "Check answers",
    testSubmitting: "Checking...",
    testUnanswered: "Unanswered questions: {count}",
    testPassed: "Test passed",
    testFailed: "Test not passed",
    testScore: "Score: {percent}%",
    testCorrect: "Correct",
    testIncorrect: "Incorrect",
    testCorrectAnswer: "Correct answer",
    testTryAgain: "Try again",
    testPreviousAttempts: "Previous attempts",
    testAttemptRow: "{percent}% · {date}",
    testNoQuestions: "This test has no questions yet.",
    mcqSingle: "Choose one answer",
    mcqMultiple: "Select all correct answers",
    todoHint: "Check the steps you have done",
    todoRequired: "required",
    gapPlaceholder: "fill in",
    sortHint: "Put the items in the correct order",
    moveUp: "Move up",
    moveDown: "Move down",
    questionsTitle: "Questions about this lesson",
    questionsEmpty: "Nobody has asked a question yet.",
    questionPlaceholder: "Ask the course author a question",
    questionSubmit: "Send question",
    questionSent: "Question sent.",
    questionMine: "You",
    questionTeamAnswer: "Answer from the author",
    rateTitle: "Rate this lesson",
    rateStar: "{n} of 5",
    ratePlaceholder: "Comment (optional)",
    rateSubmit: "Save rating",
    rateSaved: "Thanks for your rating.",
    rateAverage: "Average rating {average} ({count})",
  },
};

/** Course strings for a locale (library locale by default) with overrides. */
export function getCourseTexts(
  overrides?: Partial<CourseTexts>,
  locale: string = getLocale(),
): CourseTexts {
  return resolveTexts(COURSE_TEXT_TABLES, locale, overrides);
}
