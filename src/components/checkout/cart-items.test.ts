import assert from "node:assert/strict";
import { test } from "node:test";
import { findMissingProductIDs, findProductForCartItem } from "./cart-items";

const products = [
  { id: "prodv2_a", variants: [] },
  { id: "prodv2_b_default", variants: [{ id: "prodv2_b_red" }] },
  { id: "prodv2_c", variants: null },
];

test("findProductForCartItem matches the product id", () => {
  assert.equal(findProductForCartItem("prodv2_a", products)?.id, "prodv2_a");
  assert.equal(findProductForCartItem("prodv2_c", products)?.id, "prodv2_c");
});

test("findProductForCartItem matches a variant id", () => {
  assert.equal(
    findProductForCartItem("prodv2_b_red", products)?.id,
    "prodv2_b_default",
  );
});

test("findProductForCartItem returns undefined for an unknown id", () => {
  assert.equal(findProductForCartItem("prodv2_x", products), undefined);
  assert.equal(findProductForCartItem("prodv2_a", undefined), undefined);
});

test("findMissingProductIDs lists unresolved ids once", () => {
  assert.deepEqual(
    findMissingProductIDs(
      ["prodv2_a", "prodv2_x", "prodv2_x", "prodv2_b_red"],
      [{ productID: "prodv2_a" }, { productID: "prodv2_b_red" }],
    ),
    ["prodv2_x"],
  );
  assert.deepEqual(findMissingProductIDs(["prodv2_a"], []), ["prodv2_a"]);
  assert.deepEqual(
    findMissingProductIDs(["prodv2_a"], [{ productID: "prodv2_a" }]),
    [],
  );
});
