import { CalendarDays, Download, Sun, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { getLocale } from "../../../../components/checkout/locale";
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
import { formatEventDate } from "./event-date";
import {
  imageExtension,
  qrAsDataUrl,
  readCachedQr,
  safeQrHref,
  safeWalletUrl,
  stubCacheKey,
  ticketStubUrl,
  withRetryParam,
  writeCachedQr,
} from "./qr-cache";

const WALLET_CLASSES =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-(--panel-fg) px-4 text-sm font-semibold text-(--panel-surface) hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)";

/** Notch radius of the perforation, in px. */
const NOTCH = 12;

/**
 * The ticket as a tall stub, one centred column at every width: the event
 * date, a perforation line, the shop's brand-tile QR from
 * `userPanelGetTicketDetails` on a white tile (also in dark mode, so it
 * scans), the entry hint, wallet buttons when their URL is a valid https:
 * link, and "Zapisz bilet", which saves the tall stub PNG. The last good
 * tile and stub stay available offline.
 *
 * The product name is the page title right above (ProductShell), so the
 * stub leads with the date instead of repeating the name.
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

  // The saved tile and stub, read after mount (storage is client-only). Each
  // is tagged with its ticket: an image fetch that finishes after the ticket
  // changed still fills its own ticket's cache, but never shows here, and the
  // render right after a change shows nothing saved instead of the old one.
  const [saved, setSaved] = useState<{
    accessId: string;
    qr?: string;
    stub?: string;
  }>();
  useEffect(() => {
    setSaved({
      accessId,
      qr: readCachedQr(accessId),
      stub: readCachedQr(stubCacheKey(accessId)),
    });
  }, [accessId]);
  const savedQr = saved?.accessId === accessId ? saved.qr : undefined;
  const savedStub = saved?.accessId === accessId ? saved.stub : undefined;
  /** Shows a freshly cached image, unless the ticket changed meanwhile. */
  function keepSaved(requestedId: string, image: { qr?: string; stub?: string }) {
    setSaved((current) => {
      if (current == null) return { accessId: requestedId, ...image };
      return current.accessId === requestedId ? { ...current, ...image } : current;
    });
  }

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
  const stubUrl =
    state.status === "ok" ? ticketStubUrl(state.value) : undefined;
  const liveSrc = ticketUrl ? withRetryParam(ticketUrl, attempt) : undefined;
  const imageStatus: "loading" | "ok" | "error" =
    liveSrc != null && image.src === liveSrc ? image.status : "loading";

  function handleLoad() {
    setImage({ src: liveSrc, status: "ok" });
    if (!ticketUrl) return;
    const requestedId = accessId;
    // Best effort: without CORS on the image host this gives `undefined` and
    // nothing is saved; the QR is still shown from its URL.
    void qrAsDataUrl(ticketUrl).then(
      (dataUrl) => {
        if (!dataUrl) return;
        writeCachedQr(requestedId, dataUrl);
        keepSaved(requestedId, { qr: dataUrl });
      },
      () => {},
    );
    // The stub too, after the tile, so "Zapisz bilet" works offline.
    if (!stubUrl) return;
    void qrAsDataUrl(stubUrl).then(
      (dataUrl) => {
        if (!dataUrl) return;
        writeCachedQr(stubCacheKey(requestedId), dataUrl);
        keepSaved(requestedId, { stub: dataUrl });
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
  // Without a cached stub, offline still saves the cached tile: some code
  // beats none at the door.
  const saveHref =
    safeQrHref(savedStub) ??
    (live ? safeQrHref(stubUrl) : undefined) ??
    safeQrHref(savedQr) ??
    safeQrHref(qrSrc);
  const eventDate =
    state.status === "ok"
      ? formatEventDate(state.value.eventStartDate, getLocale())
      : undefined;
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
      <section aria-label={texts.yourTicket} className={cn(STUB_CLASSES, "p-4 sm:p-5")}>
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

  // The event block only when there is something to put in it; then the
  // perforation separates it from the code.
  const head = state.status === "loading" || eventDate != null;

  return (
    <section
      aria-label={texts.yourTicket}
      aria-busy={loading}
      data-ticket-pass=""
      className={STUB_CLASSES}
    >
      {head && (
        <>
          <div className="px-5 pt-5 pb-4 text-center">
            {eventDate ? (
              <h3 className="inline-flex items-start justify-center gap-2 text-lg leading-snug font-semibold text-balance text-(--panel-fg) tabular-nums">
                <CalendarDays
                  className="mt-0.5 size-5 shrink-0 text-(--panel-muted)"
                  aria-hidden="true"
                />
                <time dateTime={eventDate.iso} data-ticket-date="">
                  {eventDate.label}
                </time>
              </h3>
            ) : (
              <span
                aria-hidden="true"
                className={cn(SKELETON_CLASSES, "mx-auto block h-7 w-52")}
              />
            )}
          </div>
          <Perforation />
        </>
      )}
      <div className={cn("flex flex-col items-center gap-4 px-5 pb-5", head ? "pt-4" : "pt-5")}>
        <div className="relative shrink-0 rounded-xl border border-neutral-200 bg-white p-2">
          {state.status === "loading" || !qrSrc ? (
            <div
              role="status"
              aria-label={texts.ticketLoading}
              className={cn(QR_SIZE, "animate-pulse rounded-lg bg-neutral-100 motion-reduce:animate-none")}
            />
          ) : (
            <>
              <img
                key={qrSrc}
                src={qrSrc}
                alt={texts.ticketQrAlt(productName)}
                width={QR_WIDTH}
                height={QR_HEIGHT}
                draggable={false}
                onLoad={offline ? undefined : handleLoad}
                onError={
                  offline
                    ? undefined
                    : () => setImage({ src: liveSrc, status: "error" })
                }
                className={cn(
                  QR_SIZE,
                  "block object-contain",
                  live && imageStatus !== "ok" && "opacity-0",
                )}
              />
              {live && imageStatus === "loading" && (
                <div
                  role="status"
                  aria-label={texts.ticketLoading}
                  className="absolute inset-2 animate-pulse rounded-lg bg-neutral-100 motion-reduce:animate-none"
                />
              )}
            </>
          )}
        </div>
        {offline && (
          <Notice
            role="status"
            tone="offline"
            title={offlineTitle}
            action={<RetryButton onClick={retry}>{texts.retry}</RetryButton>}
            className="w-full text-left"
          />
        )}
        {live && imageStatus === "error" && (
          <Notice
            role="alert"
            tone="danger"
            title={texts.ticketImageError}
            action={<RetryButton onClick={retry}>{texts.retry}</RetryButton>}
            className="w-full text-left"
          />
        )}
        <div className="text-center text-pretty">
          <p className="text-sm font-semibold">{texts.ticketShowAtEntry}</p>
          <p className="mt-1 text-xs text-(--panel-muted)">
            <Sun className="mr-1 inline size-3.5 align-[-3px]" aria-hidden="true" />
            {texts.ticketBrightness}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 pt-1">
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
                  download={`${fileSlug(productName)}-bilet.${imageExtension(saveHref)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onSave}
                  className={cn(PRIMARY_ACTION_CLASSES, "w-full")}
                >
                  <Download className="size-4" aria-hidden="true" />
                  {texts.ticketSave}
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The card: one column, about 360 px wide at most. Centred while the page is
 * one column; from `lg` it starts the content column, beside the title and
 * flush with the organiser card below.
 */
const STUB_CLASSES =
  "relative mx-auto flex lg:mx-0 w-full max-w-[360px] min-w-0 flex-col rounded-xl border border-(--panel-border) bg-(--panel-surface) text-(--panel-fg)";

/** The brand tile is 640×720; shown at 224×252 CSS px. */
const QR_WIDTH = 224;
const QR_HEIGHT = 252;
const QR_SIZE = "h-[252px] w-[224px]";

/**
 * Tear line: a dashed rule with a half-circle cut into each side edge. Each
 * notch is a page-coloured disc centred on the card's outer edge and clipped
 * to its inner half, so it covers the card border there and its own border
 * draws the cut's outline, in light and dark themes alike.
 */
function Perforation() {
  const notch =
    "absolute top-1/2 box-border rounded-full border border-(--panel-border) bg-(--panel-bg)";
  const size = { width: NOTCH * 2, height: NOTCH * 2, marginTop: -NOTCH };
  return (
    <div aria-hidden="true" className="relative h-0" data-ticket-perforation="">
      <span
        className={notch}
        style={{ ...size, left: -1 - NOTCH, clipPath: "inset(0 0 0 50%)" }}
      />
      <span
        className={notch}
        style={{ ...size, right: -1 - NOTCH, clipPath: "inset(0 50% 0 0)" }}
      />
      <div
        className="absolute top-0 border-t-2 border-dashed border-(--panel-muted)/30"
        style={{ left: NOTCH + 6, right: NOTCH + 6, marginTop: -1 }}
      />
    </div>
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
