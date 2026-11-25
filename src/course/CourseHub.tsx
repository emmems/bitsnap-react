import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Lock,
  PlayCircle,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { useCourseView } from "./context";
import {
  fillTemplate,
  findItem,
  flattenItems,
  formatDuration,
  type FlatItem,
} from "./logic";
import { courseText } from "./texts";
import type { Course, CourseItem } from "./types";
import {
  ACCENT_BUTTON,
  ACCENT_WASH,
  HAIRLINE,
  MUTED,
  ProgressBar,
  SURFACE,
} from "./ui";

type CourseHubProps = {
  course: Course;
  /** The item open before the overview, highlighted in the list. */
  currentId?: string;
  onOpen: (itemId: string) => void;
};

/** Where the "continue" button of the overview leads, and how it reads. */
export function hubTarget(course: Course): {
  item?: FlatItem;
  mode: "start" | "continue" | "restart";
} {
  const items = flattenItems(course);
  const open = items.filter((item) => !item.locked);
  if (course.totalLessons > 0 && course.progressPercent >= 100) {
    return { item: open[0], mode: "restart" };
  }
  const resume = findItem(course, course.resumeItemId);
  const item =
    resume && !resume.locked
      ? resume
      : (open.find((entry) => !entry.completed) ?? open[0]);
  return {
    item,
    mode: course.completedLessons > 0 ? "continue" : "start",
  };
}

function HubItem({
  item,
  current,
  onOpen,
}: {
  item: CourseItem;
  current: boolean;
  onOpen: (itemId: string) => void;
}) {
  const { texts } = useCourseView();
  const lockText = item.lockReason
    ? fillTemplate(texts.lockedByTest, { test: item.lockReason.gatingTestTitle })
    : texts.locked;
  const Icon = item.locked
    ? Lock
    : item.completed
      ? CheckCircle2
      : item.kind === "test"
        ? ClipboardCheck
        : item.durationSeconds > 0
          ? PlayCircle
          : FileText;
  return (
    <li>
      <button
        type="button"
        data-hub-item-id={item.id}
        data-locked={item.locked || undefined}
        title={item.locked ? lockText : undefined}
        aria-disabled={item.locked || undefined}
        aria-current={current ? "true" : undefined}
        onClick={() => !item.locked && onOpen(item.id)}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
          current ? ACCENT_WASH : "hover:bg-neutral-100 dark:hover:bg-neutral-800/70",
          item.locked &&
            "cursor-not-allowed opacity-60 hover:bg-transparent dark:hover:bg-transparent",
        )}
      >
        {item.thumbnailUrl && item.kind === "lesson" ? (
          <span className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-md bg-neutral-200 dark:bg-neutral-800">
            <img
              src={item.thumbnailUrl}
              alt=""
              loading="lazy"
              draggable={false}
              className="size-full object-cover"
            />
          </span>
        ) : (
          <Icon
            aria-hidden
            className={cn(
              "size-4 shrink-0",
              item.completed && !item.locked
                ? "text-emerald-600 dark:text-emerald-400"
                : MUTED,
            )}
          />
        )}
        <span className="min-w-0 flex-1 break-words">{item.title}</span>
        <span
          className={cn(
            "flex shrink-0 items-center gap-2 text-xs tabular-nums",
            MUTED,
          )}
        >
          {item.kind === "test" && <span>{texts.testBadge}</span>}
          {item.isFree && !item.locked && <span>{texts.free}</span>}
          {item.locked && <span data-hub-lock-text>{lockText}</span>}
          {item.durationSeconds > 0 && (
            <span>{formatDuration(item.durationSeconds)}</span>
          )}
          {item.thumbnailUrl && item.completed && !item.locked && (
            <CheckCircle2
              className="size-4 text-emerald-600 dark:text-emerald-400"
              aria-label={texts.completed}
            />
          )}
        </span>
      </button>
    </li>
  );
}

/** The note over a module the learner cannot open yet, with a way to unlock it. */
function LockedBanner({
  items,
  onOpen,
}: {
  items: CourseItem[];
  onOpen: (itemId: string) => void;
}) {
  const { texts } = useCourseView();
  const reason = items.find((item) => item.locked && item.lockReason)?.lockReason;
  return (
    <div
      data-hub-locked-banner
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
        HAIRLINE,
      )}
    >
      <span className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
        <Lock className="size-4 shrink-0" aria-hidden />
        {reason
          ? fillTemplate(texts.lockedByTest, { test: reason.gatingTestTitle })
          : texts.locked}
      </span>
      {reason && (
        <Button
          size="sm"
          variant="outline"
          data-hub-solve-test={reason.gatingTestId}
          className="min-h-11"
          onClick={() => onOpen(reason.gatingTestId)}
        >
          {courseText(texts, "hubSolveTest")}
          <ArrowRight aria-hidden />
        </Button>
      )}
    </div>
  );
}

/**
 * The overview of a course: a hero with the cover, description, progress and
 * one button to carry on, then the modules as a ruled list.
 */
