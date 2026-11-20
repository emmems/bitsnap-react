import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCurrency } from "./round.number.ts";

/** Intl uses non-breaking spaces; compare with plain ones. */
const plain = (text: string) => text.replace(/[  ]/g, " ");

describe("formatCurrency", () => {
  it("formats in the given cart locale, whatever the browser language", () => {
    assert.equal(plain(formatCurrency(9980, "PLN", "pl-PL")), "99,80 zł");
    assert.equal(plain(formatCurrency(9980, "PLN", "pl")), "99,80 zł");
    assert.equal(plain(formatCurrency(9980, "PLN", "en-US")), "PLN 99.80");
    assert.equal(plain(formatCurrency(1999, "EUR", "de-DE")), "19,99 €");
  });

  it("falls back to the browser language without a locale (Google Pay labels)", () => {
    const browser = typeof navigator === "undefined" ? "pl-PL" : navigator.language;
    const expected = new Intl.NumberFormat(browser, {
      style: "currency",
      currency: "PLN",
      currencyDisplay: "symbol",
    }).format(99.8);
    assert.equal(formatCurrency(9980, "PLN"), expected);
    assert.equal(formatCurrency(9980, "PLN", ""), expected);
    assert.equal(formatCurrency(9980, "PLN", "   "), expected);
  });

  it("falls back to the browser language for a locale Intl rejects", () => {
    assert.equal(formatCurrency(9980, "PLN", "not a locale!"), formatCurrency(9980, "PLN"));
  });

  it("still throws for an invalid currency", () => {
    assert.throws(() => formatCurrency(100, "nope", "pl-PL"), RangeError);
  });
});
