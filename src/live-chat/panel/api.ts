import { ChatError } from "../../chat/client";
import type { PanelOptions, VisitorSession } from "../protocol";
import { validSession } from "../storage";

export function randomId(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function requestSession(
  options: PanelOptions,
  body: { captchaToken: string; attempt: string; locale: string; panelToken?: string } | { email: string } | { panelToken: string },
  token?: string,
): Promise<VisitorSession> {
  const url = `${options.apiOrigin}/api/live-chat/v1/${encodeURIComponent(options.projectKey)}/sessions${token ? "/identify" : ""}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ChatError("network", 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ChatError(data?.error ?? "unavailable", response.status, {
      retry_after: response.headers.get("Retry-After") ?? data?.retry_after,
    });
  }
  const session: VisitorSession = {
    token: data?.token,
    expiresAt: data?.expiresAt,
    email: data?.identity?.email,
    verified: data?.identity?.verified === true,
  };
  if (!validSession(session)) throw new ChatError("unavailable", 503);
  return session;
}
