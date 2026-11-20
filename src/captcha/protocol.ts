export type TurnstileAction = "panel_login" | "free_chat_claim" | "contact_submit" | "live_chat_start";

/** Bound to one form: the challenge page echoes both values back and the receiver ignores any other form's messages. */
export type TurnstileBinding = { formContext?: string; attempt?: string; theme?: "light" | "dark" };

export function challengeUrl(origin: string, action: TurnstileAction, language: string, pageOrigin: string, binding: TurnstileBinding = {}): string {
  const params = [`action=${encodeURIComponent(action)}`, `origin=${encodeURIComponent(pageOrigin)}`, `locale=${language}`];
  if (binding.formContext) params.push(`formContext=${encodeURIComponent(binding.formContext)}`);
  if (binding.attempt) params.push(`attempt=${encodeURIComponent(binding.attempt)}`);
  if (binding.theme) params.push(`theme=${binding.theme}`);
  return `${origin}/challenge?${params.join("&")}`;
}

export function parseTurnstileMessage(origin: string, data: unknown, action: TurnstileAction, expectedOrigin = "https://bitsnap.pl", binding: TurnstileBinding = {}):
  | { kind: "token"; token: string }
  | { kind: "disabled" | "failure" | "interactive" }
  | null {
  if (origin !== expectedOrigin || !data || typeof data !== "object") return null;
  const message = data as Record<string, unknown>;
  if (message.type !== "bitsnap:turnstile" || message.action !== action) return null;
  if (binding.formContext && message.formContext !== binding.formContext) return null;
  if (binding.attempt && message.attempt !== binding.attempt) return null;
  if (message.interactive === true) return { kind: "interactive" };
  if (message.disabled === true) return { kind: "disabled" };
  if (message.failure === true) return { kind: "failure" };
  return typeof message.token === "string" && message.token
    ? { kind: "token", token: message.token }
    : null;
}
