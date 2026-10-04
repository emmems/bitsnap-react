import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  lookupText,
  mergeTexts,
  pickLocaleTable,
  resolveTexts,
  type LocaleTables,
} from "./texts.ts";

type Key = "hello" | "bye";

const tables: LocaleTables<Key> = {
  en: { hello: "Hello", bye: "Bye" },
  pl: { hello: "Czesc", bye: "Pa" },
};

describe("pickLocaleTable", () => {
  it("returns English for en locales and Polish for everything else", () => {
    for (const locale of ["en", "en-US", "EN-gb"]) {
      assert.equal(pickLocaleTable(tables, locale), tables.en);
    }
    for (const locale of ["pl", "pl-PL", "de-DE", "", "xx"]) {
      assert.equal(pickLocaleTable(tables, locale), tables.pl);
    }
  });
});

describe("mergeTexts", () => {
  it("overrides only the given keys and ignores undefined", () => {
    assert.deepEqual(mergeTexts(tables.en, { hello: "Hi", bye: undefined }), {
      hello: "Hi",
      bye: "Bye",
    });
    assert.deepEqual(mergeTexts(tables.en), tables.en);
  });

  it("does not mutate the table", () => {
    mergeTexts(tables.en, { hello: "Hi" });
    assert.equal(tables.en.hello, "Hello");
  });

  it("applies overrides whatever the locale", () => {
    assert.equal(resolveTexts(tables, "pl", { bye: "X" }).bye, "X");
    assert.equal(resolveTexts(tables, "en-US", { bye: "X" }).bye, "X");
  });
});

describe("lookupText", () => {
  it("falls back to the key", () => {
    assert.equal(lookupText(tables.en, "hello"), "Hello");
    assert.equal(lookupText(tables.en, "missing" as Key), "missing");
  });
});
