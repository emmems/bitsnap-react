import { useEffect, useMemo, useState } from "react";

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
  const [expired, setExpired] = useState(false);
  const language = locale.toLowerCase().startsWith("en") ? "en" : "pl";
  const src = useMemo(() => `${CHALLENGE_ORIGIN}/challenge?action=${encodeURIComponent(action)}&origin=${encodeURIComponent(window.location.origin)}&locale=${language}`, [action, language]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const result = parseTurnstileMessage(event.origin, event.data, action);
      if (result?.kind === "failure") { onFailure?.(); return; }
      if (result?.kind === "disabled") { onToken(""); return; }
      if (result?.kind === "token") onToken(result.token);
    };
    window.addEventListener("message", onMessage);
    const timeout = window.setTimeout(() => setExpired(true), 5 * 60 * 1000);
    return () => { window.removeEventListener("message", onMessage); window.clearTimeout(timeout); };
  }, [action, onToken]);
  return <section className="grid gap-2" aria-live="polite">
    <iframe title="Weryfikacja bezpieczeństwa Turnstile" src={src} className="min-h-24 w-full rounded-md border bg-white dark:bg-neutral-950" />
    <button type="button" className="text-sm underline" onClick={() => window.open(src, "bitsnap-turnstile", "popup,width=520,height=680")}>Otwórz w nowym oknie</button>
    {expired && <p role="alert" className="text-sm text-destructive">Weryfikacja wygasła. Spróbuj ponownie.</p>}
    <button type="button" className="text-sm underline" onClick={() => { setExpired(false); onFailure?.(); }}>Odśwież weryfikację</button>
  </section>;
}
