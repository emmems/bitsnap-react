import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { cn } from "../../lib/utils";
import type { ChapterWithPublicUrl } from "./AudioPlayer";
import { playerStorage } from "./storage";
import { formatLeft, formatTime, useAudioTexts } from "./texts";

/** Rows shown before "Pokaż wszystkie rozdziały". */
export const COLLAPSED_ROWS = 5;

type Progress = { completed: boolean; position: number };

/**
 * What the device remembers about one chapter (`audio-player/storage.ts`):
 * completed only when it played to the end (`_completed`, set on `ended`),
 * otherwise the saved position.
 */
export function chapterProgress(
  productID: string,
  chapterID: string,
): Progress {
  const prefix = `__player__${productID}_${chapterID}`;
  const position = Number(playerStorage.get(prefix));
  return {
    completed: playerStorage.get(`${prefix}_completed`) === "true",
    position: Number.isFinite(position) && position > 0 ? position : 0,
  };
}

export default function ChapterList({
  chapters,
  currentID,
  productID,
  onSelect,
  downloadable,
  onDownload,
  loading,
  locale,
}: {
  chapters: ChapterWithPublicUrl[] | null;
  currentID?: string;
  productID: string;
  onSelect: (chapter: ChapterWithPublicUrl) => void;
  downloadable?: boolean;
  onDownload?: () => void;
  loading?: boolean;
  locale?: string;
}) {
  const t = useAudioTexts(locale);
  const listId = useId();
  const headingId = useId();
  const [resume, setResume] = useState<{ id: string; time: number } | null>(
    null,
  );
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const prefix = `__player__${productID}_`;
    const id = playerStorage.get(`${prefix}last_chapter`);
    const time = Number(id && playerStorage.get(`${prefix}${id}`));
    setResume(id && time > 0 && Number.isFinite(time) ? { id, time } : null);
    setProgress(
      Object.fromEntries(
        (chapters ?? []).map((chapter) => [
          chapter.id,
          chapterProgress(productID, chapter.id),
        ]),
      ),
    );
  }, [chapters, productID, currentID]);

  const count = chapters?.length ?? 0;
  const resumeIndex =
    chapters?.findIndex((chapter) => chapter.id === resume?.id) ?? -1;
  const currentIndex =
    chapters?.findIndex((chapter) => chapter.id === currentID) ?? -1;
  // The current chapter is always visible, also when the list is folded.
  const visibleCount = expanded
    ? count
    : Math.max(COLLAPSED_ROWS, currentIndex + 1);

  return (
    <section aria-labelledby={headingId} className="flex w-full min-w-0 flex-col gap-3 text-(--panel-fg)">
      {resume && resumeIndex >= 0 && chapters && (
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-(--panel-border) bg-(--panel-surface) px-4 py-2 text-left text-sm hover:bg-(--panel-surface-2) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)"
          onClick={() => onSelect(chapters[resumeIndex])}
        >
          <RefreshCw className="size-4 shrink-0 text-(--panel-muted)" aria-hidden="true" />
          <span className="flex-1">
            {t.resume(resumeIndex + 1, formatTime(resume.time))}
          </span>
          <ChevronRight className="size-4 shrink-0 text-(--panel-muted)" aria-hidden="true" />
        </button>
      )}
      <h3 id={headingId} className="flex items-center gap-2 text-base font-semibold">
        {t.chapters}
        {count > 0 && (
          <span className="rounded-full bg-(--panel-surface-2) px-2 py-0.5 text-xs font-medium text-(--panel-muted)">
            {count}
          </span>
        )}
      </h3>
      {loading ? (
        <div role="status" aria-label={t.loading} className="overflow-hidden rounded-xl border border-(--panel-border) bg-(--panel-surface)">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} aria-hidden="true" className="flex items-center gap-3 border-b border-(--panel-border) px-4 py-4 last:border-b-0">
              <span className="size-4 animate-pulse rounded bg-(--panel-surface-2) motion-reduce:animate-none" />
              <span className="h-3 flex-1 animate-pulse rounded bg-(--panel-surface-2) motion-reduce:animate-none" />
              <span className="h-3 w-10 animate-pulse rounded bg-(--panel-surface-2) motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      ) : !chapters?.length ? (
        <p className="rounded-xl border border-(--panel-border) bg-(--panel-surface) px-4 py-4 text-sm text-(--panel-muted)">
          {t.empty}
        </p>
      ) : (
        <>
          <ul id={listId} className="overflow-hidden rounded-xl border border-(--panel-border) bg-(--panel-surface)">
            {chapters.slice(0, visibleCount).map((chapter, index) => {
              const current = chapter.id === currentID;
              const { completed, position } = progress[chapter.id] ?? {
                completed: false,
                position: 0,
              };
              const partial =
                !completed &&
                !current &&
                position > 0 &&
                !!chapter.duration &&
                position < chapter.duration;
              return (
                <li
                  key={chapter.id}
                  className={cn(
                    "flex min-w-0 items-stretch border-b border-l-4 border-b-(--panel-border) last:border-b-0",
                    current
                      ? "border-l-(--panel-accent-edge-now) bg-[color-mix(in_srgb,var(--panel-accent-now)_12%,var(--panel-surface))]"
                      : "border-l-transparent",
                  )}
                >
                  <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    className="flex min-h-11 min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left hover:bg-(--panel-surface-2)/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--panel-accent-text-now) sm:px-4"
                    onClick={() => onSelect(chapter)}
                  >
                    <span className="mt-0.5 flex w-5 shrink-0 justify-center text-xs font-semibold text-(--panel-muted) tabular-nums">
                      {current ? (
                        <AudioLines className="size-4 text-(--panel-fg)" aria-hidden="true" />
                      ) : completed ? (
                        <Check className="size-4 text-(--panel-ok)" aria-hidden="true" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-start gap-3">
                        <span className="min-w-0 flex-1 text-sm font-semibold break-words">
                          {chapter.name}
                        </span>
                        {!!chapter.duration && (
                          <span className="shrink-0 text-xs text-(--panel-muted) tabular-nums">
                            {formatTime(chapter.duration)}
                          </span>
                        )}
                      </span>
                      {current ? (
                        <span className="text-xs text-(--panel-muted)">{t.playing}</span>
                      ) : completed ? (
                        <span className="text-xs text-(--panel-ok)">{t.played}</span>
                      ) : null}
                      {partial && (
                        <span className="mt-1 flex flex-col gap-1">
                          <span aria-hidden="true" className="block h-1 w-full max-w-52 overflow-hidden rounded-full bg-(--panel-surface-2)">
                            <span
                              className="block h-full rounded-full bg-(--panel-fg)"
                              style={{ width: `${Math.min(100, (position / chapter.duration!) * 100)}%` }}
                            />
                          </span>
                          <span className="text-xs text-(--panel-muted)">
                            {t.chapterLeft(formatLeft(chapter.duration! - position))}
                          </span>
                        </span>
                      )}
                      {current && chapter.description && (
                        <span className="mt-1 text-xs text-(--panel-muted)">
                          {chapter.description}
                        </span>
                      )}
                    </span>
                  </button>
                  {downloadable && chapter.downloadableUrl && (
                    <a
                      href={chapter.downloadableUrl}
                      onClick={onDownload}
                      aria-label={`${t.download} ${index + 1}`}
                      className="inline-flex min-h-11 min-w-11 shrink-0 items-start justify-center pt-3 text-(--panel-muted) hover:text-(--panel-fg) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--panel-accent-text-now)"
                    >
                      <Download className="size-4" aria-hidden="true" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          {count > COLLAPSED_ROWS && (expanded || visibleCount < count) && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-1 text-sm font-semibold text-(--panel-fg) underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)"
            >
              {expanded ? t.showLess : t.showAll(count)}
              <ChevronDown
                aria-hidden="true"
                className={cn("size-4 transition-transform motion-reduce:transition-none", expanded && "rotate-180")}
              />
            </button>
          )}
        </>
      )}
    </section>
  );
}
