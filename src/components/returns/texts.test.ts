import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fillText,
  getReturnsText,
  refundStatusTextKey,
  resolveReturnsTexts,
  RETURNS_TEXT_TABLES,
  statusTextKey,
} from "./texts.ts";

describe("returns texts", () => {
  it("has the same keys and no empty strings in both locales", () => {
    assert.deepEqual(
      Object.keys(RETURNS_TEXT_TABLES.pl).sort(),
      Object.keys(RETURNS_TEXT_TABLES.en).sort(),
    );
    for (const table of [RETURNS_TEXT_TABLES.pl, RETURNS_TEXT_TABLES.en]) {
      for (const [key, value] of Object.entries(table)) {
        assert.ok(value.length > 0, `${key} is empty`);
      }
    }
  });

  it("falls back to Polish for unknown locales and uses English for en-*", () => {
    assert.equal(getReturnsText("back", "pl-PL"), "Wstecz");
    assert.equal(getReturnsText("back", "de-DE"), "Wstecz");
    assert.equal(getReturnsText("back", "en-GB"), "Back");
  });

  it("applies overrides whatever the locale and keeps the other keys", () => {
    const texts = resolveReturnsTexts("en-US", {
      emailStepTitle: "Return a product",
      successDescription: undefined,
    });

    assert.equal(texts.emailStepTitle, "Return a product");
    assert.equal(
      texts.successDescription,
      RETURNS_TEXT_TABLES.en.successDescription,
    );
    assert.equal(
      resolveReturnsTexts("pl-PL", { emailStepTitle: "Return a product" })
        .emailStepTitle,
      "Return a product",
    );
  });

  it("fills placeholders and leaves unknown ones", () => {
    assert.equal(fillText("Step {current} of {total}", { current: 2, total: 6 }), "Step 2 of 6");
    assert.equal(fillText("Hi {name}", {}), "Hi {name}");
  });

  it("maps every backend status and falls back for unknown ones", () => {
    const expected: Record<string, string> = {
      submitted: "statusSubmitted",
      approved: "statusApproved",
      rejected: "statusRejected",
      awaiting_receipt: "statusAwaitingReceipt",
      received: "statusReceived",
      completed: "statusCompleted",
      cancelled: "statusCancelled",
      refunded: "statusRefunded",
    };
    for (const [status, key] of Object.entries(expected)) {
      assert.equal(statusTextKey(status), key);
    }
    assert.equal(statusTextKey("brand_new"), "statusFallback");
    assert.equal(refundStatusTextKey("succeeded"), "refundStatusSucceeded");
    assert.equal(refundStatusTextKey("brand_new"), "refundStatusFallback");
  });
});
