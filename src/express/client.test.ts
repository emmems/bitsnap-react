import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  CART_TOKEN_HEADER,
  expressApiUrl,
  fetchExpressAvailability,
  fetchInpostPayStatus,
  fetchRevolutPayStatus,
  readExpressCart,
  resetExpressClientWarnings,
  startExpressProvider,
  writeExpressCart,
} from "./client";

const PROJECT = "proj1";
const HOST = "https://shop.example.test";
const options = { projectID: PROJECT, host: HOST };

type Call = { url: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fetchStub(responses: Array<() => Response | Promise<Response>>) {
  const calls: Call[] = [];
  let index = 0;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next();
  };
  return { fetch: fetchImpl as typeof globalThis.fetch, calls };
}

const snapshot = {
  cartId: "cart-1",
  revision: 3,
  status: "open",
  environment: "test",
  currency: "PLN",
  locale: "pl-PL",
  lines: [],
  subtotalMinor: 1000,
  deliveryMinor: 0,
  discountMinor: 0,
  totalMinor: 1000,
  expiresAt: 1,
};

beforeEach(() => {
  resetExpressClientWarnings();
});

describe("express API client", () => {
  it("builds the documented route and encodes the hashed project id", () => {
    assert.equal(
      expressApiUrl("https://bitsnap.pl/", "a/b", "/cart"),
      "https://bitsnap.pl/api/integrations/a%2Fb/public-commerce/express/cart",
    );
  });

  it("returns availability and hides everything on an old backend", async () => {
    const provider = {
      available: true,
      environment: "test",
      reasons: [],
      publicConfig: { merchantClientId: "mc" },
    };
    const fetchable = fetchStub([
      () =>
        jsonResponse({
          success: true,
          environment: "test",
          providers: { inpostPay: provider, revolutPay: provider, adyen: provider },
        }),
    ]);
    const result = await fetchExpressAvailability(
      { ...options, fetch: fetchable.fetch },
      { items: [{ id: "p1", quantity: 1 }] },
    );
    assert.equal(result?.providers.inpostPay.publicConfig?.merchantClientId, "mc");
    assert.equal(fetchable.calls[0].url.endsWith("/express/availability"), true);
    assert.equal(fetchable.calls[0].init.method, "POST");

    const old = fetchStub([() => new Response("<html>not found</html>", { status: 404 })]);
    assert.equal(
      await fetchExpressAvailability(
        { ...options, fetch: old.fetch },
        { items: [{ id: "p1", quantity: 1 }] },
      ),
      undefined,
    );

    const notImplemented = fetchStub([
      () => jsonResponse({ success: false, code: "not-implemented" }, 501),
    ]);
    assert.equal(
      await fetchExpressAvailability(
        { ...options, fetch: notImplemented.fetch },
        { items: [{ id: "p1", quantity: 1 }] },
      ),
      undefined,
    );

    const network = fetchStub([
      () => {
        throw new Error("offline");
      },
    ]);
    assert.equal(
      await fetchExpressAvailability(
        { ...options, fetch: network.fetch },
        { items: [{ id: "p1", quantity: 1 }] },
      ),
      undefined,
    );
  });

  it("creates a cart with the body only and keeps the token in a header", async () => {
    const fetchable = fetchStub([
      () => jsonResponse({ success: true, cartToken: "tok", snapshot }),
    ]);
    const result = await writeExpressCart(
      { ...options, fetch: fetchable.fetch },
      { items: [{ id: "p1", quantity: 2 }], locale: "pl-PL" },
    );
    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.cartToken : undefined, "tok");
    const body = JSON.parse(String(fetchable.calls[0].init.body));
    assert.deepEqual(body.items, [{ id: "p1", quantity: 2 }]);
    assert.equal("cartId" in body, false);
    const headers = fetchable.calls[0].init.headers as Record<string, string>;
    assert.equal(CART_TOKEN_HEADER in headers, false);
  });

  it("updates a cart with the revision and the capability header", async () => {
    const fetchable = fetchStub([
      () => jsonResponse({ success: true, snapshot: { ...snapshot, revision: 4 } }),
    ]);
    await writeExpressCart(
      { ...options, fetch: fetchable.fetch },
      { items: [{ id: "p1", quantity: 2 }] },
      { cartId: "cart-1", cartToken: "tok", expectedRevision: 3 },
    );
    const body = JSON.parse(String(fetchable.calls[0].init.body));
    assert.equal(body.cartId, "cart-1");
    assert.equal(body.expectedRevision, 3);
    const headers = fetchable.calls[0].init.headers as Record<string, string>;
    assert.equal(headers[CART_TOKEN_HEADER], "tok");
  });

  it("reports a revision conflict with the newer snapshot", async () => {
    const fetchable = fetchStub([
      () =>
        jsonResponse(
          {
            success: false,
            code: "revision-conflict",
            message: "newer revision",
            currentRevision: 7,
            snapshot: { ...snapshot, revision: 7 },
          },
          409,
        ),
    ]);
    const result = await writeExpressCart(
      { ...options, fetch: fetchable.fetch },
      { items: [{ id: "p1", quantity: 1 }] },
      { cartId: "cart-1", cartToken: "tok", expectedRevision: 3 },
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.code : "", "revision-conflict");
    assert.equal(result.ok === false ? result.currentRevision : undefined, 7);
    assert.equal(result.ok === false ? result.snapshot?.revision : undefined, 7);
  });

  it("reads a snapshot only with the token and maps a refusal", async () => {
    const fetchable = fetchStub([
      () => jsonResponse({ success: true, snapshot }),
      () => jsonResponse({ success: false, code: "cart-forbidden" }, 403),
    ]);
    const ok = await readExpressCart({ ...options, fetch: fetchable.fetch }, "cart-1", "tok");
    assert.equal(ok.ok, true);
    const headers = fetchable.calls[0].init.headers as Record<string, string>;
    assert.equal(headers[CART_TOKEN_HEADER], "tok");

    const refused = await readExpressCart(
      { ...options, fetch: fetchable.fetch },
      "cart-1",
      "tok",
    );
    assert.equal(refused.ok === false ? refused.code : "", "cart-forbidden");
  });

  it("maps a 501 start to not-implemented and never invents a redirect", async () => {
    const fetchable = fetchStub([
      () =>
        jsonResponse(
          {
            success: false,
            provider: "inpostPay",
            code: "not-implemented",
            message: "nope",
          },
          501,
        ),
    ]);
    const result = await startExpressProvider(
      { ...options, fetch: fetchable.fetch },
      "inpostPay",
      { cartId: "cart-1", cartToken: "tok" },
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.code : "", "not-implemented");
    assert.equal(fetchable.calls[0].url.endsWith("/express/inpost/start"), true);
  });

  it("returns the public start data of Revolut Pay", async () => {
    const fetchable = fetchStub([
      () =>
        jsonResponse({
          success: true,
          provider: "revolutPay",
          redirectUrl: "https://shop.example.test/return",
          providerOrderId: "order-1",
          cartRevision: 4,
          publicConfig: {
            publicKey: "pk_test",
            mode: "sandbox",
            orderToken: "token-1",
          },
        }),
    ]);
    const result = await startExpressProvider(
      { ...options, fetch: fetchable.fetch },
      "revolutPay",
      { cartId: "cart-1", cartToken: "tok", returnUrl: "https://shop.example.test/return" },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.providerOrderId, "order-1");
      assert.equal(result.value.cartRevision, 4);
      assert.equal(result.value.publicConfig?.orderToken, "token-1");
    }
    const body = JSON.parse(String(fetchable.calls[0].init.body));
    assert.equal(body.returnUrl, "https://shop.example.test/return");
    assert.equal(body.cartToken, undefined, "the capability must not be in the body");
  });

  it("reads the server-confirmed Revolut status", async () => {
    const fetchable = fetchStub([
      () =>
        jsonResponse({
          success: true,
          provider: "revolutPay",
          status: "completed",
          orderId: "order-1",
        }),
      () => jsonResponse({ success: false, provider: "revolutPay", code: "not-implemented" }, 501),
    ]);
    const completed = await fetchRevolutPayStatus(
      { ...options, fetch: fetchable.fetch },
      "cart-1",
      "tok",
    );
    assert.deepEqual(completed, {
      ok: true,
      status: "completed",
      orderId: "order-1",
    });
    const old = await fetchRevolutPayStatus(
      { ...options, fetch: fetchable.fetch },
      "cart-1",
      "tok",
    );
    assert.equal(old.ok === false ? old.code : "", "not-implemented");
  });

  it("reads the server-confirmed InPost status and tolerates an old backend", async () => {
    const fetchable = fetchStub([
      () =>
        jsonResponse({
          success: true,
          provider: "inpostPay",
          status: "completed",
          orderId: "order-1",
        }),
      () =>
        jsonResponse(
          { success: false, provider: "inpostPay", code: "not-implemented" },
          501,
        ),
    ]);
    const completed = await fetchInpostPayStatus(
      { ...options, fetch: fetchable.fetch },
      "cart-1",
      "tok",
    );
    assert.deepEqual(completed, {
      ok: true,
      status: "completed",
      orderId: "order-1",
    });
    assert.equal(fetchable.calls[0].url.endsWith("/express/inpost/status"), true);
    const old = await fetchInpostPayStatus(
      { ...options, fetch: fetchable.fetch },
      "cart-1",
      "tok",
    );
    assert.equal(old.ok === false ? old.code : "", "not-implemented");
  });

  it("maps conflict details of a rejected revision", async () => {
    const fetchable = fetchStub([
      () =>
        jsonResponse(
          {
            success: false,
            code: "revision-conflict",
            message: "newer",
            currentRevision: 4,
            snapshot: { ...snapshot, revision: 4 },
            conflicts: [{ id: "p1", base: 1, local: 3, server: 2 }],
          },
          409,
        ),
    ]);
    const result = await writeExpressCart(
      { ...options, fetch: fetchable.fetch },
      { items: [{ id: "p1", quantity: 3 }] },
      { cartId: "cart-1", cartToken: "tok", expectedRevision: 3 },
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.ok === false ? result.conflicts : undefined, [
      { id: "p1", base: 1, local: 3, server: 2 },
    ]);
  });

  it("sends the delivery quote in the cart body", async () => {
    const fetchable = fetchStub([
      () => jsonResponse({ success: true, snapshot }),
    ]);
    await writeExpressCart(
      { ...options, fetch: fetchable.fetch },
      {
        items: [{ id: "p1", quantity: 1 }],
        delivery: [
          { name: "courier", min: 1, max: 2, price: 15 },
        ],
        deliveryMethod: "courier",
      },
    );
    const body = JSON.parse(String(fetchable.calls[0].init.body));
    assert.deepEqual(body.delivery, [
      { name: "courier", min: 1, max: 2, price: 15 },
    ]);
    assert.equal(body.deliveryMethod, "courier");
  });

  it("treats a broken JSON answer as a typed failure", async () => {
    const fetchable = fetchStub([() => new Response("{not json", { status: 200 })]);
    const result = await writeExpressCart(
      { ...options, fetch: fetchable.fetch },
      { items: [{ id: "p1", quantity: 1 }] },
    );
    assert.equal(result.ok, false);
  });
});
