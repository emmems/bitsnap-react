import { Check, Download, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChapterWithPublicUrl } from "./AudioPlayer";
import { playerStorage } from "./storage";
import { formatTime, useAudioTexts } from "./texts";

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
  const [resume, setResume] = useState<{ id: string; time: number } | null>(
    null,
  );
  const [played, setPlayed] = useState<string[]>([]);
  useEffect(() => {
    const prefix = `__player__${productID}_`;
    const id = playerStorage.get(`${prefix}last_chapter`);
    const time = Number(id && playerStorage.get(`${prefix}${id}`));
    setResume(id && time > 0 && Number.isFinite(time) ? { id, time } : null);
    setPlayed(
      (chapters ?? [])
        .filter(
          (chapter) =>
            playerStorage.get(`${prefix}${chapter.id}_completed`) === "true" ||
            Number(playerStorage.get(`${prefix}${chapter.id}`)) > 0,
        )
        .map((chapter) => chapter.id),
    );
  }, [chapters, productID, currentID]);
  const resumeIndex =
    chapters?.findIndex((chapter) => chapter.id === resume?.id) ?? -1;
  const currentIndex =
    chapters?.findIndex((chapter) => chapter.id === currentID) ?? -1;
  return (
    <div className="max-h-96 w-full overflow-y-auto">
      <h2 className="mb-3 text-xl font-semibold">{t.chapters}</h2>
      {loading ? (
        <p role="status">{t.loading}</p>
      ) : !chapters?.length ? (
        <p>{t.empty}</p>
      ) : (
        <>
          {resume && resumeIndex >= 0 && (
            <button
              type="button"
              className="mb-3 min-h-11 rounded-lg border border-neutral-300 px-3 py-2 text-left dark:border-neutral-600"
              onClick={() => onSelect(chapters[resumeIndex])}
            >
              {t.resume}: {t.chapterName} {resumeIndex + 1},{" "}
              {formatTime(resume.time)}
            </button>
          )}
          <ul className="flex w-full flex-col gap-2">
            {chapters.map((chapter, index) => {
              const current = chapter.id === currentID;
              const isPlayed =
                index < currentIndex || played.includes(chapter.id);
              return (
                <li
                  key={chapter.id}
                  className="flex min-w-0 items-center gap-2"
                >
                  <button
                    type="button"
                    aria-current={current ? "true" : undefined}
                    className={`min-h-11 min-w-0 flex-1 rounded-lg p-3 text-left hover:bg-neutral-200 dark:hover:bg-neutral-700 ${current ? "bg-neutral-200 dark:bg-neutral-700" : "bg-neutral-100 dark:bg-neutral-800"}`}
                    onClick={() => onSelect(chapter)}
                  >
                    <span className="flex items-center gap-2">
                      {current ? (
                        <Play
                          className="size-4 shrink-0"
                          aria-label={t.playing}
                        />
                      ) : isPlayed ? (
                        <Check
                          className="size-4 shrink-0"
                          aria-label={t.played}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 break-words text-sm font-medium">
                        {chapter.name}
                      </span>
                      {!!chapter.duration && (
                        <span className="shrink-0 text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
                          {formatTime(chapter.duration)}
                        </span>
                      )}
                    </span>
                    {chapter.description && (
                      <span className="mt-2 block text-xs">
                        {chapter.description}
                      </span>
                    )}
                  </button>
                  {downloadable && chapter.downloadableUrl && (
                    <a
                      href={chapter.downloadableUrl}
                      onClick={onDownload}
                      aria-label={`${t.download} ${index + 1}`}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <Download className="size-4" aria-hidden="true" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
