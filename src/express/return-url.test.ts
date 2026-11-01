import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readExpressReturn,
  withoutExpressReturn,
  withExpressReturn,
} from "./return-url";

describe("express return markers", () => {
  it("round-trips the provider, cart and result of a mobile return", () => {
    const url = withExpressReturn("https://shop.example.test/cart", {
      provider: "revolutPay",
      cartId: "cart-1",
      result: "success",
    });
    assert.equal(url.startsWith("https://shop.example.test/cart?"), true);
    const parsed = readExpressReturn(new URL(url).search);
    assert.deepEqual(parsed, {
      returned: true,
      provider: "revolutPay",
      cartId: "cart-1",
      result: "success",
    });
  });

  it("recognises Revolut's own _rp_oid without trusting it", () => {
    const parsed = readExpressReturn("?_rp_oid=public-order-token");
    assert.equal(parsed.returned, true);
    assert.equal(parsed.provider, undefined);
    assert.equal(parsed.orderToken, "public-order-token");
  });

  it("ignores an unrelated query", () => {
    assert.deepEqual(readExpressReturn("?utm_source=news"), { returned: false });
  });

  it("removes only the flow markers", () => {
    const cleaned = withoutExpressReturn(
      "https://shop.example.test/cart?keep=1&_rp_oid=token&bitsnap_express=revolutPay&bitsnap_express_cart=cart-1&bitsnap_express_result=success",
    );
    assert.equal(cleaned, "/cart?keep=1");
  });
});
