import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pollRevolutStatus, readRevolutPublicConfig, revolutOrderToken } from "./revolut";
import type { RevolutPayStatus } from "./contracts";

function queue(statuses: RevolutPayStatus[]) {
  return async () => {
    const next = statuses.shift();
    assert.ok(next != null, "unexpected extra status request");
    return next;
  };
}

const sleeps: number[] = [];
const instantSleep = async (ms: number) => {
  sleeps.push(ms);
};

describe("Revolut Pay contract helpers", () => {
  it("accepts only a complete public configuration", () => {
    assert.deepEqual(
      readRevolutPublicConfig({
        publicKey: "pk_test",
        mode: "sandbox",
        orderToken: "token",
      }),
      { publicKey: "pk_test", mode: "sandbox", orderToken: "token" },
    );
    assert.deepEqual(readRevolutPublicConfig({ publicKey: "pk", mode: "prod" }), {
      publicKey: "pk",
      mode: "prod",
    });
    assert.equal(readRevolutPublicConfig({ mode: "prod" }), undefined);
    assert.equal(readRevolutPublicConfig({ publicKey: "pk", mode: "live" }), undefined);
    assert.equal(readRevolutPublicConfig(undefined), undefined);
  });

  it("returns the documented createOrder token", () => {
    assert.equal(
      revolutOrderToken({
        providerOrderId: "order-id",
        publicConfig: { orderToken: "token" },
      }),
      "token",
    );
    assert.equal(revolutOrderToken({ providerOrderId: "order-id" }), "order-id");
  });
});

describe("Revolut Pay confirmation polling", () => {
  it("stops as soon as the server confirms a payment", async () => {
    const status = await pollRevolutStatus({
      check: queue([
        { ok: true, status: "pending" },
        { ok: true, status: "completed", orderId: "order-1" },
      ]),
      sleep: instantSleep,
      intervalMs: 10,
      timeoutMs: 1000,
      now: () => 0,
    });
    assert.equal(status?.ok, true);
    assert.equal(status?.ok ? status.status : "", "completed");
  });

  it("keeps a timeout pending instead of claiming a payment", async () => {
    let elapsed = 0;
    const status = await pollRevolutStatus({
      check: async () => ({ ok: true, status: "pending" }),
      sleep: async () => {
        elapsed += 10;
      },
      intervalMs: 10,
      timeoutMs: 25,
      now: () => elapsed,
    });
    assert.equal(status?.ok ? status.status : "", "pending");
  });

  it("does not spin against a backend without the status route", async () => {
    let calls = 0;
    const status = await pollRevolutStatus({
      check: async () => {
        calls += 1;
        return { ok: false, code: "not-implemented", message: "old" };
      },
      sleep: instantSleep,
      timeoutMs: 10_000,
      now: () => 0,
    });
    assert.equal(calls, 1);
    assert.equal(status?.ok, false);
  });

  it("stops on abort", async () => {
    const controller = new AbortController();
    const status = await pollRevolutStatus({
      check: async () => {
        controller.abort();
        return { ok: true, status: "pending" };
      },
      sleep: instantSleep,
      signal: controller.signal,
    });
    assert.equal(status?.ok ? status.status : "", "pending");
  });
});
