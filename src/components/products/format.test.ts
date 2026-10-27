import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatProductPrice } from "./format.ts";

const plain = (value: string) => value.replace(/\s/g, " ");

describe("formatProductPrice", () => {
  it("formats minor units like the cart (amount / 100)", () => {
    assert.equal(plain(formatProductPrice(12345, "PLN", "pl-PL")), "123,45 zł");
    assert.equal(formatProductPrice(12345, "USD", "en-US"), "$123.45");
    assert.equal(formatProductPrice(5, "USD", "en-US"), "$0.05");
  });

  it("defaults to the Polish locale", () => {
    assert.equal(plain(formatProductPrice(1000, "PLN")), "10,00 zł");
  });

  it("falls back to Polish for an invalid locale", () => {
    assert.equal(plain(formatProductPrice(1000, "PLN", "not a locale")), "10,00 zł");
  });

  it("survives an invalid currency", () => {
    assert.equal(formatProductPrice(1000, "not-a-currency", "en-US"), "10.00 not-a-currency");
  });
});
