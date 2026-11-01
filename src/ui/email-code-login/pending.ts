/**
 * The pending step of an e-mail-code login, kept in `sessionStorage` so a
 * reload or an app switch (the code arrives in the mail app) returns to the
 * code step. One key per surface and project; never holds the code itself.
 */

/** How long a sent code stays usable, in milliseconds (the copy says 10 min). */
export const CODE_VALID_MS = 10 * 60 * 1000;

export type PendingLogin = {
  email: string;
  challengeId?: string;
  /** Unix milliseconds when a new code may be requested. */
  resendAt: number;
  /** Unix milliseconds when the code was sent. */
  sentAt: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): StorageLike | undefined {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

/** `bitsnap-login-pending:<surface>:<host>:<project>`. */
export function pendingLoginKey(
  surface: string,
  projectID?: string,
  host?: string,
): string {
  return `bitsnap-login-pending:${surface}:${encodeURIComponent(host ?? "")}:${encodeURIComponent(projectID ?? "")}`;
}

export function savePendingLogin(key: string, pending: PendingLogin): void {
  try {
    browserStorage()?.setItem(key, JSON.stringify(pending));
  } catch {
    // Storage full or blocked: the login still works, it just is not restored.
  }
}

export function clearPendingLogin(key: string): void {
  try {
    browserStorage()?.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * The stored step. Malformed and expired entries are removed and reported as
 * none.
 */
export function readPendingLogin(
  key: string,
  now: number = Date.now(),
): PendingLogin | undefined {
  const storage = browserStorage();
  if (storage == null) return undefined;
  try {
    const raw = storage.getItem(key);
    if (raw == null) return undefined;
    const parsed = JSON.parse(raw) as Partial<PendingLogin> | null;
    if (
      parsed != null &&
      typeof parsed.email === "string" &&
      parsed.email !== "" &&
      typeof parsed.sentAt === "number" &&
      typeof parsed.resendAt === "number" &&
      (parsed.challengeId == null || typeof parsed.challengeId === "string") &&
      now - parsed.sentAt < CODE_VALID_MS
    ) {
      return {
        email: parsed.email,
        challengeId: parsed.challengeId,
        resendAt: parsed.resendAt,
        sentAt: parsed.sentAt,
      };
    }
    storage.removeItem(key);
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
  }
  return undefined;
}
