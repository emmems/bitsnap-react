import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_LOCALE, getLocale, normalizeLocale, setLocale } from "./locale.ts";

afterEach(() => setLocale(undefined));

const globals = globalThis as unknown as { localStorage?: unknown };

function withStorage(storage: unknown, run: () => void) {
  const before = globals.localStorage;
  globals.localStorage = storage;
  try {
    run();
  } finally {
    if (before === undefined) {
      delete globals.localStorage;
    } else {
      globals.localStorage = before;
    }
  }
}

const blockedStorage = {
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

describe("normalizeLocale", () => {
  it("maps the short forms and trims", () => {
    assert.equal(normalizeLocale("en"), "en-US");
    assert.equal(normalizeLocale("EN"), "en-US");
    assert.equal(normalizeLocale(" en "), "en-US");
    assert.equal(normalizeLocale("pl"), "pl-PL");
    assert.equal(normalizeLocale("Pl"), DEFAULT_LOCALE);
  });

  it("leaves a full locale unchanged", () => {
    assert.equal(normalizeLocale("en-US"), "en-US");
    assert.equal(normalizeLocale("pl-PL"), "pl-PL");
    assert.equal(normalizeLocale("de-DE"), "de-DE");
    assert.equal(normalizeLocale(" de-DE "), "de-DE");
  });

  it("canonicalises the case of a full tag, so one locale has one key (R12)", () => {
    assert.equal(normalizeLocale("en-us"), "en-US");
    assert.equal(normalizeLocale("EN-US"), "en-US");
    assert.equal(normalizeLocale("pl-pl"), "pl-PL");
    assert.equal(normalizeLocale(" de-de "), "de-DE");
    assert.equal(normalizeLocale("zh-hant-tw"), "zh-Hant-TW");
  });

  it("keeps a value Intl rejects as typed (trimmed)", () => {
    assert.equal(normalizeLocale(" not a locale! "), "not a locale!");
  });

  it("gives undefined for an empty value", () => {
    assert.equal(normalizeLocale(undefined), undefined);
    assert.equal(normalizeLocale(""), undefined);
    assert.equal(normalizeLocale("   "), undefined);
  });

  it("agrees with setLocale", () => {
    for (const input of ["en", "pl", " en ", "en-US", "pl-PL", "de-DE", "EN", "Pl"]) {
      setLocale(input);
      assert.equal(getLocale(), normalizeLocale(input), input);
    }
    setLocale("");
    assert.equal(getLocale(), DEFAULT_LOCALE);
  });
});

describe("storage", () => {
  it("round-trips through localStorage and normalises what it reads", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    };
    withStorage(storage, () => {
      setLocale("en");
      assert.equal(values.get("bitsnap-locale"), "en-US");
      setLocale(undefined);
      assert.equal(values.has("bitsnap-locale"), false);
      values.set("bitsnap-locale", "en");
      assert.equal(getLocale(), "en-US", "an old un-normalised value");
      values.set("bitsnap-locale", "en-us");
      assert.equal(getLocale(), "en-US");
      values.set("bitsnap-locale", "   ");
      assert.equal(getLocale(), DEFAULT_LOCALE);
    });
  });

  it("does not throw when the storage is blocked", () => {
    withStorage(blockedStorage, () => {
      assert.equal(getLocale(), DEFAULT_LOCALE);
      assert.doesNotThrow(() => setLocale("en"));
      assert.equal(getLocale(), "en-US", "the in-memory locale still applies");
      assert.doesNotThrow(() => setLocale(undefined));
      assert.equal(getLocale(), DEFAULT_LOCALE);
    });
  });
});
