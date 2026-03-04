import { Button } from "../../ui/button";
import { cn } from "../../lib/utils";
import {
  UserProductType,
  type UserProduct,
  type UserPanelGetAudiobookDetailsDownloadURLsResponse_AudiobookDownloadDetails,
} from "../../gen/proto/public/v1/public_api_pb";
import { rpcProvider, useMutation } from "../../rpc-provider";
import AudioPlayer, {
  type AudioPlayerMethods,
} from "../audio-player/AudioPlayer";
import LoadingIndicator from "../LoadingIndicator";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ChevronLeft, Download } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { ProgressBar } from "./ProgressBar";

interface PanelProductDetailsProps {
  accessToken: string;
  product: UserProduct;
  styles: CSSProperties;
  reveal: (product?: UserProduct) => void;
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
  const productType: UserProductType = product.productType;

  const audioPlayerRef = useRef<AudioPlayerMethods>(null!);
  const [filesRefAnimation] = useAutoAnimate();
  const [filesResponse, setFilesResponse] = useState<string[] | null>(null);
  const { mutateAsync: fileDetailsAsync, isPending: isFileLoading } =
    useMutation(rpcProvider.publicApi.userPanelGetFileDetails);

  const audioPlayerSeekToHandler = useRef<
    ((second: number) => void) | undefined
  >(undefined);
  const [audioResponse, setAudioResponse] = useState<Record<string, unknown> | null>(null);
  const [audioDownloadURLs, setAudioDownloadURLs] = useState<
    UserPanelGetAudiobookDetailsDownloadURLsResponse_AudiobookDownloadDetails[]
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
  };

  const [selectedChapter, setSelectedChapter] =
    useState<ChapterWithPublicUrl | null>(null);
  const [chapters, setChapters] = useState<ChapterWithPublicUrl[] | null>(null);

  async function handleFileDownload() {
    try {
      const filesResult = await fileDetailsAsync({
        accessId: product.accessId,
        accessToken: accessToken as string,
      });

      if (filesResult.result.case === "success") {
        setFilesResponse(filesResult.result.value.files);
        return;
      } else {
        warn("Pobranie plików nie powiodło się. Zalecamy kontakt.");
        warn("Kod błędu: ", filesResult.result.value);
      }
    } catch (err) {
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
        setAudioResponse(audioResult.result.value as unknown as Record<string, unknown>);
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
    if (productType === UserProductType.AUDIO) {
      handleAudioDownload().then().catch();
      handleAudioURLsDownload().then().catch();
    }
  }, []);

  useEffect(() => {
    if (audioResponse != null && audioDownloadURLs != null) {
      const audioChapters = (audioResponse as { chapters?: ChapterWithPublicUrl[] }).chapters;
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
        <Button onClick={() => reveal()} variant="ghost" className="w-fit">
          <ChevronLeft className="h-6 w-6" />
          <span className="font-inter text-sm font-medium">Wróć</span>
        </Button>
      </div>

      <main className="grid grid-cols-1 justify-center gap-6 sm:justify-start lg:grid-cols-2">
        <div className="flex w-full max-w-xl flex-col gap-6">
          {productType === UserProductType.FILE && (
            <div
              ref={filesRefAnimation}
              className="flex flex-col space-y-4 rounded bg-white p-6 drop-shadow-xl dark:border dark:border-neutral-700 dark:bg-neutral-800 dark:drop-shadow-none"
            >
              <div className="flex items-center justify-between gap-x-4">
                <h4 className="text-xl font-semibold">Twoje pliki</h4>
                {(filesResponse == null || filesResponse.length == 0) && (
                  <Button
                    onClick={handleFileDownload}
                    aria-label="Download Product"
                    className="text-sm font-medium transition-opacity duration-300 ease-in-out hover:opacity-80 active:opacity-80"
                    style={styles}
                  >
                    {isFileLoading ? <LoadingIndicator /> : "Wyświetl"}
                  </Button>
                )}
              </div>

              {isFileLoading && (
                <div className="flex flex-col items-start gap-2">
                  <ProgressBar />
                  <p className="font-bold transition hover:text-blue-600">
                    Trwa przygotowanie plików...
                  </p>
                </div>
              )}

              {filesResponse != null && filesResponse.length > 0 && (
                <div className="flex flex-col items-start justify-start gap-2">
                  {filesResponse.map((el, index) => (
                    <a
                      key={index}
                      target="_blank"
                      className="flex w-fit items-center gap-2 rounded-md bg-neutral-800 px-3 py-2 text-neutral-200 dark:bg-neutral-200 dark:text-neutral-800"
                      href={el}
                      download
                    >
                      {`Plik numer ${index + 1}`}
                      <Download width={14} height={14} />
                    </a>
                  ))}
                </div>
              )}
            </div>
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
                              (audioResponse as { coverImage?: string })?.coverImage ??
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

                    <a href="https://docs.bitsnap.pl/guides/audiobook">
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
                              <p className="text-sm font-medium">
                                {chapter.name}
                              </p>
                              {chapter.description && (
                                <p className="mt-3 text-xs">
                                  {chapter.description}
                                </p>
                              )}
                            </button>

                            {audioResponse &&
                              (audioResponse as { isDownloadable?: boolean }).isDownloadable &&
                              chapter.downloadableUrl && (
                                <a href={chapter.downloadableUrl}>
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

        <div className="w-full max-w-3xl space-y-6 rounded-xl bg-white p-6 drop-shadow-xl dark:bg-neutral-900 dark:drop-shadow-none">
          <h2 className="text-3xl font-semibold">{product.productName}</h2>
          <p className="text-sm font-normal text-neutral-600 dark:text-neutral-300">
            {product.productDescription}
          </p>

          <img
            src={product.productImageUrl}
            alt="Product Photo"
            width={384}
            height={384}
            className="max-h-sm max-w-sm"
            draggable={false}
          />
        </div>
      </main>
    </div>
  );
};

export default PanelProductDetails;
