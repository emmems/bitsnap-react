import { useEffect, useRef, useState } from "react";
import type { Audiobook } from "../../../../gen/proto/dashboard/v1/audiobooks_pb";
import type {
  UserPanelGetAudiobookDetailsDownloadURLsResponse_AudiobookDownloadDetails as ChapterUrls,
  UserProduct,
} from "../../../../gen/proto/public/v1/public_api_pb";
import { rpcProvider, useMutation } from "../../../../rpc-provider";
import { cn } from "../../../../lib/utils";
import AudioPlayer, {
  type AudioPlayerMethods,
  type ChapterWithPublicUrl,
} from "../../../audio-player/AudioPlayer";
import ChapterList from "../../../audio-player/ChapterList";
import { formatLeft } from "../../../audio-player/texts";
import { Notice, RetryButton, SKELETON_CLASSES } from "../Notice";
import { DescriptionSection, ProductShell } from "../ProductShell";
import type { ProductTexts } from "../texts";
import { useProductLoad, type LoadState } from "../useProductLoad";
import { AppDownloadRow } from "./AppDownloadRow";

type UrlsResult = {
  chapters: ChapterUrls[];
  availableInApp: boolean;
};

/**
 * Chapters of the book that have a playable URL, in book order, and the ids
 * of the ones without (they are not playable, so they are left out and
 * counted).
 */
export function mergeChapters(
  audiobook: Pick<Audiobook, "chapters">,
  urls: ChapterUrls[],
): { chapters: ChapterWithPublicUrl[]; missing: string[] } {
  const byId = new Map(urls.map((entry) => [entry.chapterId, entry]));
  const chapters: ChapterWithPublicUrl[] = [];
  const missing: string[] = [];
  for (const chapter of audiobook.chapters) {
    const details = byId.get(chapter.id);
    if (details == null || !details.publicUrl) {
      missing.push(chapter.id);
      continue;
    }
    chapters.push({
      id: chapter.id,
      multimediaId: chapter.multimediaId,
      name: chapter.name,
      description: chapter.description,
      publicUrl: details.publicUrl,
      downloadableUrl: details.downloadableUrl,
      duration: details.duration,
    });
  }
  return { chapters, missing };
}

/** The value of a load, also while a `keep` reload runs. */
function valueOf<T>(state: LoadState<T>): T | undefined {
  return state.status === "ok" || state.status === "loading"
    ? state.value
    : undefined;
}

/**
 * Audiobook page, option A "Kompaktowy odtwarzacz": the player card, the
 * chapter list, and in the cover column the description and the app row.
 * A failed load shows an error with a retry (not "pick a chapter"); chapters
 * without a URL are counted in a warning.
 */
