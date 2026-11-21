import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPACT_QUERY, resolvePresentation } from "./presentation";

describe("resolvePresentation", () => {
  it("defaults to the drawer and keeps the two known values", () => {
    assert.equal(resolvePresentation(undefined), "drawer");
    assert.equal(resolvePresentation("drawer"), "drawer");
    assert.equal(resolvePresentation("dialog"), "dialog");
  });

  it("falls back to the drawer for anything else, without throwing", () => {
    for (const value of ["left", "Dialog", "", null, 42, {}, true]) {
      assert.equal(resolvePresentation(value), "drawer", `for ${JSON.stringify(value)}`);
    }
  });

  it("names the compact layout of PLAN D8: phones, also in landscape", () => {
    assert.equal(COMPACT_QUERY, "(max-width: 639.98px), (max-height: 500px)");
  });
});
