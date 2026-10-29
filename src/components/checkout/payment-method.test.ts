import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectivePaymentMethod,
  manualPaymentTitleKey,
  parsePaymentMethodChoice,
} from "./payment-method.ts";

describe("parsePaymentMethodChoice", () => {
  it("reads the choice and keeps the seller's order", () => {
    assert.deepEqual(
      parsePaymentMethodChoice({
        success: true,
        choice: { methods: ["manual", "online"], manualAccountTypes: ["bankTransfer", "blik"] },
      }),
      { methods: ["manual", "online"], manualAccountTypes: ["bankTransfer", "blik"] },
    );
  });

  it("is null when there is nothing to choose", () => {
    for (const body of [
      { success: true, choice: null },
      { success: true },
      { success: false, error: "x" },
      null,
      "text",
      { choice: { methods: ["online"] } },
      { choice: { methods: ["online", "online"] } },
      { choice: { methods: ["online", "cash"] } },
      { choice: { methods: "online,manual" } },
    ]) {
      assert.equal(parsePaymentMethodChoice(body), null, JSON.stringify(body));
    }
  });

  it("drops unknown and repeated account types", () => {
    assert.deepEqual(
      parsePaymentMethodChoice({
        choice: { methods: ["online", "manual"], manualAccountTypes: ["blik", "cash", "blik"] },
      }),
      { methods: ["online", "manual"], manualAccountTypes: ["blik"] },
    );
  });
});

describe("effectivePaymentMethod", () => {
  const choice = { methods: ["manual", "online"] as const, manualAccountTypes: [] };
  it("defaults to the first method and keeps an offered pick", () => {
    assert.equal(effectivePaymentMethod({ ...choice, methods: [...choice.methods] }, undefined), "manual");
    assert.equal(effectivePaymentMethod({ ...choice, methods: [...choice.methods] }, "online"), "online");
  });
});

describe("manualPaymentTitleKey", () => {
  it("names the account types", () => {
    assert.equal(manualPaymentTitleKey(["bankTransfer"]), "paymentMethodManualTransfer");
    assert.equal(manualPaymentTitleKey(["blik"]), "paymentMethodManualBlik");
    assert.equal(manualPaymentTitleKey(["bankTransfer", "blik"]), "paymentMethodManualBoth");
    assert.equal(manualPaymentTitleKey([]), "paymentMethodManualBoth");
  });
});
