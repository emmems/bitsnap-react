import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampQuantity, quantityFromInput } from "./quantity.ts";

describe("clampQuantity", () => {
  it("keeps 1..99", () => {
    assert.equal(clampQuantity(0), 1);
    assert.equal(clampQuantity(-4), 1);
    assert.equal(clampQuantity(1), 1);
    assert.equal(clampQuantity(42), 42);
    assert.equal(clampQuantity(99), 99);
    assert.equal(clampQuantity(100), 99);
    assert.equal(clampQuantity(2.9), 2);
    assert.equal(clampQuantity(NaN), 1);
  });
});

describe("quantityFromInput", () => {
  it("clamps what was typed", () => {
    assert.equal(quantityFromInput("7", 1), 7);
    assert.equal(quantityFromInput("0", 3), 1);
    assert.equal(quantityFromInput("-5", 3), 1);
    assert.equal(quantityFromInput("1000", 3), 99);
  });

  it("keeps the current quantity for an empty or non-numeric value", () => {
    assert.equal(quantityFromInput("", 4), 4);
    assert.equal(quantityFromInput("abc", 4), 4);
  });
});
