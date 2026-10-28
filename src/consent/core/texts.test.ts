import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TEXTS, mergeTexts, resolveLocale } from "./texts.ts";
import { mergeConfig, safeColor, safeUrl } from "./config.ts";
import { CONSENT_TEXT_KEYS } from "./types.ts";

describe("consent texts", () => {
  it("has every key in Polish and English", () => {
    for (const locale of ["pl", "en"] as const) {
      for (const key of CONSENT_TEXT_KEYS) {
        assert.ok(DEFAULT_TEXTS[locale][key].length > 0, `${locale}.${key}`);
      }
      assert.equal(Object.keys(DEFAULT_TEXTS[locale]).length, CONSENT_TEXT_KEYS.length);
    }
    assert.equal(DEFAULT_TEXTS.pl.acceptAll, "Akceptuj wszystkie");
    assert.equal(DEFAULT_TEXTS.pl.rejectAll, "Odrzuć wszystkie");
  });

  it("merges single overridden keys over the built-in texts", () => {
    const merged = mergeTexts("pl", { pl: { title: "Cookies u nas" }, en: { title: "Ignored" } });
    assert.equal(merged.title, "Cookies u nas");
    assert.equal(merged.acceptAll, DEFAULT_TEXTS.pl.acceptAll);
    assert.equal(mergeTexts("en").title, DEFAULT_TEXTS.en.title);
  });

  it("ignores empty or non-string overrides", () => {
    const merged = mergeTexts("en", { en: { title: "  ", save: 5 as unknown as string } });
    assert.equal(merged.title, DEFAULT_TEXTS.en.title);
    assert.equal(merged.save, DEFAULT_TEXTS.en.save);
  });

  it("resolves the locale from the browser language", () => {
    assert.equal(resolveLocale("auto", "pl-PL"), "pl");
    assert.equal(resolveLocale("auto", "en-GB"), "en");
    assert.equal(resolveLocale(undefined, "de"), "en");
    assert.equal(resolveLocale("pl", "en"), "pl");
    assert.equal(resolveLocale("en", "pl"), "en");
  });
});

describe("consent config", () => {
  it("layers configs over the defaults and drops invalid values", () => {
    const config = mergeConfig(
      { version: 4, theme: "dark", position: "nowhere" as never, accentColor: "red; x" },
      { categories: { analytics: false, marketing: true, preferences: true }, privacyPolicyUrl: "javascript:alert(1)" },
    );
    assert.equal(config.version, 4);
    assert.equal(config.theme, "dark");
    assert.equal(config.position, "bottom");
    assert.equal(config.accentColor, undefined);
    assert.equal(config.privacyPolicyUrl, undefined);
    assert.deepEqual(config.categories, { analytics: false, marketing: true, preferences: true });
    assert.equal(config.poweredBy, true);
  });

  it("only accepts hex colors and http(s) or relative links", () => {
    assert.equal(safeColor("#1d4ed8"), "#1d4ed8");
    assert.equal(safeColor("#fff"), "#fff");
    assert.equal(safeColor("url(x)"), undefined);
    assert.equal(safeUrl("https://example.com/privacy"), "https://example.com/privacy");
    assert.equal(safeUrl("/polityka"), "/polityka");
    assert.equal(safeUrl("//evil.test"), undefined);
    assert.equal(safeUrl("data:text/html,x"), undefined);
  });
});
