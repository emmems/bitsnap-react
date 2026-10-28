import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import { useRef, useState } from "react";
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
import { ACCENT_BUTTON, CARD, ErrorBox, LoadingBlock, errorMessage } from "./ui";
import { useAsyncResource } from "./useAsyncResource";

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
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
        {multiple ? texts.mcqMultiple : texts.mcqSingle}
      </legend>
      {choices.map((choice) => {
        const checked = answer.selectedIds.includes(choice.id);
        return (
          <label
            key={choice.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800"
          >
            <input
              className="mt-0.5"
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
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
        {texts.todoHint}
      </legend>
      {question.config.steps.map((step) => {
        const checked = answer.checkedIds.includes(step.id);
        return (
          <label
            key={step.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800"
          >
            <input
              className="mt-0.5"
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
    <div className="space-y-2">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {texts.sortHint}
      </p>
      <ol className="space-y-2">
        {answer.orderedIds.map((id, index) => (
          <li
            key={id}
            className="flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800"
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
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{texts.testPreviousAttempts}</h3>
      <ul className="space-y-1 text-sm">
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
};

function TestForm({ test, onSubmitted, onTryAgain }: TestFormProps) {
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
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (result == null && !outOfAttempts) void submit();
      }}
    >
      {result && (
        <div
          role="status"
          className={cn(
            "rounded-xl p-4 text-sm",
            result.submission.passed
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300",
          )}
        >
          <p className="text-base font-semibold">
            {result.submission.passed ? texts.testPassed : texts.testFailed}
          </p>
          <p>
            {fillTemplate(texts.testScore, {
              percent: result.submission.scorePercent,
            })}
          </p>
        </div>
      )}

      <ol className="space-y-6">
        {questions.map((question, index) => {
          const questionResult = resultByQuestion.get(question.id);
          const correctText =
            questionResult?.correctAnswer != null
              ? describeAnswer(question, questionResult.correctAnswer)
              : "";
          return (
            <li key={question.id} className="space-y-3" data-question-id={question.id}>
              <p className="font-medium break-words">
                {index + 1}. {question.prompt}
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
        <div className="space-y-2">
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
          <Button type="button" variant="outline" onClick={onTryAgain}>
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
}: {
  testId: string;
  /** Title from the course structure, shown while the test loads. The owner gives this component a `key` of the test id. */
  title: string;
  /** Called after a submission so the owner can reload the unlocked structure. */
  onSubmitted: (result: TestResult) => void;
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
    <article data-test-id={testId} className={cn(CARD, "min-w-0 space-y-5")}>
      <h2 className="text-2xl font-semibold break-words">
        {test.status === "success" ? test.data.title : title}
      </h2>

      {test.status === "loading" && <LoadingBlock />}
      {test.status === "error" && (
        <ErrorBox error={test.error} onRetry={test.reload} />
      )}
      {test.status === "success" && (
        <>
          {test.data.description.trim() !== "" && (
            <p className="text-sm break-words whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
              {test.data.description}
            </p>
          )}
          <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
            {test.data.gating && <li>{texts.testGating}</li>}
            <li>
              {fillTemplate(texts.testPassThreshold, {
                percent: test.data.passThresholdPercent,
              })}
            </li>
            <li>
              {test.data.attemptsLeft == null
                ? texts.testAttemptsUnlimited
                : fillTemplate(texts.testAttemptsLeft, {
                    count: test.data.attemptsLeft,
                  })}
            </li>
            {test.data.attemptCount > 0 && (
              <li>
                {fillTemplate(texts.testBestScore, {
                  percent: test.data.bestScorePercent,
                })}
              </li>
            )}
          </ul>
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
          />
          {history.status === "success" && history.data && (
            <SubmissionHistory list={history.data} />
          )}
        </>
      )}
    </article>
  );
}
