import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { useCourseTrack } from "./analytics";
import { useCourseView } from "./context";
import { fillTemplate } from "./logic";
import { courseText } from "./texts";
import { RatingStars } from "./RatingStars";
import type { LessonQuestion, LessonRating } from "./types";
import { ACCENT_BUTTON, ErrorBox, MUTED, errorMessage } from "./ui";
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
  const track = useCourseTrack();
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
      track("lesson_rated", { lesson_id: lessonId, rating: score });
    } catch (e) {
      setError(e);
      setState("error");
    }
  }

  return (
    <section aria-labelledby={`rate-${lessonId}`} className="flex flex-col gap-3">
      <h3 id={`rate-${lessonId}`} className="text-base font-semibold">
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
        <div className="flex flex-col gap-2">
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
            className={cn(ACCENT_BUTTON, "self-start")}
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

/**
 * Questions of the students about a lesson with the ask form. The creator
 * preview shows the questions but cannot send one.
 */
export function LessonQuestions({
  lessonId,
  onCount,
}: {
  lessonId: string;
  /** The number of questions, once they are loaded (for the tab label). */
  onCount?: (count: number) => void;
}) {
  const { dataSource, texts, preview } = useCourseView();
  const questions = useAsyncResource<LessonQuestion[]>(
    () => dataSource.listQuestions(lessonId),
    [dataSource, lessonId],
  );
  const count =
    questions.status === "success" ? questions.data.length : undefined;
  useEffect(() => {
    if (count != null) onCount?.(count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
  const [content, setContent] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<unknown>();

  async function ask() {
    const text = content.trim();
    if (text === "" || preview) return;
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
    <section aria-labelledby={`qa-${lessonId}`} className="flex flex-col gap-4">
      <h3 id={`qa-${lessonId}`} className="text-base font-semibold">
        {texts.questionsTitle}
      </h3>

      {preview && (
        <p
          data-course-preview-note
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {courseText(texts, "previewQuestionsNote")}
        </p>
      )}

      <form
        className="flex flex-col gap-2"
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
          disabled={preview}
          onChange={(e) => {
            setContent(e.target.value);
            setState("idle");
          }}
        />
        <Button
          type="submit"
          size="sm"
          className={cn(ACCENT_BUTTON, "self-start")}
          disabled={preview || state === "sending" || content.trim() === ""}
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
        <p role="status" className={cn("text-sm", MUTED)}>
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
          <ul className="flex flex-col gap-3">
            {questions.data.map((question) => (
              <li
                key={question.id}
                className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800"
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
