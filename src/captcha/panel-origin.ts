/**
 * Where the buyer panel login runs its Turnstile check.
 *
 * The server trusts the page the widget reports (Turnstile `cData`) only when the widget ran on its
 * panel origin (`PANEL_ORIGIN`, e.g. `https://konto.bitsnap.pl`), a host that never runs a seller's
 * code. `GET <api>/api/panel-origin` answers `{"panelOrigin": "<origin>"}`, or `""` while the server
 * has none. The `panel_login` challenge is then framed from that origin, and its message is accepted
 * from exactly that origin (see `TurnstileChallenge`).
 *
 * Only a successful answer (2xx with valid JSON, an empty `panelOrigin` included) is kept for the life
 * of the page. A failure (a 404 from an older server, a 503, a network error, the timeout, a body that
 * is not JSON) resolves that one lookup to "" (frame the API origin) and is not kept: the next lookup,
 * a new login attempt or a remount, asks again, so one network blip does not leave sign-in unavailable
 * until a reload. Security does not depend on this cache: the server decides which origin it trusts.
 * A mounted challenge never switches origin (see `TurnstileChallenge`), whatever a later lookup says.
 */

const REQUEST_TIMEOUT_MS = 5_000;

/** API origin -> panel origin ("" = the server has none), for successful answers only. Kept for the life of the page. */
const known = new Map<string, string>();
/** Lookups in flight, so concurrent callers share one request. */
const pending = new Map<string, Promise<string>>();

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

/** The server's answer for this API origin when it was asked successfully, else undefined (not asked, being asked, or the last ask failed). */
export function knownPanelOrigin(apiOrigin: string): string | undefined {
  return known.get(apiOrigin);
}

/**
 * The panel origin for this API origin: the kept answer, or one request shared by concurrent callers.
 * Resolves to "" (frame the API origin) when the request fails; that failure is not kept. Never rejects.
 */
export function loadPanelOrigin(apiOrigin: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const kept = known.get(apiOrigin);
  if (kept !== undefined) return Promise.resolve(kept);
  const running = pending.get(apiOrigin);
  if (running) return running;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const request = (async () => {
    try {
      const response = await fetchImpl(`${apiOrigin}/api/panel-origin`, { signal: controller.signal });
      if (!response.ok) return "";
      const origin = parsePanelOrigin(await response.json(), apiOrigin);
      known.set(apiOrigin, origin);
      return origin;
    } catch {
      // Network error, timeout or a body that is not JSON: the API origin for this lookup only.
      return "";
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
}
