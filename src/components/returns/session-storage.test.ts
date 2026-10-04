import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearStoredSession,
  readStoredSession,
  sessionStorageKey,
  writeStoredSession,
  type SessionStorageLike,
} from "./session-storage.ts";

function memoryStorage(): SessionStorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("returns session storage", () => {
  it("round-trips a session under a per-project key", () => {
    const storage = memoryStorage();
    writeStoredSession(storage, "project-a", { token: "t1", expiresAt: 2000 });

    assert.deepEqual(readStoredSession(storage, "project-a", 1000), {
      token: "t1",
      expiresAt: 2000,
    });
    assert.equal(readStoredSession(storage, "project-b", 1000), undefined);
    assert.notEqual(sessionStorageKey("project-a"), sessionStorageKey("project-b"));
  });

  it("drops expired sessions and removes them from storage", () => {
    const storage = memoryStorage();
    writeStoredSession(storage, "p", { token: "t1", expiresAt: 2000 });

    assert.equal(readStoredSession(storage, "p", 2000), undefined);
    assert.equal(storage.data.size, 0);
  });

  it("drops malformed entries", () => {
    const storage = memoryStorage();
    for (const raw of ["not json", '{"token":1}', '{"token":"","expiresAt":9999999999999}', "null"]) {
      storage.setItem(sessionStorageKey("p"), raw);
      assert.equal(readStoredSession(storage, "p", 1000), undefined);
      assert.equal(storage.data.size, 0);
    }
  });

  it("clears a stored session", () => {
    const storage = memoryStorage();
    writeStoredSession(storage, "p", { token: "t", expiresAt: 5000 });
    clearStoredSession(storage, "p");

    assert.equal(readStoredSession(storage, "p", 1000), undefined);
  });

  it("is a no-op without storage (server render) or with a throwing one", () => {
    assert.equal(readStoredSession(undefined, "p"), undefined);
    writeStoredSession(undefined, "p", { token: "t", expiresAt: 1 });
    clearStoredSession(undefined, "p");

    const throwing: SessionStorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    assert.equal(readStoredSession(throwing, "p"), undefined);
    writeStoredSession(throwing, "p", { token: "t", expiresAt: 1 });
    clearStoredSession(throwing, "p");
  });
});
