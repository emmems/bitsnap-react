/**
 * Last good QR image of each ticket, so the buyer still has a code at the
 * door without a connection. Kept in memory and, when it fits, in
 * sessionStorage (as a data: URL). Storage may be blocked or full: every
 * access is wrapped and the cache is optional.
 */
const memory = new Map<string, string>();
const PREFIX = "bitsnap-panel-ticket-qr:";
/** Bigger images are not worth a sessionStorage slot. */
const MAX_DATA_URL = 400_000;

export function readCachedQr(accessId: string): string | undefined {
  const cached = memory.get(accessId);
  if (cached) return cached;
  try {
    const stored = window.sessionStorage.getItem(PREFIX + accessId);
    if (stored && stored.startsWith("data:image/")) {
      memory.set(accessId, stored);
      return stored;
    }
  } catch {
    /* Storage blocked. */
  }
  return undefined;
}

export function writeCachedQr(accessId: string, dataUrl: string) {
  if (!dataUrl.startsWith("data:image/")) return;
  memory.set(accessId, dataUrl);
  if (dataUrl.length > MAX_DATA_URL) return;
  try {
    window.sessionStorage.setItem(PREFIX + accessId, dataUrl);
  } catch {
    /* Storage blocked or full. */
  }
}

/** Test hook. */
export function clearQrCache() {
  memory.clear();
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
export function safeWalletUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
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
