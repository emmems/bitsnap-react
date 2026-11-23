import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setHost } from "../panel/config";
import { knownPanelOrigin, loadPanelOrigin, parsePanelOrigin, resetPanelOriginCache } from "./panel-origin";
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

describe("the panel login's challenge origin", () => {
  const API = "https://bitsnap.pl";
  const PANEL = "https://konto.bitsnap.pl";
  const message = { type: "bitsnap:turnstile", action: "panel_login", token: "t" };

  it("takes the widget's message from the panel origin only, once the server has one", () => {
    assert.deepEqual(parseTurnstileMessage(PANEL, message, "panel_login", PANEL), { kind: "token", token: "t" });
    assert.equal(parseTurnstileMessage(API, message, "panel_login", PANEL), null);
    assert.equal(parseTurnstileMessage("https://evil.example", message, "panel_login", PANEL), null);
    assert.equal(parseTurnstileMessage("*", message, "panel_login", PANEL), null);
    assert.equal(parseTurnstileMessage("https://konto.bitsnap.pl.evil.example", message, "panel_login", PANEL), null);
  });

  it("keeps today's origin when there is no panel origin", () => {
    assert.deepEqual(parseTurnstileMessage(API, message, "panel_login", API), { kind: "token", token: "t" });
    assert.equal(parseTurnstileMessage(PANEL, message, "panel_login", API), null);
  });

  it("builds the challenge URL on the panel origin", () => {
    const url = new URL(challengeUrl(PANEL, "panel_login", "pl", "https://shop.example"));
    assert.equal(url.origin, PANEL);
    assert.equal(url.pathname, "/challenge");
    assert.equal(url.searchParams.get("action"), "panel_login");
    assert.equal(url.searchParams.get("origin"), "https://shop.example");
  });

  it("accepts only an exact origin from the API", () => {
    assert.equal(parsePanelOrigin({ panelOrigin: PANEL }, API), PANEL);
    assert.equal(parsePanelOrigin({ panelOrigin: "" }, API), "");
    assert.equal(parsePanelOrigin({}, API), "");
    assert.equal(parsePanelOrigin(null, API), "");
    assert.equal(parsePanelOrigin({ panelOrigin: 5 }, API), "");
    assert.equal(parsePanelOrigin({ panelOrigin: `${PANEL}/path` }, API), "");
    assert.equal(parsePanelOrigin({ panelOrigin: `${PANEL}/` }, API), "");
    assert.equal(parsePanelOrigin({ panelOrigin: "javascript:alert(1)" }, API), "");
    assert.equal(parsePanelOrigin({ panelOrigin: "http://konto.bitsnap.pl" }, API), "", "no downgrade from an https API");
    assert.equal(parsePanelOrigin({ panelOrigin: "http://localhost:4322" }, "http://localhost:4321"), "http://localhost:4322");
  });

  it("asks once per API origin, shares a request in flight, and keeps a successful answer for the page", async () => {
    resetPanelOriginCache();
    let calls = 0;
    const fetchImpl = (async (input: string) => { calls += 1; assert.equal(input, `${API}/api/panel-origin`); return new Response(JSON.stringify({ panelOrigin: PANEL })); }) as unknown as typeof fetch;
    assert.equal(knownPanelOrigin(API), undefined);
    const both = await Promise.all([loadPanelOrigin(API, fetchImpl), loadPanelOrigin(API, fetchImpl)]);
    assert.deepEqual(both, [PANEL, PANEL]);
    assert.equal(calls, 1, "concurrent lookups share one request");
    assert.equal(knownPanelOrigin(API), PANEL);
    assert.equal(await loadPanelOrigin(API, fetchImpl), PANEL);
    assert.equal(calls, 1, "a kept answer is not asked again");
    resetPanelOriginCache();
  });

  it("keeps a valid empty answer (the server has no panel origin) for the page", async () => {
    resetPanelOriginCache();
    let calls = 0;
    const fetchImpl = (async () => { calls += 1; return new Response(JSON.stringify({ panelOrigin: "" })); }) as unknown as typeof fetch;
    assert.equal(await loadPanelOrigin(API, fetchImpl), "");
    assert.equal(knownPanelOrigin(API), "");
    assert.equal(await loadPanelOrigin(API, fetchImpl), "");
    assert.equal(calls, 1);
    resetPanelOriginCache();
  });

  it("does not keep a failed answer: the lookup is \"\" and the next lookup asks again", async () => {
    let answer: () => Response = () => { throw new TypeError("offline"); };
    let calls = 0;
    const fetchImpl = (async () => { calls += 1; return answer(); }) as unknown as typeof fetch;
    const failures: Array<[string, () => Response]> = [
      ["a network error", () => { throw new TypeError("offline"); }],
      ["a 404 from an older server", () => new Response("not found", { status: 404 })],
      ["a 503", () => new Response("nope", { status: 503 })],
      ["a body that is not JSON", () => new Response("<html>", { status: 200 })],
    ];
    for (const [name, failure] of failures) {
      resetPanelOriginCache();
      calls = 0;
      answer = failure;
      assert.equal(await loadPanelOrigin(API, fetchImpl), "", `${name} frames the API origin`);
      assert.equal(calls, 1, name);
      assert.equal(knownPanelOrigin(API), undefined, `${name} is not kept`);
      answer = () => new Response(JSON.stringify({ panelOrigin: PANEL }));
      assert.equal(await loadPanelOrigin(API, fetchImpl), PANEL, `${name}: the next lookup asks again`);
      assert.equal(calls, 2, name);
      assert.equal(knownPanelOrigin(API), PANEL);
      await loadPanelOrigin(API, fetchImpl);
      assert.equal(calls, 2, `${name}: the later success is kept`);
    }
    resetPanelOriginCache();
  });
});