export function AudiobookDetails({
  product,
  accessToken,
  texts,
  onBack,
  onDownload,
}: {
  product: UserProduct;
  accessToken: string;
  texts: ProductTexts;
  onBack: () => void;
  onDownload: () => void;
}) {
  const accessId = product.accessId;
  const { mutateAsync: detailsAsync } = useMutation(
    rpcProvider.publicApi.userPanelGetAudiobookDetails,
  );
  const { mutateAsync: urlsAsync } = useMutation(
    rpcProvider.publicApi.userPanelGetAudiobookDetailsDownloadURLs,
  );
  const [details, reloadDetails] = useProductLoad(async () => {
    const response = await detailsAsync({ accessId, accessToken });
    return response.result.case === "audiobook"
      ? { ok: true as const, value: response.result.value }
      : { ok: false as const, failure: response.result.value! };
  }, accessId);
  const [urls, reloadUrls] = useProductLoad<UrlsResult>(async () => {
    const response = await urlsAsync({ accessId, accessToken, isBrowser: true });
    return response.result.case === "success"
      ? {
          ok: true as const,
          value: {
            chapters: response.result.value.audiobookDownloadDetails,
            availableInApp:
              response.result.value.isAvailableToDownloadInMobileApp === true,
          },
        }
      : { ok: false as const, failure: response.result.value! };
  }, accessId);

  const audiobook = valueOf(details);
  const urlsValue = valueOf(urls);
  const merged =
    audiobook && urlsValue ? mergeChapters(audiobook, urlsValue.chapters) : undefined;
  const failed =
    details.status === "error" ||
    details.status === "failure" ||
    urls.status === "error" ||
    urls.status === "failure";
  const loading = !failed && merged == null;

  const missingKey = merged?.missing.join(",") ?? "";
  useEffect(() => {
    if (missingKey) {
      console.warn("[bitsnap panel] audiobook chapters without a URL:", missingKey);
    }
  }, [missingKey]);

  const playerRef = useRef<AudioPlayerMethods>(null);
  const [currentChapter, setCurrentChapter] = useState<string>();

  function retryAll() {
    if (details.status !== "ok") reloadDetails();
    if (urls.status !== "ok") reloadUrls();
  }

  const chapters = merged?.chapters ?? [];
  const totalKnown =
    chapters.length > 0 && chapters.every((chapter) => (chapter.duration ?? 0) > 0);
  const total = chapters.reduce((sum, chapter) => sum + (chapter.duration ?? 0), 0);
  const meta = merged
    ? [texts.chaptersCount(chapters.length), totalKnown ? formatLeft(total) : null]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  const description =
    product.productDescription.trim() || audiobook?.description || "";

  return (
    <ProductShell
      title={product.productName || audiobook?.name || ""}
      imageUrl={product.productImageUrl || audiobook?.coverImage || undefined}
      meta={meta}
      onBack={onBack}
      texts={texts}
      aside={
        <>
          <DescriptionSection heading={texts.aboutProduct} text={description} />
          <AppDownloadRow offline={urlsValue?.availableInApp === true} texts={texts} />
        </>
      }
    >
      {failed ? (
        <Notice
          role="alert"
          tone="danger"
          title={texts.audioLoadError}
          description={texts.audioLoadErrorHelp}
          action={<RetryButton onClick={retryAll}>{texts.retry}</RetryButton>}
        />
      ) : loading ? (
        <PlayerSkeleton label={texts.audioLoading} />
      ) : (
        <>
          {merged!.missing.length > 0 && (
            <Notice
              role="status"
              tone="warn"
              title={texts.audioMissingChapters(merged!.missing.length)}
              action={
                <RetryButton onClick={() => reloadUrls({ keep: true })}>
                  {texts.retry}
                </RetryButton>
              }
            />
          )}
          {chapters.length === 0 ? (
            merged!.missing.length === 0 && (
              <Notice tone="info" title={texts.audioNoChapters} />
            )
          ) : (
            <>
              <div className="rounded-xl border border-(--panel-border) bg-(--panel-surface) px-3 py-4 sm:p-5">
                <AudioPlayer
                  ref={playerRef}
                  coverShownBeside
                  chapters={chapters}
                  title={audiobook?.name || product.productName || undefined}
                  imageURL={audiobook?.coverImage || product.productImageUrl || undefined}
                  uniqueProductID={product.productId}
                  onExpiredUrl={() => reloadUrls({ keep: true })}
                  onChapterChange={(chapter) => setCurrentChapter(chapter.id)}
                />
              </div>
              <ChapterList
                chapters={chapters}
                currentID={currentChapter}
                productID={product.productId}
                downloadable={audiobook?.isDownloadable === true}
                onDownload={onDownload}
                onSelect={(chapter) => playerRef.current?.selectChapter(chapter)}
              />
            </>
          )}
        </>
      )}
    </ProductShell>
  );
}

function PlayerSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-5">
      <div aria-hidden="true" className="flex flex-col gap-5 rounded-xl border border-(--panel-border) bg-(--panel-surface) p-4 sm:p-5">
        <span className={cn(SKELETON_CLASSES, "h-4 w-1/3")} />
        <span className={cn(SKELETON_CLASSES, "h-1.5 w-full")} />
        <span className="flex items-center justify-center gap-4">
          <span className={cn(SKELETON_CLASSES, "size-12 rounded-full")} />
          <span className={cn(SKELETON_CLASSES, "size-16 rounded-full")} />
          <span className={cn(SKELETON_CLASSES, "size-12 rounded-full")} />
        </span>
      </div>
      <div aria-hidden="true" className="overflow-hidden rounded-xl border border-(--panel-border) bg-(--panel-surface)">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 border-b border-(--panel-border) px-4 py-4 last:border-b-0">
            <span className={cn(SKELETON_CLASSES, "h-3 flex-1")} />
            <span className={cn(SKELETON_CLASSES, "h-3 w-10")} />
          </div>
        ))}
      </div>
    </div>
  );
}
