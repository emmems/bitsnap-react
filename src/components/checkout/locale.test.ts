import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_LOCALE, getLocale, normalizeLocale, setLocale } from "./locale.ts";

afterEach(() => setLocale(undefined));

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
