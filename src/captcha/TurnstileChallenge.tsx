import { useEffect, useMemo, useRef, useState } from "react";

import { getPanelConfig } from "../panel/config";

export type TurnstileAction = "panel_login" | "free_chat_claim" | "contact_submit";
export function challengeOrigin(host = getPanelConfig().host): string {
  try {
    const url = new URL(host || "https://bitsnap.pl");
    if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
  } catch { /* Invalid host falls back to production. */ }
  return "https://bitsnap.pl";
}
const TOKEN_LIFETIME_MS = 5 * 60 * 1000;

/** Bound to one form: the challenge page echoes both values back and the receiver ignores any other form's messages. */
export type TurnstileBinding = { formContext?: string; attempt?: string };

export function challengeUrl(origin: string, action: TurnstileAction, language: string, pageOrigin: string, binding: TurnstileBinding = {}): string {
  const params = [`action=${encodeURIComponent(action)}`, `origin=${encodeURIComponent(pageOrigin)}`, `locale=${language}`];
  if (binding.formContext) params.push(`formContext=${encodeURIComponent(binding.formContext)}`);
  if (binding.attempt) params.push(`attempt=${encodeURIComponent(binding.attempt)}`);
  return `${origin}/challenge?${params.join("&")}`;
}

export function parseTurnstileMessage(origin: string, data: unknown, action: TurnstileAction, expectedOrigin = challengeOrigin(), binding: TurnstileBinding = {}):
  | { kind: "token"; token: string }
  | { kind: "disabled" | "failure" }
  | null {
  if (origin !== expectedOrigin || !data || typeof data !== "object") return null;
  const message = data as Record<string, unknown>;
  if (message.type !== "bitsnap:turnstile" || message.action !== action) return null;
  if (binding.formContext && message.formContext !== binding.formContext) return null;
  if (binding.attempt && message.attempt !== binding.attempt) return null;
  if (message.disabled === true) return { kind: "disabled" };
  if (message.failure === true) return { kind: "failure" };
  return typeof message.token === "string" && message.token
    ? { kind: "token", token: message.token }
    : null;
}

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
  const origin = challengeOrigin(host);
  const src = useMemo(() => challengeUrl(origin, action, language, window.location.origin, { formContext, attempt }), [action, language, origin, formContext, attempt]);
  useEffect(() => {
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
  }, [action, refresh, origin, formContext, attempt]);
  return <section className="grid gap-2" aria-live="polite">
    <iframe ref={iframe} key={refresh} title={language === "en" ? "Turnstile security check" : "Weryfikacja bezpieczeństwa Turnstile"} src={src} className="min-h-24 w-full rounded-md border bg-background text-foreground" />
    <button type="button" className="text-sm underline" onClick={() => { popup.current = window.open(src, "bitsnap-turnstile", "popup,width=520,height=680"); }}>{language === "en" ? "Open in a new window" : "Otwórz w nowym oknie"}</button>
    {expired && <p role="alert" className="text-sm text-destructive">{language === "en" ? "The security check expired. Try again." : "Weryfikacja wygasła. Spróbuj ponownie."}</p>}
    <button type="button" className="text-sm underline" onClick={() => { popup.current?.close(); popup.current = null; setExpired(false); setRefresh((n) => n + 1); onFailure?.(); }}>{language === "en" ? "Refresh the security check" : "Odśwież weryfikację"}</button>
  </section>;
}
