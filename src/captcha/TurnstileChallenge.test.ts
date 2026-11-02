import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setHost } from "../panel/config";
import { challengeOrigin, parseTurnstileMessage } from "./TurnstileChallenge";

describe("Turnstile challenge protocol", () => {
  it("uses the configured host origin for challenges and rejects production messages on staging", () => {
    setHost("http://localhost:4321/path/");
    try {
      assert.equal(challengeOrigin(), "http://localhost:4321");
      const message = { type: "bitsnap:turnstile", action: "free_chat_claim", token: "test" };
      assert.equal(parseTurnstileMessage("https://bitsnap.pl", message, "free_chat_claim"), null);
      assert.deepEqual(parseTurnstileMessage("http://localhost:4321", message, "free_chat_claim"), { kind: "token", token: "test" });
      assert.equal(challengeOrigin("javascript:alert(1)"), "https://bitsnap.pl");
    } finally { setHost(undefined as unknown as string); }
  });

  it("accepts messages only from the Bitsnap origin and expected action/shape", () => {
    const accepted: string[] = [];
    const action = "panel_login";
    const receive = (origin: string, data: unknown) => {
      const result = parseTurnstileMessage(origin, data, action);
      if (result?.kind === "token") accepted.push(result.token);
      return result;
    };
    assert.equal(receive("https://evil.example", { type: "bitsnap:turnstile", action, token: "bad" }), null);
    assert.equal(receive("https://bitsnap.pl", { type: "bitsnap:turnstile", action: "free_chat_claim", token: "bad" }), null);
    assert.equal(receive("https://bitsnap.pl", { type: "bitsnap:turnstile", action, token: "" }), null);
    assert.deepEqual(receive("https://bitsnap.pl", { type: "bitsnap:turnstile", action, failure: true }), { kind: "failure" });
    assert.deepEqual(receive("https://bitsnap.pl", { type: "bitsnap:turnstile", action, token: "retry-token" }), { kind: "token", token: "retry-token" });
    assert.deepEqual(accepted, ["retry-token"]);
  });
});
