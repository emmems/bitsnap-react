import { ArrowDown, ArrowRight, ArrowUp, Check, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { scoreBucket } from "@/src/analytics/instrument";
import { useCourseTrack } from "./analytics";
import { useCourseView } from "./context";
import {
  countUnanswered,
  describeAnswer,
  emptyAnswer,
  fillTemplate,
  moveItem,
  splitGapTemplate,
} from "./logic";
import type {
  QuestionAnswer,
  Test,
  TestAnswers,
  TestQuestion,
  TestResult,
  TestSubmissionList,
} from "./types";
import { courseText } from "./texts";
import {
  ACCENT_BORDER,
  ACCENT_BUTTON,
  ACCENT_WASH,
  ErrorBox,
  HAIRLINE,
  LoadingBlock,
  MUTED,
  errorMessage,
} from "./ui";
import { useAsyncResource } from "./useAsyncResource";

/** A choice card: hairline border, accent border and wash once selected. */
const CHOICE = cn(
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
  "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60",
  "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
  "has-[:disabled]:cursor-default has-[:disabled]:hover:bg-transparent",
);
const CHOICE_SELECTED = cn(ACCENT_BORDER, ACCENT_WASH);
const CHOICE_INPUT =
  "mt-0.5 size-4 shrink-0 accent-[var(--course-accent,var(--primary))] dark:accent-[var(--course-accent-dark,var(--course-accent,var(--primary)))]";

function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <li
      title={title}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums text-neutral-700 dark:text-neutral-300",
        HAIRLINE,
      )}
    >
      {children}
    </li>
  );
}

type AnswerEditorProps<A extends QuestionAnswer> = {
  question: TestQuestion;
  answer: A;
  disabled: boolean;
  onChange: (answer: A) => void;
};

