import { timestampMs, type Timestamp } from "@bufbuild/protobuf/wkt";

/** Returns session as kept in `sessionStorage`. */
export type StoredReturnsSession = {
  token: string;
  /** Expiry as unix milliseconds. */
  expiresAt: number;
};

/** The part of `Storage` the session code needs. */
export type SessionStorageLike = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

const KEY_PREFIX = "bitsnap-returns-session:";

/** One key per project, so projects on the same page never share a session. */
export function sessionStorageKey(projectID: string): string {
  return `${KEY_PREFIX}${projectID}`;
}

/**
 * `window.sessionStorage` when it is usable, otherwise `undefined`. Safe to
 * call on the server and where storage access throws (blocked cookies).
 */
export function getBrowserSessionStorage(): SessionStorageLike | undefined {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads the stored session. Malformed and expired entries are removed and
 * reported as no session.
 */
export function readStoredSession(
  storage: SessionStorageLike | undefined,
  projectID: string,
  now: number = Date.now(),
): StoredReturnsSession | undefined {
  if (storage == null) {
    return undefined;
  }

  const key = sessionStorageKey(projectID);

  try {
    const raw = storage.getItem(key);
    if (raw == null) {
      return undefined;
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      parsed != null &&
      typeof parsed === "object" &&
      typeof (parsed as StoredReturnsSession).token === "string" &&
      (parsed as StoredReturnsSession).token.length > 0 &&
      typeof (parsed as StoredReturnsSession).expiresAt === "number" &&
      (parsed as StoredReturnsSession).expiresAt > now
    ) {
      const { token, expiresAt } = parsed as StoredReturnsSession;
      return { token, expiresAt };
    }

    storage.removeItem(key);
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage is unusable; nothing else to clean up.
    }
  }

  return undefined;
}

export function writeStoredSession(
  storage: SessionStorageLike | undefined,
  projectID: string,
  session: StoredReturnsSession,
): void {
  try {
    storage?.setItem(sessionStorageKey(projectID), JSON.stringify(session));
  } catch {
    // The session still works in memory when storage is full or blocked.
  }
}

export function clearStoredSession(
  storage: SessionStorageLike | undefined,
  projectID: string,
): void {
  try {
    storage?.removeItem(sessionStorageKey(projectID));
  } catch {
    // Nothing to do when storage is blocked.
  }
}

/** Expiry of a backend session in unix milliseconds, `undefined` when missing. */
export function expiryToMillis(
  expiresAt: Timestamp | undefined,
): number | undefined {
  return expiresAt == null ? undefined : timestampMs(expiresAt);
}
