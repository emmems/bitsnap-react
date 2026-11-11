import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setHost } from "../panel/config";
import { challengeOrigin, challengeUrl, parseTurnstileMessage } from "./TurnstileChallenge";

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

  it("appends formContext and attempt to the challenge URL only when given", () => {
    const plain = new URL(challengeUrl("https://bitsnap.pl", "panel_login", "pl", "https://merchant.example"));
    assert.equal(plain.pathname, "/challenge");
    assert.equal(plain.searchParams.get("action"), "panel_login");
    assert.equal(plain.searchParams.get("origin"), "https://merchant.example");
    assert.equal(plain.searchParams.has("formContext"), false);
    assert.equal(plain.searchParams.has("attempt"), false);
    const bound = new URL(challengeUrl("https://bitsnap.pl", "contact_submit", "en", "https://merchant.example", { formContext: "form_abc", attempt: "a-1_b" }));
    assert.equal(bound.searchParams.get("action"), "contact_submit");
    assert.equal(bound.searchParams.get("formContext"), "form_abc");
    assert.equal(bound.searchParams.get("attempt"), "a-1_b");
  });

  it("ignores messages for another form or attempt when bound, and keeps unbound actions unchanged", () => {
    const action = "contact_submit";
    const binding = { formContext: "form_abc", attempt: "try1" };
    const base = { type: "bitsnap:turnstile", action, token: "t" };
    const parse = (data: unknown) => parseTurnstileMessage("https://bitsnap.pl", data, action, "https://bitsnap.pl", binding);
    assert.deepEqual(parse({ ...base, formContext: "form_abc", attempt: "try1" }), { kind: "token", token: "t" });
    assert.deepEqual(parse({ type: base.type, action, formContext: "form_abc", attempt: "try1", failure: true }), { kind: "failure" });
    assert.equal(parse(base), null);
    assert.equal(parse({ ...base, formContext: "form_other", attempt: "try1" }), null);
    assert.equal(parse({ ...base, formContext: "form_abc", attempt: "try2" }), null);
    assert.deepEqual(parseTurnstileMessage("https://bitsnap.pl", { type: "bitsnap:turnstile", action: "panel_login", token: "p" }, "panel_login"), { kind: "token", token: "p" });
    assert.deepEqual(parseTurnstileMessage("https://bitsnap.pl", { type: "bitsnap:turnstile", action: "panel_login", token: "p", formContext: "x", attempt: "y" }, "panel_login"), { kind: "token", token: "p" });
  });
});
