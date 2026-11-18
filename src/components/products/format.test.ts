import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatProductPrice, productCardPrice } from "./format.ts";

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

describe("productCardPrice", () => {
  const base = {
    price: 4900,
    currency: "PLN",
    compareAtPrice: 9900,
    priceFrom: false,
  };

  it("keeps a normal product's price and discount", () => {
    const result = productCardPrice(base, "pl-PL");
    assert.equal(result.kind, "price");
    if (result.kind !== "price") return;
    assert.equal(plain(result.price), "49,00 zł");
    assert.equal(plain(result.compareAtPrice ?? ""), "99,00 zł");
    assert.equal(result.from, false);
  });

  it("says quote for a quote-only product without a price", () => {
    assert.deepEqual(
      productCardPrice({ ...base, price: 0, quoteOnly: true }, "pl-PL"),
      { kind: "quote" },
    );
  });

  it("shows a quote-only service's price, never a discount", () => {
    const result = productCardPrice(
      { ...base, quoteOnly: true, quoteShowsPrice: true, priceFrom: true },
      "pl-PL",
    );
    assert.equal(result.kind, "price");
    if (result.kind !== "price") return;
    assert.equal(plain(result.price), "49,00 zł");
    assert.equal(result.from, true);
    assert.equal(result.compareAtPrice, null);
  });

  it("ignores quoteShowsPrice without quoteOnly", () => {
    const result = productCardPrice({ ...base, quoteShowsPrice: true }, "pl-PL");
    assert.equal(result.kind, "price");
  });
});
