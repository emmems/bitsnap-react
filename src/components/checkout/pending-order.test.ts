import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromBinary } from "@bufbuild/protobuf";
import { GetOrderResponseSchema } from "src/gen/proto/public/v1/public_api_pb";
import {
  PENDING_ORDER_KEY,
  PENDING_ORDER_MAX_AGE_MS,
  orderStatusFromResponse,
  parseOrderFromPaymentUrl,
  readPendingOrder,
  reconcilePendingOrder,
  resolvePendingOrder,
  rememberPendingOrder,
  savePendingOrder,
  subtractOrderLines,
  throttleOrderStatus,
  type OrderStatus,
  type PendingOrder,
} from "./pending-order.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const NOW = 1_800_000_000_000;
const LINES = [
  { id: "l1", quantity: 2 },
  { id: "l2", quantity: 1 },
];
const order: PendingOrder = {
  orderId: "ord_1",
  projectId: "pid",
  cartProjectId: "cart-pid",
  lines: LINES,
  ts: NOW - 60_000,
};

function setup(status: OrderStatus | Error, stored: unknown = order) {
  // `null` stores nothing
  const storage = memoryStorage();
  if (stored !== null) {
    storage.values.set(PENDING_ORDER_KEY, typeof stored === "string" ? stored : JSON.stringify(stored));
  }
  const calls = { fetch: [] as PendingOrder[], clear: 0, removed: [] as unknown[] };
  const deps = {
    storage,
    now: () => NOW,
    fetchStatus: async (o: PendingOrder) => {
      calls.fetch.push(o);
      if (status instanceof Error) throw status;
      return status;
    },
    projectId: "cart-pid",
    removeLines: async (lines: unknown) => {
      calls.clear++;
      calls.removed.push(lines);
    },
  };
  return { storage, calls, deps };
}

describe("parseOrderFromPaymentUrl", () => {
  it("reads project and order from the payment page URL", () => {
    assert.deepEqual(parseOrderFromPaymentUrl("https://bitsnap.pl/payment/common/p1d/o2?x=1"), {
      projectId: "p1d",
      orderId: "o2",
    });
    assert.deepEqual(parseOrderFromPaymentUrl("/payment/common/p1d/o2/"), { projectId: "p1d", orderId: "o2" });
  });

  it("ignores other URLs", () => {
    assert.equal(parseOrderFromPaymentUrl("https://pay.example.test/session/abc"), undefined);
    assert.equal(parseOrderFromPaymentUrl("https://bitsnap.pl/payment/manualPayment/p/o"), undefined);
    assert.equal(parseOrderFromPaymentUrl(""), undefined);
    assert.equal(parseOrderFromPaymentUrl(undefined), undefined);
  });
});

describe("resolvePendingOrder", () => {
  it("prefers the ids of the response", () => {
    assert.deepEqual(
      resolvePendingOrder({ url: "https://bitsnap.pl/payment/common/urlP/urlO", orderId: "o", projectId: "p" }, NOW),
      { orderId: "o", projectId: "p", lines: [], ts: NOW },
    );
  });

  it("falls back to the URL, also for a single missing id", () => {
    const url = "https://bitsnap.pl/payment/common/urlP/urlO";
    assert.deepEqual(resolvePendingOrder({ url }, NOW), {
      orderId: "urlO",
      projectId: "urlP",
      lines: [],
      ts: NOW,
    });
    assert.deepEqual(resolvePendingOrder({ url, orderId: "o" }, NOW), {
      orderId: "o",
      projectId: "urlP",
      lines: [],
      ts: NOW,
    });
  });

  it("keeps the cart's project and lines", () => {
    assert.deepEqual(
      resolvePendingOrder({ url: "https://bitsnap.pl/payment/common/p/o" }, NOW, { cartProjectId: "c", lines: LINES }),
      { orderId: "o", projectId: "p", cartProjectId: "c", lines: LINES, ts: NOW },
    );
  });

  it("is undefined when nothing tells the order", () => {
    assert.equal(resolvePendingOrder({ url: "https://pay.example.test/x" }, NOW), undefined);
    assert.equal(resolvePendingOrder({ url: "https://pay.example.test/x", orderId: "o" }, NOW), undefined);
  });
});

