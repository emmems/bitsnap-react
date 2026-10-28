import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { resetTracker } from "@/src/analytics/core";
import { setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";

const page = setupReactPage();

let createCheckout: typeof import("./methods.ts").createCheckout;
let createPaymentURL: typeof import("./methods.ts").createPaymentURL;

before(async () => {
  ({ createCheckout, createPaymentURL } = await import("./methods.ts"));
  page.win.document.body.innerHTML = `<script data-id="${TEST_KEY}" data-name="internal-cart"></script>`;
});

const ID = "abcdefghijklmnopqrstuv";
const requests: Array<{ url: string; headers: Record<string, string> }> = [];

function consent(analytics: boolean | null) {
  (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = {
    scope: "global",
    projectKey: null,
    get: () => (analytics === null ? null : { c: { analytics } }),
  };
}

afterEach(() => {
  resetTracker();
  requests.length = 0;
  page.win.document.cookie = `bs_vid_${TEST_KEY}=; Max-Age=0; Path=/`;
  delete (page.win as unknown as { BitsnapConsent?: unknown }).BitsnapConsent;
});

function stubFetch() {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    requests.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } });
    return new Response(JSON.stringify({ url: "https://pay.example.test/x", sessionID: "s" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

describe("X-Bitsnap-Visitor on checkout requests", () => {
  for (const [name, call] of [
    ["createPaymentURL", () => createPaymentURL({ items: [{ id: "p", quantity: 1 }] } as never)],
    ["createCheckout", () => createCheckout({ items: [{ id: "p", quantity: 1 }] } as never)],
  ] as const) {
    it(`${name} sends it only with granted consent and the cookie`, async () => {
      stubFetch();
      page.win.document.cookie = `bs_vid_${TEST_KEY}=${ID}; Path=/`;
      consent(true);
      await call();
      assert.equal(requests[0].headers["X-Bitsnap-Visitor"], ID);
      assert.ok(requests[0].headers["X-Bitsnap-Client"], "the client header stays");

      for (const choice of [false, null]) {
        consent(choice);
        await call();
        assert.ok(!("X-Bitsnap-Visitor" in requests.at(-1)!.headers), `choice ${choice}`);
      }
      delete (page.win as unknown as { BitsnapConsent?: unknown }).BitsnapConsent;
      await call();
      assert.ok(!("X-Bitsnap-Visitor" in requests.at(-1)!.headers), "no banner");

      consent(true);
      page.win.document.cookie = `bs_vid_${TEST_KEY}=; Max-Age=0; Path=/`;
      await call();
      assert.ok(!("X-Bitsnap-Visitor" in requests.at(-1)!.headers), "no cookie");
    });
  }
});

process.on("exit", teardownReactPage);
