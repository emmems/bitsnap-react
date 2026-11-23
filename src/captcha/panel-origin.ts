/**
 * Where the buyer panel login runs its Turnstile check.
 *
 * The server trusts the page the widget reports (Turnstile `cData`) only when the widget ran on its
 * panel origin (`PANEL_ORIGIN`, e.g. `https://konto.bitsnap.pl`), a host that never runs a seller's
 * code. `GET <api>/api/panel-origin` answers `{"panelOrigin": "<origin>"}`, or `""` while the server
 * has none. The `panel_login` challenge is then framed from that origin, and its message is accepted
 * from exactly that origin (see `TurnstileChallenge`).
 *
 * The answer is final for the life of the page, whatever it is: a 404 from an older server, a 503 or a
 * network error all mean "" (frame the API origin). A later change of answer would swap the iframe's
 * origin in the middle of a challenge, which closes the popup and drops the token expiry.
 */

const REQUEST_TIMEOUT_MS = 5_000;

/** API origin -> panel origin ("" = the server has none, or could not be asked). Kept for the life of the page. */
const known = new Map<string, string>();
const pending = new Map<string, Promise<void>>();

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
 * What is known without asking: the panel origin, "" (none, or it could not be read: use the API
 * origin), or undefined (not asked yet, or being asked). Once defined it never changes.
 */
export function knownPanelOrigin(apiOrigin: string): string | undefined {
  return known.get(apiOrigin);
}

/** Asks the API once per page, whatever the answer. Never rejects. */
export function loadPanelOrigin(apiOrigin: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (known.has(apiOrigin)) return Promise.resolve();
  const running = pending.get(apiOrigin);
  if (running) return running;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const request = (async () => {
    let origin = "";
    try {
      const response = await fetchImpl(`${apiOrigin}/api/panel-origin`, { signal: controller.signal });
      if (response.ok) origin = parsePanelOrigin(await response.json(), apiOrigin);
    } catch {
      // Network error, timeout or a body that is not JSON: the API origin, for the rest of the page.
    } finally {
      clearTimeout(timer);
      known.set(apiOrigin, origin);
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