function McqEditor({
  question,
  answer,
  disabled,
  onChange,
}: AnswerEditorProps<Extract<QuestionAnswer, { type: "mcq" }>>) {
  const { texts } = useCourseView();
  if (question.config.type !== "mcq") return null;
  const { choices, multiple } = question.config;
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
        {multiple ? texts.mcqMultiple : texts.mcqSingle}
      </legend>
      {choices.map((choice) => {
        const checked = answer.selectedIds.includes(choice.id);
        return (
          <label
            key={choice.id}
            data-selected={checked || undefined}
            className={cn(CHOICE, checked && CHOICE_SELECTED)}
          >
            <input
              className={CHOICE_INPUT}
              type={multiple ? "checkbox" : "radio"}
              name={`q-${question.id}`}
              checked={checked}
              onChange={() =>
                onChange({
                  type: "mcq",
                  selectedIds: multiple
                    ? checked
                      ? answer.selectedIds.filter((id) => id !== choice.id)
                      : [...answer.selectedIds, choice.id]
                    : [choice.id],
                })
              }
            />
            <span className="break-words">{choice.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

function TodolistEditor({
  question,
  answer,
  disabled,
  onChange,
}: AnswerEditorProps<Extract<QuestionAnswer, { type: "todolist" }>>) {
  const { texts } = useCourseView();
  if (question.config.type !== "todolist") return null;
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
        {texts.todoHint}
      </legend>
      {question.config.steps.map((step) => {
        const checked = answer.checkedIds.includes(step.id);
        return (
          <label
            key={step.id}
            data-selected={checked || undefined}
            className={cn(CHOICE, checked && CHOICE_SELECTED)}
          >
            <input
              className={CHOICE_INPUT}
              type="checkbox"
              checked={checked}
              onChange={() =>
                onChange({
                  type: "todolist",
                  checkedIds: checked
                    ? answer.checkedIds.filter((id) => id !== step.id)
                    : [...answer.checkedIds, step.id],
                })
              }
            />
            <span className="break-words">
              {step.label}
              {step.required && (
                <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                  ({texts.todoRequired})
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function FillGapEditor({
  question,
  answer,
  disabled,
  onChange,
}: AnswerEditorProps<Extract<QuestionAnswer, { type: "fill_gap" }>>) {
  const { texts } = useCourseView();
  if (question.config.type !== "fill_gap") return null;
  const segments = splitGapTemplate(
    question.config.template,
    question.config.blanks,
  );
  return (
    <p className="text-sm leading-10 break-words">
      {segments.map((segment, index) =>
        segment.type === "text" ? (
          <span key={index} className="whitespace-pre-wrap">
            {segment.text}
          </span>
        ) : (
          <Input
            key={index}
            className="mx-1 inline-block h-8 w-36 align-middle"
            aria-label={`${texts.gapPlaceholder} ${segment.id}`}
            placeholder={texts.gapPlaceholder}
            disabled={disabled}
            value={answer.values[segment.id] ?? ""}
            onChange={(e) =>
              onChange({
                type: "fill_gap",
                values: { ...answer.values, [segment.id]: e.target.value },
              })
            }
          />
        ),
      )}
    </p>
  );
}

function SortEditor({
  question,
  answer,
  disabled,
  onChange,
}: AnswerEditorProps<Extract<QuestionAnswer, { type: "sort_order" }>>) {
  const { texts } = useCourseView();
  if (question.config.type !== "sort_order") return null;
  const labels = new Map(question.config.items.map((i) => [i.id, i.label]));
  const move = (from: number, to: number) =>
    onChange({
      type: "sort_order",
      orderedIds: moveItem(answer.orderedIds, from, to),
    });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {texts.sortHint}
      </p>
      <ol className="flex flex-col gap-2">
        {answer.orderedIds.map((id, index) => (
          <li
            key={id}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              HAIRLINE,
            )}
          >
            <span className="w-5 text-xs text-neutral-500">{index + 1}.</span>
            <span className="min-w-0 flex-1 break-words">{labels.get(id) ?? id}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={texts.moveUp}
              disabled={disabled || index === 0}
              onClick={() => move(index, index - 1)}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={texts.moveDown}
              disabled={disabled || index === answer.orderedIds.length - 1}
              onClick={() => move(index, index + 1)}
            >
              <ArrowDown aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function QuestionEditor({
  question,
  answer,
  disabled,
  onChange,
}: {
  question: TestQuestion;
  answer: QuestionAnswer;
  disabled: boolean;
  onChange: (answer: QuestionAnswer) => void;
}) {
  const common = { question, disabled, onChange };
  switch (answer.type) {
    case "mcq":
      return <McqEditor {...common} answer={answer} />;
    case "todolist":
      return <TodolistEditor {...common} answer={answer} />;
    case "fill_gap":
      return <FillGapEditor {...common} answer={answer} />;
    case "sort_order":
      return <SortEditor {...common} answer={answer} />;
  }
}

function SubmissionHistory({ list }: { list: TestSubmissionList }) {
  const { texts } = useCourseView();
  if (list.submissions.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{texts.testPreviousAttempts}</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {list.submissions.map((submission) => (
          <li
            key={submission.id}
            className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300"
          >
            {submission.passed ? (
              <Check className="size-4 text-emerald-600" aria-hidden />
            ) : (
              <X className="size-4 text-red-600" aria-hidden />
            )}
            {fillTemplate(texts.testAttemptRow, {
              percent: submission.scorePercent,
              date: submission.createdAt?.toLocaleString() ?? "",
            })}
          </li>
        ))}
      </ul>
    </section>
  );
}

type TestFormProps = {
  test: Test;
  onSubmitted: (result: TestResult) => void;
  onTryAgain: () => void;
  onContinue?: () => void;
};

function TestForm({ test, onSubmitted, onTryAgain, onContinue }: TestFormProps) {
  const { dataSource, texts } = useCourseView();
  const [answers, setAnswers] = useState<TestAnswers>({});
  const [result, setResult] = useState<TestResult>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>();
  const startedAt = useRef(Date.now());
  // The questions as they were shown: a refreshed test would shuffle again.
  const questions = useRef(test.questions).current;

  const outOfAttempts = test.attemptsLeft != null && test.attemptsLeft <= 0;
  const attemptsLeft = result ? result.attemptsLeft : test.attemptsLeft;
  const unanswered = countUnanswered(questions, answers);

  const answerOf = (q: TestQuestion): QuestionAnswer =>
    answers[q.id] ?? emptyAnswer(q.config);

  async function submit() {
    setSubmitting(true);
    setError(undefined);
    try {
      // The shuffled order of a sort question that was not touched is an answer too.
      const complete: TestAnswers = {};
      for (const question of questions) {
        complete[question.id] = answerOf(question);
      }
      // Stays enabled in `preview` so creators can try the quiz; preview callers pass a non-writing `submitTest`.
      const submitted = await dataSource.submitTest(
        test.id,
        complete,
        Date.now() - startedAt.current,
      );
      setResult(submitted);
      onSubmitted(submitted);
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  const resultByQuestion = new Map(result?.results.map((r) => [r.questionId, r]));

  if (questions.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {texts.testNoQuestions}
      </p>
    );
  }

  return (
    <form
      className="flex flex-col items-stretch gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (result == null && !outOfAttempts) void submit();
      }}
    >
      {result && (
        <div
          data-test-result={result.submission.passed ? "passed" : "failed"}
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm",
            result.submission.passed
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200",
          )}
        >
          <div role="status" className="flex items-start gap-3">
            {result.submission.passed ? (
              <Check className="mt-0.5 size-5 shrink-0" aria-hidden />
            ) : (
              <X className="mt-0.5 size-5 shrink-0" aria-hidden />
            )}
            <div>
              <p className="text-base font-semibold">
                {result.submission.passed ? texts.testPassed : texts.testFailed}
              </p>
              <p className="tabular-nums">
                {fillTemplate(texts.testScore, {
                  percent: result.submission.scorePercent,
                })}
              </p>
            </div>
          </div>
          {result.submission.passed && onContinue && (
            <Button
              type="button"
              data-test-continue
              className={cn(ACCENT_BUTTON, "min-h-11")}
              onClick={onContinue}
            >
              {courseText(texts, "testContinue")}
              <ArrowRight aria-hidden />
            </Button>
          )}
        </div>
      )}

      <ol>
        {questions.map((question, index) => {
          const questionResult = resultByQuestion.get(question.id);
          const correctText =
            questionResult?.correctAnswer != null
              ? describeAnswer(question, questionResult.correctAnswer)
              : "";
          return (
            <li
              key={question.id}
              className={cn("flex flex-col gap-3 border-t py-5 first:border-t-0 first:pt-0", HAIRLINE)}
              data-question-id={question.id}
            >
              <p className="font-medium break-words">
                <span className={cn("mr-1 tabular-nums", MUTED)}>{index + 1}.</span>
                {question.prompt}
              </p>
              <QuestionEditor
                question={question}
                answer={answerOf(question)}
                disabled={result != null || submitting || outOfAttempts}
                onChange={(answer) =>
                  setAnswers((current) => ({ ...current, [question.id]: answer }))
                }
              />
              {questionResult && (
                <div
                  className={cn(
                    "flex items-start gap-2 text-sm",
                    questionResult.correct
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-red-700 dark:text-red-400",
                  )}
                >
                  {questionResult.correct ? (
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                  ) : (
                    <X className="mt-0.5 size-4 shrink-0" aria-hidden />
                  )}
                  <span>
                    {questionResult.correct ? texts.testCorrect : texts.testIncorrect}
                    {correctText !== "" && !questionResult.correct && (
                      <span className="block text-neutral-700 dark:text-neutral-300">
                        {texts.testCorrectAnswer}: {correctText}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {error != null && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage(error, texts)}
        </p>
      )}

      {result == null ? (
        <div className="flex flex-col items-start gap-2">
          {unanswered > 0 && !outOfAttempts && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {fillTemplate(texts.testUnanswered, { count: unanswered })}
            </p>
          )}
          <Button
            type="submit"
            className={ACCENT_BUTTON}
            disabled={submitting || outOfAttempts}
          >
            {submitting ? texts.testSubmitting : texts.testSubmit}
          </Button>
        </div>
      ) : (
        attemptsLeft !== 0 &&
        !result.submission.passed && (
          <Button type="button" variant="outline" className="self-start" onClick={onTryAgain}>
            {texts.testTryAgain}
          </Button>
        )
      )}
    </form>
  );
}

/** A test: intro, questions, submission and result. */
export function TestPane({
  testId,
  title,
  onSubmitted,
  onContinue,
}: {
  testId: string;
  /** Title from the course structure, shown while the test loads. The owner gives this component a `key` of the test id. */
  title: string;
  /** Called after a submission so the owner can reload the unlocked structure. */
  onSubmitted: (result: TestResult) => void;
  /** Opens the item after the test; offered on the pass banner. */
  onContinue?: () => void;
}) {
  const { dataSource, texts } = useCourseView();
  const track = useCourseTrack();
  const test = useAsyncResource<Test>(
    () => dataSource.getTest(testId),
    [dataSource, testId],
  );
  const history = useAsyncResource<TestSubmissionList | undefined>(
    () => dataSource.listSubmissions(testId).catch(() => undefined),
    [dataSource, testId],
  );
  // A new form (new shuffle, empty answers) after "try again".
  const [formKey, setFormKey] = useState(0);

  return (
    <article data-test-id={testId} className="flex min-w-0 max-w-3xl flex-col gap-6">
      <h2 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">
        {test.status === "success" ? test.data.title : title}
      </h2>

      {test.status === "loading" && <LoadingBlock />}
      {test.status === "error" && (
        <ErrorBox error={test.error} onRetry={test.reload} />
      )}
      {test.status === "success" && (
        <>
          {test.data.description.trim() !== "" && (
            <p className="max-w-[68ch] text-base leading-relaxed break-words whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
              {test.data.description}
            </p>
          )}
          <ul data-test-chips className="flex flex-wrap gap-2">
            <Chip
              title={fillTemplate(texts.testPassThreshold, {
                percent: test.data.passThresholdPercent,
              })}
            >
              {fillTemplate(courseText(texts, "testChipThreshold"), {
                percent: test.data.passThresholdPercent,
              })}
            </Chip>
            <Chip
              title={
                test.data.attemptsLeft == null
                  ? texts.testAttemptsUnlimited
                  : fillTemplate(texts.testAttemptsLeft, {
                      count: test.data.attemptsLeft,
                    })
              }
            >
              {test.data.attemptsLeft == null
                ? courseText(texts, "testChipUnlimited")
                : fillTemplate(courseText(texts, "testChipAttempts"), {
                    count: test.data.attemptsLeft,
                  })}
            </Chip>
            {test.data.gating && (
              <Chip title={texts.testGating}>
                {courseText(texts, "testChipRequired")}
              </Chip>
            )}
            {test.data.attemptCount > 0 && (
              <Chip>
                {fillTemplate(texts.testBestScore, {
                  percent: test.data.bestScorePercent,
                })}
              </Chip>
            )}
          </ul>
          {test.data.gating && (
            <p className={cn("text-sm", MUTED)}>{texts.testGating}</p>
          )}
          {test.data.attemptsLeft != null && test.data.attemptsLeft <= 0 && (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
              {texts.testNoAttemptsLeft}
            </p>
          )}
          <TestForm
            key={formKey}
            test={test.data}
            onSubmitted={(result) => {
              track("test_submitted", {
                lesson_id: testId,
                score_bucket: scoreBucket(result.submission.scorePercent),
              });
              onSubmitted(result);
              history.refresh();
              test.refresh();
            }}
            onTryAgain={() => setFormKey((key) => key + 1)}
            onContinue={onContinue}
          />
          {history.status === "success" && history.data && (
            <SubmissionHistory list={history.data} />
          )}
        </>
      )}
    </article>
  );
}