describe("pending order storage", () => {
  it("round-trips and drops a broken value", () => {
    const storage = memoryStorage();
    assert.equal(readPendingOrder(storage), undefined);
    assert.equal(savePendingOrder(order, storage), true);
    assert.deepEqual(readPendingOrder(storage), order);
    storage.setItem(PENDING_ORDER_KEY, "{nope");
    assert.equal(readPendingOrder(storage), undefined);
    assert.equal(storage.values.has(PENDING_ORDER_KEY), false);
    storage.setItem(PENDING_ORDER_KEY, JSON.stringify({ orderId: 5 }));
    assert.equal(readPendingOrder(storage), undefined);
    assert.equal(storage.values.has(PENDING_ORDER_KEY), false);
  });
});

describe("reconcilePendingOrder", () => {
  it("does nothing without a pending order", async () => {
    const { calls, deps } = setup("paid", null);
    assert.equal(await reconcilePendingOrder(deps), "none");
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.clear, 0);
  });

  it("clears the cart and the key once paid", async () => {
    const { storage, calls, deps } = setup("paid");
    assert.equal(await reconcilePendingOrder(deps), "paid");
    assert.deepEqual(calls.fetch, [order]);
    assert.equal(calls.clear, 1);
    assert.deepEqual(calls.removed, [LINES]);
    assert.equal(storage.values.has(PENDING_ORDER_KEY), false);
  });

  it("skips an order made from another project's cart without asking", async () => {
    const { storage, calls, deps } = setup("paid");
    assert.equal(await reconcilePendingOrder({ ...deps, projectId: "other" }), "pending");
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.clear, 0);
    assert.equal(storage.values.has(PENDING_ORDER_KEY), true);
  });

  it("still asks when the order does not know its cart's project", async () => {
    const { cartProjectId: _, ...legacy } = order;
    const { calls, deps } = setup("paid", legacy);
    assert.equal(await reconcilePendingOrder({ ...deps, projectId: "other" }), "paid");
    assert.equal(calls.fetch.length, 1);
  });

  it("keeps a canceled order, which may still be paid again", async () => {
    const { storage, calls, deps } = setup("canceled");
    assert.equal(await reconcilePendingOrder(deps), "pending");
    assert.equal(calls.clear, 0);
    assert.equal(storage.values.has(PENDING_ORDER_KEY), true);
  });

  it("keeps everything while the order is not paid yet or unknown", async () => {
    for (const status of ["created", "unknown"] as const) {
      const { storage, calls, deps } = setup(status);
      assert.equal(await reconcilePendingOrder(deps), "pending");
      assert.equal(calls.clear, 0);
      assert.equal(storage.values.has(PENDING_ORDER_KEY), true);
    }
  });

  it("forgets an order older than 24 hours without asking or clearing", async () => {
    const old = { ...order, ts: NOW - PENDING_ORDER_MAX_AGE_MS - 1 };
    const { storage, calls, deps } = setup("paid", old);
    assert.equal(await reconcilePendingOrder(deps), "expired");
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.clear, 0);
    assert.equal(storage.values.has(PENDING_ORDER_KEY), false);
  });

  it("still asks at exactly 24 hours", async () => {
    const edge = { ...order, ts: NOW - PENDING_ORDER_MAX_AGE_MS };
    const { calls, deps } = setup("paid", edge);
    assert.equal(await reconcilePendingOrder(deps), "paid");
    assert.equal(calls.clear, 1);
  });

  it("keeps the order when the backend fails", async () => {
    const { storage, calls, deps } = setup(new Error("offline"));
    assert.equal(await reconcilePendingOrder(deps), "pending");
    assert.equal(calls.clear, 0);
    assert.equal(storage.values.has(PENDING_ORDER_KEY), true);
  });

  it("keeps the key when clearing the cart fails, so it is retried", async () => {
    const { storage, deps } = setup("paid");
    const outcome = await reconcilePendingOrder({
      ...deps,
      removeLines: async () => {
        throw new Error("storage full");
      },
    });
    assert.equal(outcome, "pending");
    assert.equal(storage.values.has(PENDING_ORDER_KEY), true);
  });

  it("leaves a newer pending order alone", async () => {
    const { storage, calls, deps } = setup("paid");
    const newer = { orderId: "ord_2", projectId: "pid", lines: [], ts: NOW };
    const outcome = await reconcilePendingOrder({
      ...deps,
      fetchStatus: async () => {
        storage.values.set(PENDING_ORDER_KEY, JSON.stringify(newer));
        return "paid";
      },
    });
    assert.equal(outcome, "pending");
    assert.equal(calls.clear, 0);
    assert.deepEqual(readPendingOrder(storage), newer);
  });

  it("is safe to run twice: the second call finds nothing", async () => {
    const { calls, deps } = setup("paid");
    assert.equal(await reconcilePendingOrder(deps), "paid");
    assert.equal(await reconcilePendingOrder(deps), "none");
    assert.equal(calls.clear, 1);
  });
});

