/**
 * Where the buyer panel login runs its Turnstile check.
 *
 * The server trusts the page the widget reports (Turnstile `cData`) only when the widget ran on its
 * panel origin (`PANEL_ORIGIN`, e.g. `https://konto.bitsnap.pl`), a host that never runs a seller's
 * code. `GET <api>/api/panel-origin` answers `{"panelOrigin": "<origin>"}`, or `""` while the server
 * has none. The `panel_login` challenge is then framed from that origin, and its message is accepted
 * from exactly that origin (see `TurnstileChallenge`).
 */

const FAILURE_RETRY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 5_000;

/** API origin -> panel origin ("" = the server has none). Kept for the life of the page. */
const known = new Map<string, string>();
const pending = new Map<string, Promise<void>>();
/** API origin -> when the last request failed: the API origin is used until the retry delay passes. */
const failedAt = new Map<string, number>();

/**
 * The origin in a `/api/panel-origin` answer, or "" when it is not one we may use: not an exact
 * http(s) origin, or plain http while the API is https (a downgrade the server never asks for).
 */
export function parsePanelOrigin(body: unknown, apiOrigin: string): string {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>).panelOrigin : undefined;
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.origin !== value) return "";
    if (url.protocol === "http:" && new URL(apiOrigin).protocol === "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

/**
 * What is known without asking: the panel origin, "" (none, or the request failed a moment ago: use
 * the API origin), or undefined (not asked yet, or being asked).
 */
export function knownPanelOrigin(apiOrigin: string, now = Date.now()): string | undefined {
  const origin = known.get(apiOrigin);
  if (origin !== undefined) return origin;
  const failed = failedAt.get(apiOrigin);
  if (failed !== undefined) {
    if (now - failed < FAILURE_RETRY_MS) return "";
    failedAt.delete(apiOrigin);
  }
  return undefined;
}

/** Asks the API once per page (a failure is retried after 30 seconds). Never rejects. */
export function loadPanelOrigin(apiOrigin: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (knownPanelOrigin(apiOrigin) !== undefined) return Promise.resolve();
  const running = pending.get(apiOrigin);
  if (running) return running;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const request = (async () => {
    try {
      const response = await fetchImpl(`${apiOrigin}/api/panel-origin`, { signal: controller.signal });
      if (!response.ok) throw new Error(`panel-origin ${response.status}`);
      known.set(apiOrigin, parsePanelOrigin(await response.json(), apiOrigin));
    } catch {
      failedAt.set(apiOrigin, Date.now());
    } finally {
      clearTimeout(timer);
      pending.delete(apiOrigin);
    }
  })();
  pending.set(apiOrigin, request);
  return request;
}

/** For tests. */
export function resetPanelOriginCache(): void {
  known.clear();
  pending.clear();
  failedAt.clear();
}
