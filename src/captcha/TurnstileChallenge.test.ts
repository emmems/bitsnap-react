import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTurnstileMessage } from "./TurnstileChallenge";

describe("Turnstile challenge protocol", () => {
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