describe("subtractOrderLines", () => {
  it("removes only the ordered lines and keeps what was added since", () => {
    const cart = [
      { id: "l1", quantity: 2 },
      { id: "l2", quantity: 1 },
      { id: "l3", quantity: 4 },
    ];
    assert.deepEqual(subtractOrderLines(cart, LINES), [{ id: "l3", quantity: 4 }]);
  });

  it("keeps the extra quantity added to an ordered line", () => {
    assert.deepEqual(subtractOrderLines([{ id: "l1", quantity: 5 }], LINES), [{ id: "l1", quantity: 3 }]);
  });

  it("leaves the cart alone for an order without lines", () => {
    const cart = [{ id: "l1", quantity: 1 }];
    assert.deepEqual(subtractOrderLines(cart, []), cart);
  });
});

describe("rememberPendingOrder", () => {
  it("stores the cart's project and lines", () => {
    const storage = memoryStorage();
    assert.equal(
      rememberPendingOrder(
        { url: "https://bitsnap.pl/payment/common/p/o" },
        { storage, cartProjectId: "c", lines: LINES, now: NOW },
      ),
      true,
    );
    assert.deepEqual(readPendingOrder(storage), {
      orderId: "o",
      projectId: "p",
      cartProjectId: "c",
      lines: LINES,
      ts: NOW,
    });
  });
});

describe("throttleOrderStatus", () => {
  it("asks about the same order once per interval", async () => {
    let at = NOW;
    let asked = 0;
    const ask = throttleOrderStatus(async () => (asked++, "created" as const), () => at, 60_000);
    assert.equal(await ask(order), "created");
    at += 59_999;
    await assert.rejects(ask(order));
    assert.equal(asked, 1);
    at += 1;
    assert.equal(await ask(order), "created");
    assert.equal(asked, 2);
  });

  it("asks about a different order right away", async () => {
    let asked = 0;
    const ask = throttleOrderStatus(async () => (asked++, "created" as const), () => NOW, 60_000);
    await ask(order);
    await ask({ ...order, orderId: "ord_2" });
    assert.equal(asked, 2);
  });
});

describe("orderStatusFromResponse", () => {
  it("reads a typed status", () => {
    assert.equal(orderStatusFromResponse({ details: { status: "paid" } }), "paid");
    assert.equal(orderStatusFromResponse({ details: { status: "created" } }), "created");
    assert.equal(orderStatusFromResponse({ details: { status: "canceled" } }), "canceled");
  });

  it("is unknown for a missing order or an unrecognised status", () => {
    assert.equal(orderStatusFromResponse({}), "unknown");
    assert.equal(orderStatusFromResponse({ details: {} }), "unknown");
    assert.equal(orderStatusFromResponse({ details: { status: "refunded" } }), "unknown");
  });

  it("reads the status from a client generated before the field existed", () => {
    // GetOrderResponse { id = "o"; details (3) = { status (3) = "paid" } }
    const status = new TextEncoder().encode("paid");
    const details = Uint8Array.from([0x1a, status.length, ...status]);
    const bytes = Uint8Array.from([0x0a, 1, 0x6f, 0x1a, details.length, ...details]);
    const message = fromBinary(GetOrderResponseSchema, bytes);
    assert.equal(orderStatusFromResponse(message), "paid");
  });
});
