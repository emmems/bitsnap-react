import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMoney, toDecimalString } from "./money.ts";

const plain = (value: string) => value.replace(/\s/g, " ");

describe("formatMoney", () => {
  it("formats minor units with the currency and locale", () => {
    assert.equal(plain(formatMoney(BigInt(12345), "PLN", "pl-PL")), "123,45 zł");
    assert.equal(formatMoney(BigInt(12345), "USD", "en-US"), "$123.45");
    assert.equal(formatMoney(BigInt(5), "USD", "en-US"), "$0.05");
  });

  it("keeps full precision for amounts beyond Number.MAX_SAFE_INTEGER", () => {
    // 2^53 + 1 cents would round to ...992 as a double.
    assert.equal(
      formatMoney(BigInt("9007199254740993"), "USD", "en-US"),
      "$90,071,992,547,409.93",
    );
  });

  it("handles negative amounts and currencies without decimals", () => {
    assert.equal(formatMoney(BigInt(-250), "USD", "en-US"), "-$2.50");
    assert.equal(formatMoney(BigInt(500), "JPY", "en-US"), "¥500");
  });

  it("accepts plain numbers and survives an invalid currency", () => {
    assert.equal(formatMoney(1000, "USD", "en-US"), "$10.00");
    assert.equal(formatMoney(BigInt(1000), "not-a-currency", "en-US"), "10.00 not-a-currency");
  });
});

describe("toDecimalString", () => {
  it("places the decimal point by the number of fraction digits", () => {
    assert.equal(toDecimalString(BigInt(12345), 2), "123.45");
    assert.equal(toDecimalString(BigInt(7), 3), "0.007");
    assert.equal(toDecimalString(BigInt(-7), 0), "-7");
  });
});
