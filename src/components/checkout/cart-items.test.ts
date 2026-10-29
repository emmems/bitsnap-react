import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cartItemURL,
  findMissingProductIDs,
  findProductForCartItem,
} from "./cart-items";

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

test("cartItemURL keeps http(s) links and resolves relative ones", () => {
  assert.equal(
    cartItemURL("https://shop.example.com/p/a"),
    "https://shop.example.com/p/a",
  );
  assert.equal(
    cartItemURL("/p/a", "https://shop.example.com/catalog"),
    "https://shop.example.com/p/a",
  );
  assert.equal(
    cartItemURL(" p/a ", "http://shop.example.com/catalog/"),
    "http://shop.example.com/catalog/p/a",
  );
});

test("cartItemURL drops empty, unsafe and unresolvable links", () => {
  assert.equal(cartItemURL(undefined), undefined);
  assert.equal(cartItemURL("  "), undefined);
  assert.equal(cartItemURL("javascript:alert(1)"), undefined);
  assert.equal(cartItemURL("JavaScript:alert(1)", "https://a.example"), undefined);
  assert.equal(cartItemURL("data:text/html,x"), undefined);
  assert.equal(cartItemURL("/p/a"), undefined);
});
