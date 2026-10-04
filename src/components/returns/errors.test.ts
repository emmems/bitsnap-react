import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getReturnsErrorCode,
  isSessionExpiredError,
  mapReturnsError,
} from "./errors.ts";
import { RETURNS_TEXT_TABLES } from "./texts.ts";

describe("returns error mapping", () => {
  it("maps backend codes from rawMessage to text keys", () => {
    assert.equal(mapReturnsError({ rawMessage: "INVALID_EMAIL" }), "errorInvalidEmail");
    assert.equal(
      mapReturnsError({ rawMessage: "INVALID_OR_EXPIRED_CODE" }),
      "errorInvalidCode",
    );
    assert.equal(
      mapReturnsError({ rawMessage: "QUANTITY_UNAVAILABLE" }),
      "errorQuantityUnavailable",
    );
    assert.equal(
      mapReturnsError({ rawMessage: "SUBMISSION_RATE_LIMITED" }),
      "errorRateLimited",
    );
    assert.equal(mapReturnsError({ rawMessage: "SESSION_EXPIRED" }), "errorSessionExpired");
  });

  it("finds a code inside a formatted message when rawMessage is missing", () => {
    assert.equal(
      getReturnsErrorCode(new Error("[unauthenticated] SESSION_EXPIRED")),
      "SESSION_EXPIRED",
    );
  });

  it("falls back to the generic message", () => {
    assert.equal(mapReturnsError({ rawMessage: "SOMETHING_NEW" }), "errorGeneric");
    assert.equal(mapReturnsError(new Error("network down")), "errorGeneric");
    assert.equal(mapReturnsError(undefined), "errorGeneric");
    assert.equal(mapReturnsError("boom"), "errorGeneric");
  });

  it("only treats SESSION_EXPIRED as an expired session", () => {
    assert.equal(isSessionExpiredError({ rawMessage: "SESSION_EXPIRED" }), true);
    assert.equal(isSessionExpiredError({ rawMessage: "ORDER_NOT_FOUND" }), false);
    assert.equal(isSessionExpiredError(null), false);
  });

  it("only returns keys that exist in the text tables", () => {
    for (const code of [
      "INVALID_EMAIL",
      "INVALID_OR_EXPIRED_CODE",
      "SESSION_EXPIRED",
      "ORDER_NOT_FOUND",
      "RETURN_NOT_FOUND",
      "QUANTITY_UNAVAILABLE",
      "ITEM_NOT_RETURNABLE",
      "INVALID_RETURN_ITEMS",
      "RETURNS_DISABLED",
      "SUBMISSION_RATE_LIMITED",
      "IDEMPOTENCY_CONFLICT",
      "VERIFICATION_DELIVERY_FAILED",
    ]) {
      assert.ok(mapReturnsError({ rawMessage: code }) in RETURNS_TEXT_TABLES.en);
    }
  });
});