export function CourseHub({ course, currentId, onOpen }: CourseHubProps) {
  const { texts } = useCourseView();
  const target = hubTarget(course);
  const ctaLabel =
    target.mode === "restart"
      ? courseText(texts, "hubRestart")
      : target.mode === "continue" && target.item
        ? fillTemplate(courseText(texts, "hubContinue"), {
            title: target.item.title,
          })
        : courseText(texts, "hubStart");
  const description = course.description.trim();

  return (
    <div data-course-hub className="flex flex-col gap-10">
      <section className="grid items-center gap-6 md:grid-cols-2 md:gap-10">
        <div
          className={cn(
            SURFACE,
            "relative aspect-video overflow-hidden",
            !course.coverUrl && "bg-neutral-100 dark:bg-neutral-900",
          )}
        >
          {course.coverUrl ? (
            <img
              data-course-cover
              src={course.coverUrl}
              alt=""
              draggable={false}
              className="size-full object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex size-full items-end bg-neutral-100 p-6 sm:p-8 dark:bg-neutral-900"
            >
              <span className="line-clamp-3 text-2xl font-semibold tracking-tight text-neutral-800 sm:text-3xl dark:text-neutral-100">
                {course.title}
              </span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <h2 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">
            {course.title}
          </h2>
          {description !== "" && (
            <p
              data-course-description
              className="max-w-[68ch] text-base leading-relaxed break-words whitespace-pre-wrap text-neutral-700 dark:text-neutral-300"
            >
              {description}
            </p>
          )}
          <div className="mt-2 flex max-w-sm flex-col gap-2">
            <ProgressBar
              percent={course.progressPercent}
              label={fillTemplate(texts.progressPercent, {
                percent: course.progressPercent,
              })}
            />
            <p className={cn("text-xs tabular-nums", MUTED)}>
              {fillTemplate(texts.progressLessons, {
                done: course.completedLessons,
                total: course.totalLessons,
              })}
              {" · "}
              {fillTemplate(texts.progressPercent, {
                percent: course.progressPercent,
              })}
            </p>
          </div>
          {target.item && (
            <Button
              data-course-hub-cta
              className={cn(ACCENT_BUTTON, "mt-2 min-h-11 h-auto max-w-full self-start whitespace-normal text-left")}
              onClick={() => target.item && onOpen(target.item.id)}
            >
              <span className="min-w-0 break-words">{ctaLabel}</span>
              <ArrowRight aria-hidden />
            </Button>
          )}
        </div>
      </section>

      <ol
        className={cn(
          "border-y",
          HAIRLINE,
        )}
      >
        {course.sections.map((section, index) => {
          const lessons = section.items.filter((item) => item.kind === "lesson");
          const done = lessons.filter((item) => item.completed).length;
          const locked = section.items.some((item) => item.locked);
          return (
            <li
              key={section.id}
              data-hub-section-id={section.id}
              data-locked={locked || undefined}
              className={cn(
                "grid gap-4 border-t py-8 first:border-t-0 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:gap-10",
                HAIRLINE,
              )}
            >
              <div className="flex min-w-0 flex-col gap-2">
                <p className={cn("text-xs font-medium tabular-nums", MUTED)}>
                  {fillTemplate(courseText(texts, "hubModule"), { n: index + 1 })}
                </p>
                <h3 className="text-lg font-semibold break-words">
                  {section.title}
                </h3>
                {section.description.trim() !== "" && (
                  <p className="max-w-[68ch] text-sm leading-relaxed break-words whitespace-pre-wrap text-neutral-600 dark:text-neutral-400">
                    {section.description}
                  </p>
                )}
                {lessons.length > 0 && (
                  <div className="mt-2 flex max-w-48 flex-col gap-1.5">
                    <ProgressBar
                      className="h-1"
                      percent={(done / lessons.length) * 100}
                      label={fillTemplate(courseText(texts, "hubModuleProgress"), {
                        done,
                        total: lessons.length,
                      })}
                    />
                    <p className={cn("text-xs tabular-nums", MUTED)}>
                      {fillTemplate(courseText(texts, "hubModuleProgress"), {
                        done,
                        total: lessons.length,
                      })}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-3">
                {locked && (
                  <LockedBanner items={section.items} onOpen={onOpen} />
                )}
                <ul className="flex flex-col gap-0.5">
                  {section.items.map((item) => (
                    <HubItem
                      key={item.id}
                      item={item}
                      current={item.id === currentId}
                      onOpen={onOpen}
                    />
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
        {course.finalItems.length > 0 && (
          <li
            data-hub-section-id="final"
            className={cn(
              "grid gap-4 border-t py-8 first:border-t-0 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:gap-10",
              HAIRLINE,
            )}
          >
            <h3 className="text-lg font-semibold">
              {courseText(texts, "hubFinal")}
            </h3>
            <div className="flex min-w-0 flex-col gap-3">
              {course.finalItems.some((item) => item.locked) && (
                <LockedBanner items={course.finalItems} onOpen={onOpen} />
              )}
              <ul className="flex flex-col gap-0.5">
                {course.finalItems.map((item) => (
                  <HubItem
                    key={item.id}
                    item={item}
                    current={item.id === currentId}
                    onOpen={onOpen}
                  />
                ))}
              </ul>
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}
