import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ChevronLeft, Download } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  UserProductType,
  type UserPanelGetAudiobookDetailsDownloadURLsResponse_AudiobookDownloadDetails,
  type UserProduct,
} from "../../gen/proto/public/v1/public_api_pb";
import { useInstrumentContext } from "../../analytics/instrument";
import { cn } from "../../lib/utils";
import { rpcProvider, useMutation } from "../../rpc-provider";
import { Button } from "../../ui/button";
import AudioPlayer, {
  type AudioPlayerMethods,
} from "../audio-player/AudioPlayer";
import LoadingIndicator from "../LoadingIndicator";

import { getProductTexts } from "./products/texts";

interface PanelProductDetailsProps {
  accessToken: string;
  product: UserProduct;
  styles: CSSProperties;
  reveal: (product?: UserProduct) => void;
  /** Opens the course screen of a course product. */
  onOpenCourse: (accessId: string) => void;
}

function warn(message: string, ...args: unknown[]) {
  console.warn(message, ...args);
}

function error(message: string) {
  console.error(message);
}

const PanelProductDetails = ({
  accessToken,
  product,
  styles,
  reveal,
}: PanelProductDetailsProps) => {
  const t = getProductTexts();
  const productType: UserProductType = product.productType;
  const instrument = useInstrumentContext();
  const trackDownload = () =>
    instrument.track(
      "panel_download",
      {},
      { product_id: product.productId.length <= 64 ? product.productId : null },
    );

  const audioPlayerRef = useRef<AudioPlayerMethods>(null!);
  const [filesRefAnimation] = useAutoAnimate();
  const [fileError, setFileError] = useState(false);
  const [filesResponse, setFilesResponse] = useState<string[] | null>(null);
  const { mutateAsync: fileDetailsAsync, isPending: isFileLoading } =
    useMutation(rpcProvider.publicApi.userPanelGetFileDetails);

  const audioPlayerSeekToHandler = useRef<
    ((second: number) => void) | undefined
  >(undefined);
  const [audioResponse, setAudioResponse] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [audioDownloadURLs, setAudioDownloadURLs] = useState<
    | UserPanelGetAudiobookDetailsDownloadURLsResponse_AudiobookDownloadDetails[]
    | null
  >(null);
  const [
    isAvailableToDownloadInMobileApp,
    setIsAvailableToDownloadInMobileApp,
  ] = useState(false);
  const { mutateAsync: audioDetailsAsync, isPending: isAudioLoading } =
    useMutation(rpcProvider.publicApi.userPanelGetAudiobookDetails);
  const {
    mutateAsync: audioDetailsDownloadURLsAsync,
    isPending: isAudioDownloadURLsLoading,
  } = useMutation(
    rpcProvider.publicApi.userPanelGetAudiobookDetailsDownloadURLs,
  );

  type ChapterWithPublicUrl = {
    id: string;
    multimediaId?: string;
    name: string;
    description?: string;
    publicUrl: string;
    downloadableUrl?: string;
    duration?: number;
  };

  const [selectedChapter, setSelectedChapter] =
    useState<ChapterWithPublicUrl | null>(null);
  const [chapters, setChapters] = useState<ChapterWithPublicUrl[] | null>(null);

  async function handleFileDownload() {
    setFileError(false);
    try {
      const filesResult = await fileDetailsAsync({
        accessId: product.accessId,
        accessToken: accessToken as string,
      });

      if (filesResult.result.case === "success") {
        setFilesResponse(filesResult.result.value.files);
        return;
      } else {
        setFileError(true);
        warn("Pobranie plików nie powiodło się. Zalecamy kontakt.");
        warn("Kod błędu: ", filesResult.result.value);
      }
    } catch (err) {
      setFileError(true);
      warn("Nieoczekiwany błąd. Spróbuj ponownie za chwilę.");
      error("Błąd podczas pobierania danych:" + err);
    }
  }

  async function handleAudioDownload() {
    try {
      const audioResult = await audioDetailsAsync({
        accessId: product.accessId,
        accessToken: accessToken as string,
      });

      if (audioResult.result.case === "audiobook") {
        setAudioResponse(
          audioResult.result.value as unknown as Record<string, unknown>,
        );
        return;
      } else {
        warn("Pobranie plików nie powiodło się. Zalecamy kontakt.");
        warn("Kod błędu: ", audioResult.result.value);
      }
    } catch (err) {
      warn("Nieoczekiwany błąd. Spróbuj ponownie za chwilę.");
      error("Błąd podczas pobierania danych:" + err);
    }
  }

  async function handleAudioURLsDownload() {
    try {
      const audioURLsResult = await audioDetailsDownloadURLsAsync({
        accessId: product.accessId,
        accessToken: accessToken as string,
        isBrowser: true,
      });

      if (audioURLsResult.result.case === "success") {
        setAudioDownloadURLs(
          audioURLsResult.result.value.audiobookDownloadDetails,
        );
        setIsAvailableToDownloadInMobileApp(
          audioURLsResult.result.value.isAvailableToDownloadInMobileApp ===
            true,
        );
        return;
      } else {
        warn("Pobranie plików nie powiodło się. Zalecamy kontakt.");
        warn("Kod błędu: ", audioURLsResult.result.value);
      }
    } catch (err) {
      warn("Nieoczekiwany błąd. Spróbuj ponownie za chwilę.");
      error("Błąd podczas pobierania danych:" + err);
    }
  }

  useEffect(() => {
    if (productType === UserProductType.FILE) void handleFileDownload();
    if (productType === UserProductType.AUDIO) {
      handleAudioDownload().then().catch();
      handleAudioURLsDownload().then().catch();
    }
  }, []);

  useEffect(() => {
    if (audioResponse != null && audioDownloadURLs != null) {
      const audioChapters = (
        audioResponse as { chapters?: ChapterWithPublicUrl[] }
      ).chapters;
      if (!audioChapters) return;

      const mappedChapters = audioChapters
        .map((chapter) => {
          const details = audioDownloadURLs?.find(
            (el) => el.chapterId === chapter.id,
          );
          if (details == null) {
            return undefined;
          }
          return {
            ...chapter,
            publicUrl: details.publicUrl,
            downloadableUrl: details.downloadableUrl,
            duration: details.duration,
          } as ChapterWithPublicUrl;
        })
        .filter((el) => el != null);

      if (mappedChapters != undefined && mappedChapters.length > 0) {
        setChapters(mappedChapters);
      }
    }
  }, [audioResponse, audioDownloadURLs]);

  return (
    <div>
      <div className="mb-3 space-y-4 rounded bg-white p-4 dark:bg-black">
        <Button
          onClick={() => reveal()}
          variant="ghost"
          className="min-h-11 w-fit"
        >
          <ChevronLeft className="h-6 w-6" />
          <span className="font-inter text-sm font-medium">{t.back}</span>
        </Button>
      </div>

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <header className="flex min-w-0 flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900 lg:row-span-2">
          <img
            src={product.productImageUrl}
            alt={product.productName}
            width={384}
            height={384}
            draggable={false}
            className="aspect-square max-h-72 w-full object-contain"
          />
          <h2 className="text-2xl font-semibold">{product.productName}</h2>
        </header>
        <div className="flex min-w-0 flex-col gap-6">
          {productType === UserProductType.FILE && (
            <section
              ref={filesRefAnimation}
              className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <h3 className="text-xl font-semibold">{t.yourFiles}</h3>
              {isFileLoading && (
                <div role="status" aria-label={t.loading}>
                  <LoadingIndicator />
                </div>
              )}
              {fileError && (
                <div role="alert">
                  <p>{t.fileError}</p>
                  <Button className="min-h-11" onClick={handleFileDownload}>
                    {t.retry}
                  </Button>
                </div>
              )}
              {filesResponse?.length === 0 && <p>{t.noFiles}</p>}
              {filesResponse && (
                <ul className="flex flex-col gap-3">
                  {filesResponse.map((url, index) => (
                    <li
                      key={url}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-3"
                    >
                      <span className="min-w-0 break-all text-sm">
                        {downloadFileName(url) || `${t.file} ${index + 1}`}
                      </span>
                      <a
                        target="_blank"
                        rel="noopener noreferrer"
                        href={url}
                        download
                        onClick={trackDownload}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-neutral-100 dark:text-neutral-900"
                        aria-label={`${t.download}: ${downloadFileName(url) || `${t.file} ${index + 1}`}`}
                      >
                        {t.download}
                        <Download className="size-4" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {productType === UserProductType.TICKET && (
            <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
              <h3 className="text-lg font-semibold">{t.ticket}</h3>
              <p className="mt-2 font-medium">{product.productName}</p>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                {t.ticketInfo}
              </p>
            </section>
          )}

          {productType === UserProductType.AUDIO && (
            <>
              <div className="flex flex-col space-y-6 rounded-xl bg-white p-3 drop-shadow-xl dark:bg-neutral-900 dark:drop-shadow-none">
                <h4 className="text-xl font-semibold">
                  {selectedChapter?.name ?? "Odtwarzacz"}
                </h4>
                {selectedChapter?.description && (
                  <p className="text-sm">{selectedChapter?.description}</p>
                )}
                <>
                  {isAudioLoading ? (
                    <div className="flex gap-2">
                      <LoadingIndicator />
                      <p className="text-xl font-semibold">
                        Trwa pobierania audiobooka...
                      </p>
                    </div>
                  ) : (
                    <>
                      {chapters != null ? (
                        <>
                          <AudioPlayer
                            ref={audioPlayerRef}
                            chapters={chapters}
                            title={
                              (audioResponse as { name?: string })?.name ??
                              product.productName ??
                              undefined
                            }
                            imageURL={
                              (audioResponse as { coverImage?: string })
                                ?.coverImage ??
                              product.productImageUrl ??
                              undefined
                            }
                            styles={styles}
                            setCurrentTimeHandler={(handler) => {
                              audioPlayerSeekToHandler.current = handler;
                            }}
                            uniqueProductID={product.productId}
                            onChapterChange={(chapter) => {
                              setSelectedChapter(chapter);
                            }}
                          />
                        </>
                      ) : (
                        <p className="mt-2">
                          Wybierz rozdział, który cię interesuje.
                        </p>
                      )}
                    </>
                  )}
                </>
                <div className="rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800">
                  <p className="mt-3 mb-3 text-xs">
                    {isAvailableToDownloadInMobileApp
                      ? "Możesz słuchać tego audiobooka w aplikacji również bez dostępu do internetu."
                      : "Możesz słuchać tego audiobooka w aplikacji."}
                  </p>
                  <div className="flex gap-3">
                    <a href="https://apps.apple.com/us/app/bitsnap/id6741902807">
                      <img
                        width="100"
                        src="https://bitsnap.pl/appstore.svg"
                        alt="Pobierz aplikacje z  AppStore"
                      />
                    </a>

                    <a href="https://play.google.com/store/apps/details?id=com.bitsnap.Bitsnap">
                      <img
                        width="100"
                        src="https://bitsnap.pl/playstore.svg"
                        alt="Pobierz aplikację z GooglePlay"
                      />
                    </a>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-center rounded-xl bg-white p-3 drop-shadow-xl dark:bg-neutral-900 dark:drop-shadow-none">
            {productType === UserProductType.AUDIO && (
              <div className="max-h-96 w-full overflow-y-auto">
                {isAudioLoading ? (
                  <div className="jusitfy-center flex flex-col items-center gap-2">
                    <LoadingIndicator />
                    <p>Ładowanie rozdziałów...</p>
                  </div>
                ) : (
                  <div>
                    <h2 className="mb-3 text-xl font-semibold">Rozdziały</h2>
                    {chapters == null ? (
                      <p>Brak rozdziałów do wyświetlenia.</p>
                    ) : (
                      <ul className="flex w-full flex-col gap-2">
                        {chapters.map((chapter, index) => (
                          <li
                            key={index}
                            className="flex items-center justify-between"
                          >
                            <button
                              className={cn(
                                "w-full rounded-lg p-2 text-left transition hover:bg-neutral-200 active:bg-neutral-200 dark:hover:bg-neutral-700 dark:active:bg-neutral-700",
                                selectedChapter?.id == chapter.id
                                  ? "bg-neutral-200 dark:bg-neutral-700"
                                  : "bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300",
                              )}
                              onClick={() => {
                                audioPlayerRef.current.selectChapter(chapter);
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">
                                  {chapter.name}
                                </p>
                                {chapter.duration && (
                                  <span className="text-xs text-neutral-500">
                                    {Math.floor(chapter.duration / 60)}:
                                    {String(
                                      Math.floor(chapter.duration % 60),
                                    ).padStart(2, "0")}
                                  </span>
                                )}
                              </div>
                              {chapter.description && (
                                <p className="mt-3 text-xs">
                                  {chapter.description}
                                </p>
                              )}
                            </button>

                            {audioResponse &&
                              (audioResponse as { isDownloadable?: boolean })
                                .isDownloadable &&
                              chapter.downloadableUrl && (
                                <a
                                  href={chapter.downloadableUrl}
                                  onClick={trackDownload}
                                >
                                  <Download width={14} height={14} />
                                </a>
                              )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
          <p className="whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-300">
            {product.productDescription}
          </p>
        </section>
      </main>
    </div>
  );
};

export default PanelProductDetails;

/** File RPC exposes URLs only; no size or filename metadata. */
export function downloadFileName(url: string): string {
  try {
    return decodeURIComponent(
      new URL(url, "https://bitsnap.pl").pathname.split("/").pop() || "",
    );
  } catch {
    return "";
  }
}
