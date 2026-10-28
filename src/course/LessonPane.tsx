import { ChevronLeft, ChevronRight, Download, Paperclip } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { useCourseTrack } from "./analytics";
import { useCourseView } from "./context";
import { formatBytes, isPlaybackComplete, resumePosition } from "./logic";
import { LessonQuestions, LessonRatingBox } from "./LessonSocial";
import { sanitizeLessonHtml } from "./sanitize";
import type { Course, ItemRef, Lesson, ProgressSaved } from "./types";
import { ACCENT_BUTTON, CARD } from "./ui";
import { VideoPlayer, type PlaybackReport } from "./VideoPlayer";

type LessonPaneProps = {
  lesson: Lesson;
  /** 1-based place of the lesson among the lessons of the course. */
  position?: number;
  courseType: Course["type"];
  /** Previous / next item taken from the course structure. */
  prev?: ItemRef;
  next?: ItemRef;
  autoplay: boolean;
  onAutoplayChange: (value: boolean) => void;
  /** Start playing right away (the viewer came from autoplay). */
  startPlaying: boolean;
  onNavigate: (ref: ItemRef) => void;
  onProgressSaved: (lessonId: string, saved: ProgressSaved) => void;
  onEnded: () => void;
  /** Ask for a fresh lesson (signed URLs expired). */
  onUrlsExpired: () => void;
};

/**
 * The lesson: video, text, attachments, actions, rating and questions. The
 * owner gives it a `key` of the lesson id, so a lesson never reports the
 * progress of another one.
 */
export function LessonPane({
  lesson,
  position = 0,
  courseType,
  prev,
  next,
  autoplay,
  onAutoplayChange,
  startPlaying,
  onNavigate,
  onProgressSaved,
  onEnded,
  onUrlsExpired,
}: LessonPaneProps) {
  const { dataSource, texts, preview } = useCourseView();
  const track = useCourseTrack();
  const [completed, setCompleted] = useState(lesson.completed);
  const completedRef = useRef(lesson.completed);
  const lastSavedPosition = useRef<number | undefined>(undefined);
  const lastKnownPosition = useRef(lesson.positionSeconds);
  const [saving, setSaving] = useState(false);

  // The pane lives as long as one view of the lesson.
  useEffect(() => {
    track("lesson_started", { lesson_id: lesson.id, position });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  // The signed URLs of a long-open lesson expire; refresh them before then.
  const expiresAt = lesson.urlsExpireAt?.getTime();
  useEffect(() => {
    if (expiresAt == null) return;
    const delay = expiresAt - Date.now() - 60_000;
    if (delay <= 0 || delay > 2 ** 31 - 1) return;
    const timer = setTimeout(onUrlsExpired, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  // Sanitised in the browser; the server renders no lesson HTML.
  const html = useMemo(
    () => sanitizeLessonHtml(lesson.contentHtml),
    [lesson.contentHtml],
  );

  async function save(
    positionSeconds: number,
    durationSeconds: number,
    markCompleted: boolean,
  ) {
    if (preview) return;
    const saved = await dataSource.saveProgress({
      lessonId: lesson.id,
      completed: markCompleted,
      positionSeconds,
      durationSeconds,
    });
    lastSavedPosition.current = positionSeconds;
    if (saved.completed && !completedRef.current) {
      completedRef.current = true;
      setCompleted(true);
      track("lesson_completed", { lesson_id: lesson.id, position });
    }
    onProgressSaved(lesson.id, saved);
  }

  function handleReport(report: PlaybackReport) {
    lastKnownPosition.current = report.positionSeconds;
    if (preview) return;
    if (
      report.reason === "periodic" &&
      report.positionSeconds === lastSavedPosition.current
    ) {
      return;
    }
    const reachedEnd =
      report.reason === "ended" ||
      isPlaybackComplete(report.positionSeconds, report.durationSeconds);
    save(
      report.positionSeconds,
      report.durationSeconds,
      reachedEnd && !completedRef.current,
    ).catch((error: unknown) => {
      // Progress is saved again on the next tick; it must not interrupt the video.
      console.warn("Saving the progress of the lesson failed", error);
    });
  }

  async function markComplete() {
    setSaving(true);
    try {
      await save(
        lastKnownPosition.current,
        lesson.video?.durationSeconds ?? 0,
        true,
      );
    } catch (error) {
      console.warn("Marking the lesson as completed failed", error);
    } finally {
      setSaving(false);
    }
  }

  const description = lesson.description.trim();
  const hasBody = html !== "" || description !== "";

  return (
    <article
      data-lesson-id={lesson.id}
      className="min-w-0 space-y-5"
      aria-labelledby={`lesson-${lesson.id}`}
    >
      {lesson.video && (
        <VideoPlayer
          src={lesson.video.hlsUrl}
          poster={lesson.video.posterUrl}
          lessonId={lesson.id}
          startAt={resumePosition(
            lastKnownPosition.current,
            lesson.video.durationSeconds,
          )}
          durationHint={lesson.video.durationSeconds}
          autoPlay={startPlaying}
          onReport={handleReport}
          onEnded={onEnded}
          onExpired={onUrlsExpired}
        />
      )}

      <div className={cn(CARD, "space-y-5")}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <h2
            id={`lesson-${lesson.id}`}
            className="text-2xl font-semibold break-words"
          >
            {lesson.title}
          </h2>
          {!preview && (
            <Button
              size="sm"
              variant={completed ? "outline" : "default"}
              className={cn(!completed && ACCENT_BUTTON)}
              disabled={completed || saving}
              onClick={markComplete}
            >
              {completed ? texts.markedComplete : texts.markComplete}
            </Button>
          )}
        </header>

        {courseType === "video" && lesson.video && (
          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={autoplay}
              onChange={(e) => onAutoplayChange(e.target.checked)}
            />
            {texts.autoplay}
          </label>
        )}

        {description !== "" && (
          <p className="text-sm break-words whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
            {description}
          </p>
        )}

        {html !== "" && (
          <div
            className="bitsnap-course-html break-words [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_img]:h-auto [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-6"
            // Sanitised by DOMPurify (see sanitize.ts).
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}

        {!hasBody && !lesson.video && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {texts.noContent}
          </p>
        )}

        {lesson.attachments.length > 0 && (
          <section aria-labelledby={`files-${lesson.id}`} className="space-y-2">
            <h3
              id={`files-${lesson.id}`}
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <Paperclip className="size-4" aria-hidden />
              {texts.attachments}
            </h3>
            <ul className="space-y-2">
              {lesson.attachments.map((file) => (
                <li key={file.id}>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={file.name}
                    className="flex items-center justify-between gap-3 rounded-lg bg-neutral-100 px-3 py-2 text-sm transition hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                  >
                    <span className="min-w-0 break-words">
                      {file.name}
                      <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                        {formatBytes(file.size)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
                      {texts.download}
                      <Download className="size-3.5" aria-hidden />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav className="flex items-center justify-between gap-3 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={prev == null}
            onClick={() => prev && onNavigate(prev)}
          >
            <ChevronLeft aria-hidden />
            {texts.prevItem}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={next == null}
            onClick={() => next && onNavigate(next)}
          >
            {texts.nextItem}
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      </div>

      <div className={cn(CARD)}>
        <LessonRatingBox
          lessonId={lesson.id}
          initial={{
            myRating: lesson.myRating,
            averageRating: lesson.averageRating,
            ratingCount: lesson.ratingCount,
          }}
        />
      </div>

      <div className={cn(CARD)}>
        <LessonQuestions lessonId={lesson.id} />
      </div>
    </article>
  );
}
