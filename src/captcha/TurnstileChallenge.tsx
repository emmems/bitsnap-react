import { useEffect, useMemo, useRef, useState } from "react";

import { getPanelConfig } from "../panel/config";

import { knownPanelOrigin, loadPanelOrigin } from "./panel-origin";

import { challengeUrl, parseTurnstileMessage as parseMessage, type TurnstileAction, type TurnstileBinding } from "./protocol";

export { challengeUrl, type TurnstileAction, type TurnstileBinding } from "./protocol";

export function parseTurnstileMessage(origin: string, data: unknown, action: TurnstileAction, expectedOrigin = challengeOrigin(), binding?: TurnstileBinding) {
  return parseMessage(origin, data, action, expectedOrigin, binding);
}

export function challengeOrigin(host = getPanelConfig().host): string {
  try {
    const url = new URL(host || "https://bitsnap.pl");
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch { /* Invalid host falls back to production. */ }
  return "https://bitsnap.pl";
}
const TOKEN_LIFETIME_MS = 5 * 60 * 1000;

/** Bitsnap-hosted Turnstile surface for merchants' own origins. */
export function TurnstileChallenge({ action, locale = "pl", host, formContext, attempt, onToken, onFailure }: {
  action: TurnstileAction;
  locale?: string;
  host?: string;
  /** Required by the challenge page for `contact_submit`: `form_<publicId>`. */
  formContext?: string;
  /** Required by the challenge page for `contact_submit`: `[A-Za-z0-9_-]{1,64}`, new per open form. */
  attempt?: string;
  onToken(token: string): void;
  onFailure?(): void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const popup = useRef<Window | null>(null);
  const callbacks = useRef({ onToken, onFailure });
  callbacks.current = { onToken, onFailure };
  const expiry = useRef<number | undefined>(undefined);
  const clearExpiry = () => { window.clearTimeout(expiry.current); expiry.current = undefined; };
  const [refresh, setRefresh] = useState(0);
  const [expired, setExpired] = useState(false);
  const language = locale.toLowerCase().startsWith("en") ? "en" : "pl";
  const apiOrigin = challengeOrigin(host);
  // The panel login is framed from the server's panel origin when it has one (its Turnstile page
  // there is the one whose page report the server trusts), and only that origin's messages count:
  // never the API origin beside it, never a wildcard. Other actions use the API origin as before.
  // Once known, the origin is fixed for this mount: a re-render never reads a different one, so the
  // iframe, the popup and the token expiry are not torn down in the middle of a challenge.
  const fixedOrigin = useRef<{ api: string; action: string; panel: string } | undefined>(undefined);
  if (fixedOrigin.current && (fixedOrigin.current.api !== apiOrigin || fixedOrigin.current.action !== action)) fixedOrigin.current = undefined;
  if (!fixedOrigin.current) {
    const known = action === "panel_login" ? knownPanelOrigin(apiOrigin) : "";
    if (known !== undefined) fixedOrigin.current = { api: apiOrigin, action, panel: known };
  }
  const panelOrigin = fixedOrigin.current?.panel;
  const waiting = panelOrigin === undefined;
  const [, askedPanelOrigin] = useState(0);
  useEffect(() => {
    if (!waiting) return;
    let live = true;
    void loadPanelOrigin(apiOrigin).then(() => { if (live) askedPanelOrigin((n) => n + 1); });
    return () => { live = false; };
  }, [waiting, apiOrigin]);
  const origin = panelOrigin || apiOrigin;
  const src = useMemo(() => challengeUrl(origin, action, language, window.location.origin, { formContext, attempt }), [action, language, origin, formContext, attempt]);
  useEffect(() => {
    // Nothing is framed until the origin is known, so no message can be for this page yet.
    if (waiting) return;
    const onMessage = (event: MessageEvent) => {
      if (!event.source || (event.source !== iframe.current?.contentWindow && event.source !== popup.current)) return;
      const result = parseTurnstileMessage(event.origin, event.data, action, origin, { formContext, attempt });
      if (result?.kind === "failure") { clearExpiry(); callbacks.current.onFailure?.(); return; }
      // Captcha switched off: the empty token never expires.
      if (result?.kind === "disabled") { clearExpiry(); callbacks.current.onToken(""); return; }
      if (result?.kind === "token") {
        // A Turnstile token lives 5 minutes from when it was issued.
        clearExpiry();
        expiry.current = window.setTimeout(() => { expiry.current = undefined; setExpired(true); callbacks.current.onFailure?.(); }, TOKEN_LIFETIME_MS);
        callbacks.current.onToken(result.token);
      }
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); clearExpiry(); popup.current?.close(); popup.current = null; };
  }, [action, refresh, origin, formContext, attempt, waiting]);
  if (waiting) return <section className="grid gap-2" aria-live="polite" aria-busy="true"><div className="min-h-24 w-full" /></section>;
  return <section className="grid gap-2" aria-live="polite">
    <iframe ref={iframe} key={refresh} title={language === "en" ? "Turnstile security check" : "Weryfikacja bezpieczeństwa Turnstile"} src={src} className="min-h-24 w-full rounded-md border bg-background text-foreground" />
    <button type="button" className="text-sm underline" onClick={() => { popup.current = window.open(src, "bitsnap-turnstile", "popup,width=520,height=680"); }}>{language === "en" ? "Open in a new window" : "Otwórz w nowym oknie"}</button>
    {expired && <p role="alert" className="text-sm text-destructive">{language === "en" ? "The security check expired. Try again." : "Weryfikacja wygasła. Spróbuj ponownie."}</p>}
    <button type="button" className="text-sm underline" onClick={() => { popup.current?.close(); popup.current = null; setExpired(false); setRefresh((n) => n + 1); onFailure?.(); }}>{language === "en" ? "Refresh the security check" : "Odśwież weryfikację"}</button>
  </section>;
}
