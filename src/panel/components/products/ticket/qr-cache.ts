/**
 * Last good QR image of each ticket, so the buyer still has a code at the
 * door without a connection, and its ticket stub (key `stubCacheKey`), so
 * "Save ticket" still works. Kept in memory and, when it fits, in
 * sessionStorage (as a data: URL). Storage may be blocked or full: every
 * access is wrapped and the cache is optional.
 */
import { safeHttpsUrl } from "../safe-url";

const memory = new Map<string, string>();
const PREFIX = "bitsnap-panel-ticket-qr:";
/** Bigger images are not worth a sessionStorage slot. */
const MAX_DATA_URL = 400_000;

/** Only raster images: the same types `safeQrHref` accepts (no SVG). */
function isRasterDataUrl(value: string): boolean {
  return /^data:image\/(png|jpe?g|gif|webp)[;,]/i.test(value);
}

export function readCachedQr(accessId: string): string | undefined {
  const cached = memory.get(accessId);
  if (cached) return cached;
  try {
    const stored = window.sessionStorage.getItem(PREFIX + accessId);
    if (stored && isRasterDataUrl(stored)) {
      memory.set(accessId, stored);
      return stored;
    }
  } catch {
    /* Storage blocked. */
  }
  return undefined;
}

export function writeCachedQr(accessId: string, dataUrl: string) {
  if (!isRasterDataUrl(dataUrl)) return;
  memory.set(accessId, dataUrl);
  if (dataUrl.length > MAX_DATA_URL) return;
  try {
    window.sessionStorage.setItem(PREFIX + accessId, dataUrl);
  } catch {
    /* Storage blocked or full. */
  }
}

/**
 * Forgets every saved QR code and ticket stub (memory and sessionStorage).
 * The code is a bearer credential (its URL carries the access id), so call
 * it on logout.
 */
export function clearQrCache() {
  memory.clear();
  try {
    const storage = window.sessionStorage;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    /* Storage blocked or no window. */
  }
}

/**
 * Fetches the QR image and returns it as a data: URL, or `undefined` when the
 * image host does not allow it (no CORS) or the network fails. A data: URL is
 * returned as is.
 */
export async function qrAsDataUrl(url: string): Promise<string | undefined> {
  if (url.startsWith("data:image/")) return url;
  if (typeof fetch !== "function" || typeof FileReader === "undefined") {
    return undefined;
  }
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return undefined;
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/** A wallet link only when it is a valid `https:` URL. */
export const safeWalletUrl = safeHttpsUrl;

/**
 * A link target for the QR image: an `https:` URL, or a `data:image/` URL
 * (the saved code). Anything else gives `undefined`.
 */
export function safeQrHref(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^data:image\/(png|jpeg|gif|webp);/i.test(value)) return value;
  return safeHttpsUrl(value);
}

/** Cache key of the saved ticket stub (the tall PNG the buyer saves). */
export function stubCacheKey(accessId: string): string {
  return `${accessId}:stub`;
}

/**
 * The tall ticket stub image: `ticketStubUrl` from the server, or, from an
 * older server that does not send it, `ticketUrl` with `layout=stub`. Only an
 * `https:` URL; anything else gives `undefined`.
 */
export function ticketStubUrl(ticket: {
  ticketStubUrl?: string;
  ticketUrl?: string;
}): string | undefined {
  if (ticket.ticketStubUrl) return safeHttpsUrl(ticket.ticketStubUrl);
  if (!ticket.ticketUrl || ticket.ticketUrl.startsWith("data:")) return undefined;
  try {
    const base =
      typeof window !== "undefined" ? window.location.href : undefined;
    const parsed = new URL(ticket.ticketUrl, base);
    if (parsed.protocol !== "https:") return undefined;
    parsed.searchParams.set("layout", "stub");
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/** The QR URL with a cache-buster for a retry; data: URLs stay as they are. */
export function withRetryParam(url: string, attempt: number): string {
  if (attempt === 0 || url.startsWith("data:")) return url;
  try {
    const parsed = new URL(url, window.location.href);
    parsed.searchParams.set("_r", String(attempt));
    return parsed.toString();
  } catch {
    return url;
  }
}
