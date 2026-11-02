import { useEffect, useMemo, useRef, useState } from "react";

export type TurnstileAction = "panel_login" | "free_chat_claim";
const CHALLENGE_ORIGIN = "https://bitsnap.pl";

export function parseTurnstileMessage(origin: string, data: unknown, action: TurnstileAction):
  | { kind: "token"; token: string }
  | { kind: "disabled" | "failure" }
  | null {
  if (origin !== CHALLENGE_ORIGIN || !data || typeof data !== "object") return null;
  const message = data as Record<string, unknown>;
  if (message.type !== "bitsnap:turnstile" || message.action !== action) return null;
  if (message.disabled === true) return { kind: "disabled" };
  if (message.failure === true) return { kind: "failure" };
  return typeof message.token === "string" && message.token
    ? { kind: "token", token: message.token }
    : null;
}

/** Bitsnap-hosted Turnstile surface for merchants' own origins. */
export function TurnstileChallenge({ action, locale = "pl", onToken, onFailure }: {
  action: TurnstileAction;
  locale?: string;
  onToken(token: string): void;
  onFailure?(): void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const popup = useRef<Window | null>(null);
  const callbacks = useRef({ onToken, onFailure });
  callbacks.current = { onToken, onFailure };
  const [attempt, setAttempt] = useState(0);
  const [expired, setExpired] = useState(false);
  const language = locale.toLowerCase().startsWith("en") ? "en" : "pl";
  const src = useMemo(() => `${CHALLENGE_ORIGIN}/challenge?action=${encodeURIComponent(action)}&origin=${encodeURIComponent(window.location.origin)}&locale=${language}`, [action, language]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.source || (event.source !== iframe.current?.contentWindow && event.source !== popup.current)) return;
      const result = parseTurnstileMessage(event.origin, event.data, action);
      if (result?.kind === "failure") { callbacks.current.onFailure?.(); return; }
      if (result?.kind === "disabled") { callbacks.current.onToken(""); return; }
      if (result?.kind === "token") callbacks.current.onToken(result.token);
    };
    window.addEventListener("message", onMessage);
    const timeout = window.setTimeout(() => { setExpired(true); callbacks.current.onFailure?.(); }, 5 * 60 * 1000);
    return () => { window.removeEventListener("message", onMessage); window.clearTimeout(timeout); popup.current?.close(); popup.current = null; };
  }, [action, attempt]);
  return <section className="grid gap-2" aria-live="polite">
    <iframe ref={iframe} key={attempt} title={language === "en" ? "Turnstile security check" : "Weryfikacja bezpieczeństwa Turnstile"} src={src} className="min-h-24 w-full rounded-md border bg-background text-foreground" />
    <button type="button" className="text-sm underline" onClick={() => { popup.current = window.open(src, "bitsnap-turnstile", "popup,width=520,height=680"); }}>{language === "en" ? "Open in a new window" : "Otwórz w nowym oknie"}</button>
    {expired && <p role="alert" className="text-sm text-destructive">{language === "en" ? "The security check expired. Try again." : "Weryfikacja wygasła. Spróbuj ponownie."}</p>}
    <button type="button" className="text-sm underline" onClick={() => { popup.current?.close(); popup.current = null; setExpired(false); setAttempt((n) => n + 1); onFailure?.(); }}>{language === "en" ? "Refresh the security check" : "Odśwież weryfikację"}</button>
  </section>;
}
