import { Download, Sun, Ticket, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { FailureMessage } from "../../../../gen/proto/public/v1/public_api_pb";
import { rpcProvider, useMutation } from "../../../../rpc-provider";
import { cn } from "../../../../lib/utils";
import {
  Notice,
  PRIMARY_ACTION_CLASSES,
  RetryButton,
  SKELETON_CLASSES,
} from "../Notice";
import type { ProductTexts } from "../texts";
import { useProductLoad } from "../useProductLoad";
import {
  qrAsDataUrl,
  readCachedQr,
  safeQrHref,
  safeWalletUrl,
  withRetryParam,
  writeCachedQr,
} from "./qr-cache";

const WALLET_CLASSES =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-(--panel-fg) px-4 text-sm font-semibold text-(--panel-surface) hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)";

/**
 * The ticket as a pass (option A, "Bilet jako przepustka"): the QR code from
 * `userPanelGetTicketDetails` on a white tile (also in dark mode, so it
 * scans), the entry hint, wallet buttons when their URL is a valid https:
 * link, and "Zapisz kod QR". The last good code stays available offline.
 */
export function TicketPass({
  accessId,
  accessToken,
  productName,
  texts,
  onSave,
}: {
  accessId: string;
  accessToken: string;
  productName: string;
  texts: ProductTexts;
  /** Reports `panel_download` when the buyer saves the code. */
  onSave: () => void;
}) {
  const { mutateAsync } = useMutation(
    rpcProvider.publicApi.userPanelGetTicketDetails,
  );
  const [state, reload] = useProductLoad(async () => {
    const response = await mutateAsync({ accessId, accessToken });
    return response.result.case === "success"
      ? { ok: true as const, value: response.result.value }
      : { ok: false as const, failure: response.result.value! };
  }, accessId);

  // The saved code, read after mount (storage is client-only).
  const [savedQr, setSavedQr] = useState<string>();
  useEffect(() => setSavedQr(readCachedQr(accessId)), [accessId]);

  const [attempt, setAttempt] = useState(0);
  // Load state of one image URL; any other URL counts as still loading, so a
  // load event that fires before an effect can never be overwritten.
  const [image, setImage] = useState<{ src?: string; status: "ok" | "error" }>({
    status: "ok",
  });
  const ticketUrl =
    state.status === "ok" && state.value.ticketUrl
      ? state.value.ticketUrl
      : undefined;
  const liveSrc = ticketUrl ? withRetryParam(ticketUrl, attempt) : undefined;
  const imageStatus: "loading" | "ok" | "error" =
    liveSrc != null && image.src === liveSrc ? image.status : "loading";

  function handleLoad() {
    setImage({ src: liveSrc, status: "ok" });
    if (!ticketUrl) return;
    // Best effort: without CORS on the image host this gives `undefined` and
    // nothing is saved; the QR is still shown from its URL.
    void qrAsDataUrl(ticketUrl).then(
      (dataUrl) => {
        if (!dataUrl) return;
        writeCachedQr(accessId, dataUrl);
        setSavedQr(dataUrl);
      },
      () => {},
    );
  }

  function retry() {
    if (state.status === "ok") setAttempt((value) => value + 1);
    else reload();
  }

  const notFound =
    state.status === "failure" &&
    (state.failure === FailureMessage.TICKET_NOT_FOUND ||
      state.failure === FailureMessage.UNAUTHORIZED);
  const offline =
    savedQr != null &&
    (state.status === "error" ||
      (state.status === "ok" && imageStatus === "error"));
  const live = state.status === "ok" && !offline;
  const qrSrc = offline ? savedQr : liveSrc;
  const ticket = live && state.status === "ok" ? state.value : undefined;
  const apple = safeWalletUrl(ticket?.appleWalletUrl);
  const google = safeWalletUrl(ticket?.googleWalletUrl);
  const saveHref = safeQrHref(savedQr ?? qrSrc);
  const loading =
    state.status === "loading" || (live && imageStatus === "loading");
  // Blame the connection only when the browser says it is offline.
  const offlineTitle =
    typeof navigator !== "undefined" && navigator.onLine === false
      ? texts.ticketOffline
      : texts.ticketSavedCode;

  const failed =
    state.status === "error" ||
    state.status === "failure" ||
    (state.status === "ok" && !ticketUrl);
  if (notFound || (!offline && failed)) {
    return (
      <section aria-label={texts.yourTicket} className="flex flex-col gap-3 rounded-xl border border-(--panel-border) bg-(--panel-surface) p-4 text-(--panel-fg) sm:p-5">
        <TicketEyebrow texts={texts} />
        <Notice
          role="alert"
          tone="danger"
          title={notFound ? texts.ticketNotFound : texts.ticketError}
          description={notFound ? texts.ticketNotFoundHelp : undefined}
          action={notFound ? undefined : <RetryButton onClick={retry}>{texts.retry}</RetryButton>}
        />
      </section>
    );
  }

  return (
    <section
      aria-label={texts.yourTicket}
      aria-busy={loading}
      data-ticket-pass=""
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-(--panel-border) bg-(--panel-surface) p-4 text-(--panel-fg) sm:p-5"
    >
      <TicketEyebrow texts={texts} className="sm:hidden" />
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="relative shrink-0 rounded-xl border border-neutral-200 bg-white p-4">
          {state.status === "loading" || !qrSrc ? (
            <div
              role="status"
              aria-label={texts.ticketLoading}
              className="size-48 animate-pulse rounded bg-neutral-100 motion-reduce:animate-none sm:size-44"
            />
          ) : (
            <>
              <img
                key={qrSrc}
                src={qrSrc}
                alt={texts.ticketQrAlt(productName)}
                width={192}
                height={192}
                draggable={false}
                onLoad={offline ? undefined : handleLoad}
                onError={
                  offline
                    ? undefined
                    : () => setImage({ src: liveSrc, status: "error" })
                }
                className={cn(
                  "size-48 object-contain [image-rendering:pixelated] sm:size-44",
                  live && imageStatus !== "ok" && "opacity-0",
                )}
              />
              {live && imageStatus === "loading" && (
                <div
                  role="status"
                  aria-label={texts.ticketLoading}
                  className="absolute inset-4 animate-pulse rounded bg-neutral-100 motion-reduce:animate-none"
                />
              )}
            </>
          )}
        </div>
        <div className="flex w-full min-w-0 flex-col gap-3 text-center sm:text-left">
          <TicketEyebrow texts={texts} className="hidden sm:flex" />
          {offline && (
            <Notice
              role="status"
              tone="offline"
              title={offlineTitle}
              action={<RetryButton onClick={retry}>{texts.retry}</RetryButton>}
              className="text-left"
            />
          )}
          {live && imageStatus === "error" && (
            <Notice
              role="alert"
              tone="danger"
              title={texts.ticketImageError}
              action={<RetryButton onClick={retry}>{texts.retry}</RetryButton>}
              className="text-left"
            />
          )}
          <div>
            <p className="text-sm font-semibold">{texts.ticketShowAtEntry}</p>
            <p className="mt-1 text-xs text-(--panel-muted)">
              <Sun className="mr-1 inline size-3.5 align-[-3px]" aria-hidden="true" />
              {texts.ticketBrightness}
            </p>
          </div>
          <div
            aria-hidden="true"
            className="-mx-4 my-1 border-t border-dashed border-(--panel-border) sm:hidden"
          />
          <div className="flex flex-col gap-2">
            {state.status === "loading" ? (
              <span aria-hidden="true" className={cn(SKELETON_CLASSES, "h-11 w-full rounded-lg")} />
            ) : (
              <>
                {apple && (
                  <a href={apple} target="_blank" rel="noopener noreferrer" className={WALLET_CLASSES}>
                    <Wallet className="size-4" aria-hidden="true" />
                    {texts.ticketAppleWallet}
                  </a>
                )}
                {google && (
                  <a href={google} target="_blank" rel="noopener noreferrer" className={WALLET_CLASSES}>
                    <Wallet className="size-4" aria-hidden="true" />
                    {texts.ticketGoogleWallet}
                  </a>
                )}
                {saveHref && (
                  <a
                    href={saveHref}
                    download={`${fileSlug(productName)}-qr.png`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onSave}
                    className={cn(PRIMARY_ACTION_CLASSES, "w-full")}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {texts.ticketSaveQr}
                  </a>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** "Twój bilet" heading: above the QR on phones, beside it from `sm`. */
function TicketEyebrow({ texts, className }: { texts: ProductTexts; className?: string }) {
  return (
    <h3
      className={cn(
        "flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wider text-(--panel-muted) uppercase sm:justify-start",
        className,
      )}
    >
      <Ticket className="size-4" aria-hidden="true" />
      {texts.yourTicket}
    </h3>
  );
}

/** ASCII file name part from the product name. */
export function fileSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "bilet";
}
