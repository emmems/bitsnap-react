import {
  CheckCircle2,
  ClipboardCheck,
  Lock,
  PlayCircle,
  FileText,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { useCourseView } from "./context";
import { fillTemplate, formatDuration } from "./logic";
import type { Course, CourseItem } from "./types";

type CourseOutlineProps = {
  course: Course;
  selectedId?: string;
  onSelect: (item: CourseItem) => void;
  /**
   * `playlist` (video courses) shows the thumbnail and duration of every
   * video; `modules` (standard courses) is a plain list of lessons.
   */
  variant: "modules" | "playlist";
  className?: string;
};

function ItemIcon({ item }: { item: CourseItem }) {
  if (item.locked) {
    return <Lock className="size-4 text-neutral-500" aria-hidden />;
  }
  if (item.completed) {
    return (
      <CheckCircle2
        className="size-4 text-emerald-600 dark:text-emerald-400"
        aria-hidden
      />
    );
  }
  if (item.kind === "test") {
    return <ClipboardCheck className="size-4 text-neutral-500" aria-hidden />;
  }
  return item.durationSeconds > 0 ? (
    <PlayCircle className="size-4 text-neutral-500" aria-hidden />
  ) : (
    <FileText className="size-4 text-neutral-500" aria-hidden />
  );
}

function OutlineItem({
  item,
  selected,
  variant,
  onSelect,
}: {
  item: CourseItem;
  selected: boolean;
  variant: "modules" | "playlist";
  onSelect: (item: CourseItem) => void;
}) {
  const { texts } = useCourseView();
  const lockText = item.lockReason
    ? fillTemplate(texts.lockedByTest, {
        test: item.lockReason.gatingTestTitle,
      })
    : texts.locked;
  const state = item.locked
    ? lockText
    : item.completed
      ? texts.completed
      : undefined;

  return (
    <li>
      <button
        type="button"
        data-item-id={item.id}
        data-locked={item.locked || undefined}
        aria-current={selected ? "true" : undefined}
        aria-disabled={item.locked || undefined}
        title={item.locked ? lockText : undefined}
        onClick={() => {
          if (!item.locked) onSelect(item);
        }}
        className={cn(
          "flex min-h-11 w-full items-start gap-3 rounded-lg p-2 text-left text-sm outline-none transition focus-visible:ring-[3px] focus-visible:ring-ring/50",
          selected
            ? "bg-neutral-200 dark:bg-neutral-700"
            : "hover:bg-neutral-100 dark:hover:bg-neutral-800",
          item.locked &&
            "cursor-not-allowed opacity-60 hover:bg-transparent dark:hover:bg-transparent",
        )}
      >
        {variant === "playlist" && item.kind === "lesson" && (
          <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
            {item.thumbnailUrl && (
              <img
                src={item.thumbnailUrl}
                alt=""
                loading="lazy"
                draggable={false}
                className="size-full object-cover"
              />
            )}
            {item.durationSeconds > 0 && (
              <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[10px] text-white">
                {formatDuration(item.durationSeconds)}
              </span>
            )}
          </span>
        )}
        {(variant === "modules" || item.kind === "test") && (
          <span className="mt-0.5 shrink-0">
            <ItemIcon item={item} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium break-words">{item.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-neutral-500 dark:text-neutral-400">
            {item.kind === "test" && <span>{texts.testBadge}</span>}
            {item.isFree && !item.locked && <span>{texts.free}</span>}
            {variant === "modules" && item.durationSeconds > 0 && (
              <span>{formatDuration(item.durationSeconds)}</span>
            )}
            {state && <span>{state}</span>}
          </span>
        </span>
        {variant === "playlist" && item.kind === "lesson" && (
          <span className="mt-0.5 shrink-0">
            <ItemIcon item={item} />
          </span>
        )}
      </button>
    </li>
  );
}

/** Modules / sections with their lessons and tests. */
export function CourseOutline({
  course,
  selectedId,
  onSelect,
  variant,
  className,
}: CourseOutlineProps) {
  const { texts } = useCourseView();
  const outlineId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const currentSection = course.sections.find((section) =>
    section.items.some((item) => item.id === selectedId),
  )?.id;
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(currentSection ? [currentSection] : []),
  );
  useEffect(() => {
    if (currentSection)
      setOpenSections((current) => new Set([...current, currentSection]));
  }, [currentSection]);
  useEffect(() => {
    const selected =
      rootRef.current?.querySelector<HTMLElement>("[aria-current]");
    if (selected && !selected.closest("[hidden]"))
      selected.scrollIntoView?.({ block: "nearest" });
  }, [selectedId, openSections]);

  const renderItems = (items: CourseItem[]) => (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <OutlineItem
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          variant={variant}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );

  return (
    <nav
      ref={rootRef}
      aria-label={texts.contents}
      className={cn("space-y-4", className)}
    >
      {course.sections.map((section) => {
        const lessons = section.items.filter((i) => i.kind === "lesson");
        const done = lessons.filter((i) => i.completed).length;
        return (
          <section key={section.id} data-section-id={section.id}>
            <h3 className="mb-1 text-sm font-semibold">
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left focus-visible:outline focus-visible:outline-2"
                aria-expanded={openSections.has(section.id)}
                aria-controls={`${outlineId}-${section.id}`}
                onClick={() =>
                  setOpenSections((current) => {
                    const next = new Set(current);
                    if (next.has(section.id)) next.delete(section.id);
                    else next.add(section.id);
                    return next;
                  })
                }
              >
                <span className="break-words">{section.title}</span>
                {lessons.length > 0 && (
                  <span className="shrink-0 text-xs font-normal text-neutral-500 dark:text-neutral-400">
                    {done}/{lessons.length}
                  </span>
                )}
              </button>
            </h3>
            <div
              id={`${outlineId}-${section.id}`}
              hidden={!openSections.has(section.id)}
            >
              {renderItems(section.items)}
            </div>
          </section>
        );
      })}
      {course.finalItems.length > 0 && (
        <section data-section-id="final">
          {renderItems(course.finalItems)}
        </section>
      )}
    </nav>
  );
}
