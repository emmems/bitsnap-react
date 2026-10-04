import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampQuantity, isLineSelectable, toSelectedLines } from "./selection.ts";

describe("quantity selection", () => {
  it("clamps typed quantities to 0..available", () => {
    assert.equal(clampQuantity(5, 3), 3);
    assert.equal(clampQuantity(-2, 3), 0);
    assert.equal(clampQuantity(1.9, 3), 1);
    assert.equal(clampQuantity(Number.NaN, 3), 0);
    assert.equal(clampQuantity(2, 0), 0);
  });

  it("only lets eligible lines with quantity left be selected", () => {
    assert.equal(isLineSelectable({ eligible: true, availableQuantity: 1 }), true);
    assert.equal(isLineSelectable({ eligible: false, availableQuantity: 1 }), false);
    assert.equal(isLineSelectable({ eligible: true, availableQuantity: 0 }), false);
  });

  it("keeps positive quantities in line order", () => {
    assert.deepEqual(
      toSelectedLines(["a", "b", "c"], { c: 1, a: 2, b: 0 }),
      [
        { lineId: "a", quantity: 2 },
        { lineId: "c", quantity: 1 },
      ],
    );
  });
});
