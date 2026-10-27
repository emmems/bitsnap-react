import { useState } from "react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { useCourseView } from "./context";
import { fillTemplate } from "./logic";
import { RatingStars } from "./RatingStars";
import type { LessonQuestion, LessonRating } from "./types";
import { ACCENT_BUTTON, ErrorBox, errorMessage } from "./ui";
import { useAsyncResource } from "./useAsyncResource";

/** Star rating of a lesson with an optional comment. */
export function LessonRatingBox({
  lessonId,
  initial,
}: {
  lessonId: string;
  initial: LessonRating;
}) {
  const { dataSource, texts, preview } = useCourseView();
  const [rating, setRating] = useState(initial);
  const [score, setScore] = useState(initial.myRating);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<unknown>();

  async function save() {
    if (score < 1) return;
    setState("saving");
    try {
      setRating(await dataSource.rate(lessonId, score, comment.trim()));
      setState("saved");
    } catch (e) {
      setError(e);
      setState("error");
    }
  }

  return (
    <section aria-labelledby={`rate-${lessonId}`} className="space-y-3">
      <h3 id={`rate-${lessonId}`} className="text-lg font-semibold">
        {texts.rateTitle}
      </h3>
      <RatingStars
        value={score}
        onSelect={(n) => {
          setScore(n);
          setState("idle");
        }}
        disabled={preview || state === "saving"}
      />
      {rating.ratingCount > 0 && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {fillTemplate(texts.rateAverage, {
            average: rating.averageRating.toFixed(1),
            count: rating.ratingCount,
          })}
        </p>
      )}
      {!preview && score > 0 && (
        <div className="space-y-2">
          <Textarea
            value={comment}
            maxLength={1000}
            placeholder={texts.ratePlaceholder}
            onChange={(e) => {
              setComment(e.target.value);
              setState("idle");
            }}
          />
          <Button
            size="sm"
            className={ACCENT_BUTTON}
            disabled={state === "saving"}
            onClick={save}
          >
            {texts.rateSubmit}
          </Button>
        </div>
      )}
      {state === "saved" && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {texts.rateSaved}
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage(error, texts)}
        </p>
      )}
    </section>
  );
}

function formatDate(date: Date | undefined): string {
  return date == null ? "" : date.toLocaleDateString();
}

/** Questions of the students about a lesson with the ask form. */
export function LessonQuestions({ lessonId }: { lessonId: string }) {
  const { dataSource, texts, preview } = useCourseView();
  const questions = useAsyncResource<LessonQuestion[]>(
    () => dataSource.listQuestions(lessonId),
    [dataSource, lessonId],
  );
  const [content, setContent] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<unknown>();

  async function ask() {
    const text = content.trim();
    if (text === "") return;
    setState("sending");
    try {
      const created = await dataSource.askQuestion(lessonId, text);
      questions.mutate((list) => [created, ...list]);
      setContent("");
      setState("sent");
    } catch (e) {
      setError(e);
      setState("error");
    }
  }

  return (
    <section aria-labelledby={`qa-${lessonId}`} className="space-y-4">
      <h3 id={`qa-${lessonId}`} className="text-lg font-semibold">
        {texts.questionsTitle}
      </h3>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <Textarea
          value={content}
          maxLength={2000}
          placeholder={texts.questionPlaceholder}
          aria-label={texts.questionPlaceholder}
          onChange={(e) => {
            setContent(e.target.value);
            setState("idle");
          }}
        />
        <Button
          type="submit"
          size="sm"
          className={ACCENT_BUTTON}
          disabled={state === "sending" || content.trim() === ""}
        >
          {texts.questionSubmit}
        </Button>
        {state === "sent" && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            {texts.questionSent}
          </p>
        )}
        {state === "error" && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errorMessage(error, texts)}
          </p>
        )}
      </form>

      {questions.status === "loading" && (
        <p role="status" className="text-sm text-neutral-500">
          {texts.loading}
        </p>
      )}
      {questions.status === "error" && (
        <ErrorBox error={questions.error} onRetry={questions.reload} />
      )}
      {questions.status === "success" &&
        (questions.data.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {texts.questionsEmpty}
          </p>
        ) : (
          <ul className="space-y-3">
            {questions.data.map((question) => (
              <li
                key={question.id}
                className="rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800"
              >
                <p className="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {question.isMine ? texts.questionMine : question.authorName}
                  {question.createdAt && ` · ${formatDate(question.createdAt)}`}
                </p>
                <p className="break-words whitespace-pre-wrap">{question.content}</p>
                {question.answer && (
                  <div className="mt-2 border-l-2 border-neutral-400 pl-3 dark:border-neutral-500">
                    <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {texts.questionTeamAnswer}
                      {question.answer.createdAt &&
                        ` · ${formatDate(question.answer.createdAt)}`}
                    </p>
                    <p className="break-words whitespace-pre-wrap">
                      {question.answer.content}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
