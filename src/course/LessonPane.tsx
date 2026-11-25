import {
  ArrowRight,
  Check,
  ChevronLeft,
  Clock,
  Download,
  History,
  Paperclip,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { useCourseTrack } from "./analytics";
import { useCourseView } from "./context";
import {
  fileExtension,
  fillTemplate,
  formatBytes,
  formatDuration,
  isPlaybackComplete,
  resumePosition,
} from "./logic";
import { LessonQuestions, LessonRatingBox } from "./LessonSocial";
import { sanitizeLessonHtml } from "./sanitize";
import { courseText } from "./texts";
import type {
  Course,
  CourseItem,
  ItemRef,
  Lesson,
  ProgressSaved,
} from "./types";
import {
  ACCENT_BORDER,
  ACCENT_BUTTON,
  CARD,
  HAIRLINE,
  MUTED,
  ToggleSwitch,
  errorMessage,
} from "./ui";
import { VideoPlayer, type PlaybackReport } from "./VideoPlayer";

/** Reading typography of the lesson text: a 68ch measure and quiet rules. */
export const PROSE = cn(
  "bitsnap-course-html max-w-[68ch] text-base leading-relaxed break-words text-neutral-800 dark:text-neutral-200",
  "[&>:first-child]:mt-0 [&_p]:my-4 [&_a]:underline [&_a]:underline-offset-2",
  "[&_h1]:mt-10 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight",
  "[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight",
  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1.5 [&_li]:pl-1",
  "[&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-300 [&_blockquote]:pl-4 [&_blockquote]:text-neutral-600 dark:[&_blockquote]:border-neutral-700 dark:[&_blockquote]:text-neutral-300",
  "[&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] dark:[&_code]:bg-neutral-800",
  "[&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-neutral-200 [&_pre]:bg-neutral-50 [&_pre]:p-4 [&_pre]:text-sm dark:[&_pre]:border-neutral-800 dark:[&_pre]:bg-neutral-950 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_hr]:my-8 [&_hr]:border-neutral-200 dark:[&_hr]:border-neutral-800",
  "[&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg",
  "[&_table]:my-6 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:text-sm",
  "[&_th]:border-b [&_th]:border-neutral-200 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold dark:[&_th]:border-neutral-800",
  "[&_td]:border-b [&_td]:border-neutral-200 [&_td]:px-3 [&_td]:py-2 dark:[&_td]:border-neutral-800",
);

type LessonPaneProps = {
  lesson: Lesson;
  nextItem?: CourseItem;
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

type TabId = "content" | "files" | "questions" | "rating";

/**
 * The lesson: video stage, tabs (content, attachments, questions, rating) and
 * a sticky action bar that completes the lesson and moves on in one click.
 * The owner gives it a `key` of the lesson id, so a lesson never reports the
 * progress of another one.
 */
export function LessonPane({
  lesson,
  nextItem,
  position = 0,
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
  const [saveError, setSaveError] = useState<unknown>();
  const [ended, setEnded] = useState(false);
  const [announced, setAnnounced] = useState(false);
  const [questionCount, setQuestionCount] = useState<number>();
  const tabId = useId();
  const [activeTab, setActiveTab] = useState<TabId>("content");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
      setAnnounced(true);
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

  const nextLocked = nextItem?.locked ?? false;
  const canAdvance = next != null && !nextLocked;

  /** Marks the lesson completed, then opens the next unlocked item. */
  async function completeAndContinue() {
    setSaving(true);
    setSaveError(undefined);
    try {
      if (!completedRef.current) {
        await save(
          lastKnownPosition.current,
          lesson.video?.durationSeconds ?? 0,
          true,
        );
      }
    } catch (error) {
      if (!mountedRef.current) return;
      console.warn("Marking the lesson as completed failed", error);
      setSaveError(error);
      setSaving(false);
      return;
    }
    // The learner may have opened another item while the save was in flight.
    if (!mountedRef.current) return;
    setSaving(false);
    if (canAdvance) onNavigate(next);
  }

  const description = lesson.description.trim();
  const hasBody = html !== "" || description !== "";
  const resumeAt = lesson.video
    ? resumePosition(lesson.positionSeconds, lesson.video.durationSeconds)
    : 0;

  const withCount = (label: string, count?: number) =>
    count ? `${label} (${count})` : label;
  const tabs: { id: TabId; label: string }[] = [
    { id: "content", label: texts.descriptionTab ?? texts.contents },
    ...(lesson.attachments.length
      ? [
          {
            id: "files" as const,
            label: withCount(
              texts.filesTab ?? texts.attachments,
              lesson.attachments.length,
            ),
          },
        ]
      : []),
    {
      id: "questions",
      label: withCount(texts.questionsTab ?? texts.questionsTitle, questionCount),
    },
    { id: "rating", label: courseText(texts, "ratingTab") },
  ];
  const selectedTab = tabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : "content";
  const panelProps = (id: TabId) => ({
    id: `${tabId}-panel-${id}`,
    role: "tabpanel" as const,
    "aria-labelledby": `${tabId}-tab-${id}`,
    tabIndex: 0,
    // Every panel stays mounted: the questions count fills the tab label.
    className: cn(
      "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-lg",
      selectedTab !== id && "hidden",
    ),
  });

  const titleId = `lesson-${lesson.id}`;
  const nextLabel =
    next?.kind === "test"
      ? (texts.openNext ?? texts.nextItem)
      : courseText(texts, "nextLesson");

  return (
    <article
      data-lesson-id={lesson.id}
      className="flex min-w-0 flex-col gap-6 pb-[calc(5rem+env(safe-area-inset-bottom)+var(--course-mobile-bottom,0px))] lg:pb-0"
      aria-labelledby={titleId}
    >
      {lesson.video ? (
        <div className="flex flex-col gap-4">
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
            onEnded={() => {
              setEnded(true);
              onEnded();
            }}
            onExpired={onUrlsExpired}
          />
          <div
            data-course-video-bar
            className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <h2
                id={titleId}
                className="text-xl font-semibold tracking-tight break-words sm:text-2xl"
              >
                {lesson.title}
              </h2>
              <p
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums",
                  MUTED,
                )}
              >
                {lesson.video.durationSeconds > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden />
                    {formatDuration(lesson.video.durationSeconds)}
                  </span>
                )}
                {resumeAt > 0 && (
                  <span
                    data-course-resume
                    className="inline-flex items-center gap-1"
                  >
                    <History className="size-3.5" aria-hidden />
                    {fillTemplate(courseText(texts, "resumeFrom"), {
                      time: formatDuration(resumeAt),
                    })}
                  </span>
                )}
                {completed && (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                    <Check className="size-3.5" aria-hidden />
                    {texts.completed}
                  </span>
                )}
              </p>
            </div>
            <ToggleSwitch
              checked={autoplay}
              onChange={onAutoplayChange}
              label={texts.autoplay}
              className={cn("shrink-0", MUTED)}
            />
          </div>
        </div>
      ) : (
        <header className="flex flex-col items-start gap-1">
          <h2
            id={titleId}
            className="max-w-[68ch] text-2xl font-semibold tracking-tight break-words sm:text-3xl"
          >
            {lesson.title}
          </h2>
          {completed && (
            <p className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
              <Check className="size-3.5" aria-hidden />
              {texts.completed}
            </p>
          )}
        </header>
      )}

      <div
        role="tablist"
        aria-label={texts.contents}
        className={cn("flex overflow-x-auto border-b", HAIRLINE)}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${tabId}-tab-${tab.id}`}
            aria-selected={selectedTab === tab.id}
            aria-controls={`${tabId}-panel-${tab.id}`}
            tabIndex={selectedTab === tab.id ? 0 : -1}
            className={cn(
              "-mb-px min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium whitespace-nowrap tabular-nums outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:px-4",
              selectedTab === tab.id
                ? cn(ACCENT_BORDER, "text-neutral-900 dark:text-neutral-50")
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200",
            )}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => {
              const offset =
                event.key === "ArrowRight"
                  ? 1
                  : event.key === "ArrowLeft"
                    ? -1
                    : 0;
              if (!offset && event.key !== "Home" && event.key !== "End")
                return;
              event.preventDefault();
              const target =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : (index + offset + tabs.length) % tabs.length;
              setActiveTab(tabs[target].id);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [target]?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div {...panelProps("content")}>
        <div className="flex flex-col gap-4">
          {description !== "" && (
            <p
              className={cn(
                "max-w-[68ch] text-base leading-relaxed break-words whitespace-pre-wrap",
                "text-neutral-700 dark:text-neutral-300",
              )}
            >
              {description}
            </p>
          )}
          {html !== "" && (
            <div
              className={PROSE}
              // Sanitised by DOMPurify (see sanitize.ts).
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
          {!hasBody && (
            <p className={cn("text-sm", MUTED)}>{texts.noContent}</p>
          )}
        </div>
      </div>

      {lesson.attachments.length > 0 && (
        <div {...panelProps("files")}>
          <section aria-labelledby={`files-${lesson.id}`} className="flex flex-col gap-3">
            <h3
              id={`files-${lesson.id}`}
              className="flex items-center gap-2 text-base font-semibold"
            >
              <Paperclip className="size-4" aria-hidden />
              {texts.attachments}
            </h3>
            <ul className="grid max-w-3xl gap-2 sm:grid-cols-2">
              {lesson.attachments.map((file) => {
                const extension = fileExtension(file.name);
                return (
                  <li key={file.id}>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={file.name}
                      data-course-attachment
                      className={cn(
                        "flex min-h-14 items-center gap-3 rounded-lg border bg-white px-3 py-2.5 text-sm outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-neutral-900 dark:hover:bg-neutral-800/60",
                        HAIRLINE,
                      )}
                    >
                      <span
                        aria-hidden
                        className="flex h-9 w-11 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-[10px] font-semibold tracking-wide text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                      >
                        {extension || <Paperclip className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate font-medium"
                          title={file.name}
                        >
                          {file.name}
                        </span>
                        <span className={cn("block text-xs tabular-nums", MUTED)}>
                          {extension && <span className="sr-only">{extension} · </span>}
                          {formatBytes(file.size)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
                        <span className="hidden sm:inline">{texts.download}</span>
                        <Download className="size-4" aria-hidden />
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}

      <div {...panelProps("questions")}>
        <div className="max-w-3xl">
          <LessonQuestions lessonId={lesson.id} onCount={setQuestionCount} />
        </div>
      </div>

      <div {...panelProps("rating")}>
        <div className="max-w-[68ch]">
          <LessonRatingBox
            lessonId={lesson.id}
            initial={{
              myRating: lesson.myRating,
              averageRating: lesson.averageRating,
              ratingCount: lesson.ratingCount,
            }}
          />
        </div>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="text-sm text-emerald-700 empty:hidden dark:text-emerald-400"
      >
        {announced ? texts.markedComplete : ""}
      </p>

      {nextItem && next && (ended || (completed && nextLocked)) && (
        <section data-course-up-next className={cn(CARD, "flex flex-col items-start gap-3")}>
          <h3 className="font-semibold break-words">
            {fillTemplate(texts.upNext ?? `${texts.nextItem}: {title}`, {
              title: nextItem.title,
            })}
          </h3>
          {nextLocked && (
            <p className={cn("text-sm", MUTED)}>
              {nextItem.lockReason
                ? fillTemplate(texts.lockedByTest, {
                    test: nextItem.lockReason.gatingTestTitle,
                  })
                : texts.locked}
            </p>
          )}
          {nextLocked ? (
            nextItem.lockReason && (
              <Button
                className={cn(ACCENT_BUTTON, "min-h-11 h-auto whitespace-normal")}
                onClick={() =>
                  nextItem.lockReason &&
                  onNavigate({ id: nextItem.lockReason.gatingTestId, kind: "test" })
                }
              >
                {fillTemplate(courseText(texts, "goToTest"), {
                  test: nextItem.lockReason.gatingTestTitle,
                })}
                <ArrowRight aria-hidden />
              </Button>
            )
          ) : (
            <Button
              className={cn(ACCENT_BUTTON, "min-h-11")}
              onClick={() => onNavigate(next)}
            >
              {texts.openNext ?? texts.nextItem}
              <ArrowRight aria-hidden />
            </Button>
          )}
        </section>
      )}

      <nav
        aria-label={texts.lessonNavigation ?? texts.contents}
        data-lesson-navigation="bar"
        className={cn(
          "fixed inset-x-0 bottom-[var(--course-mobile-bottom,0px)] z-40 border-t bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:bg-neutral-900",
          "lg:sticky lg:bottom-0 lg:z-10 lg:mt-4 lg:px-0 lg:py-3",
          HAIRLINE,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11"
            disabled={prev == null}
            onClick={() => prev && onNavigate(prev)}
          >
            <ChevronLeft aria-hidden />
            <span className="sm:hidden">{texts.mobilePrev ?? texts.prevItem}</span>
            <span className="hidden sm:inline">{texts.prevItem}</span>
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            {saveError != null && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {errorMessage(saveError, texts)}
              </p>
            )}
            {completed && (
              <span
                data-course-completed
                className="hidden items-center gap-1 text-sm text-emerald-700 sm:inline-flex dark:text-emerald-400"
              >
                <Check className="size-4" aria-hidden />
                {texts.completed}
              </span>
            )}
            {completed || preview ? (
              <Button
                size="sm"
                data-course-next
                className={cn(ACCENT_BUTTON, "min-h-11 h-auto whitespace-normal")}
                disabled={!canAdvance}
                onClick={() => canAdvance && onNavigate(next)}
              >
                {nextLabel}
                <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button
                size="sm"
                data-course-complete
                className={cn(ACCENT_BUTTON, "min-h-11 h-auto whitespace-normal")}
                disabled={saving}
                onClick={completeAndContinue}
              >
                {canAdvance
                  ? courseText(texts, "completeAndNext")
                  : texts.markComplete}
                {canAdvance && <ArrowRight aria-hidden />}
              </Button>
            )}
          </div>
        </div>
      </nav>
    </article>
  );
}
