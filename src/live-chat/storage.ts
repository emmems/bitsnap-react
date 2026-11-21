import { getPanelEmail, getPanelSession } from "../panel/session-storage";
import type { PanelOptions, VisitorSession } from "./protocol";

const memory = new Map<string, string | null>();
export const sessionKey = (project: string) => `bitsnap-chat:${project}`;

export function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try { return localStorage.getItem(key); } catch { return null; }
}

export function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
}

export function validSession(session: VisitorSession | undefined): session is VisitorSession {
  return !!session && typeof session.token === "string" && session.token.startsWith("bvis_") &&
    Number.isFinite(session.expiresAt) && session.expiresAt * 1000 > Date.now();
}

export function loadSession(project: string): VisitorSession | undefined {
  const key = sessionKey(project);
  const value = read(key);
  if (!value) return undefined;
  try {
    const session = JSON.parse(value) as VisitorSession;
    if (validSession(session)) return session;
  } catch { /* Invalid record. */ }
  write(key, null);
  return undefined;
}

export function buyerSession(options: Pick<PanelOptions, "projectKey" | "config">) {
  try {
    const { projectKey, config: { challengeOrigin } } = options;
    // The snippet accepts pk_ as an alias for the public ID used by the buyer panel.
    const publicKey = projectKey.replace(/^pk_/, "");
    for (const key of new Set([projectKey, publicKey, `pk_${publicKey}`])) {
      if (!key.trim()) continue;
      const token = getPanelSession(key, challengeOrigin);
      if (token) return { token, email: getPanelEmail(key, challengeOrigin)?.trim().toLowerCase() };
    }
  } catch { /* The host may disable localStorage. */ }
  return undefined;
}

export function identityChanged(session: VisitorSession, buyer: ReturnType<typeof buyerSession>) {
  const verifiedEmail = session.verifiedEmail ?? (session.verified ? session.email : undefined);
  return !!(session.verified || verifiedEmail) &&
    (!buyer?.token || !!(buyer.email && verifiedEmail && buyer.email !== verifiedEmail.toLowerCase()));
}
