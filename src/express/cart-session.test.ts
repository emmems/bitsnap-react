import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ExpressCartSession,
  type ExpressCartLocal,
  type LocalCartLineId,
} from "./cart-session";
import { writeExpressCartRecord, type ExpressStorage } from "./cart-record";
import type {
  CartSnapshot,
  CartWriteResult,
  ExpressResult,
  ProviderStart,
} from "./contracts";

const PROJECT = "proj1";
const HOST = "https://bitsnap.pl";

function memoryStorage(): ExpressStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

function snapshotOf(
  revision: number,
  lines: Array<{ id: string; quantity: number }>,
  overrides: Partial<CartSnapshot> = {},
): CartSnapshot {
  const snapshotLines = lines.map((line, index) => ({
    lineId: `${line.id}:${index}`,
    productId: line.id,
    variantId: "",
    quantity: line.quantity,
    name: line.id,
    unitPriceMinor: 1000,
    lineTotalMinor: 1000 * line.quantity,
    currency: "PLN",
  }));
  return {
    cartId: "cart-1",
    revision,
    status: "open",
    environment: "production",
    currency: "PLN",
    locale: "pl-PL",
    lines: snapshotLines,
    subtotalMinor: snapshotLines.reduce((sum, line) => sum + line.lineTotalMinor, 0),
    deliveryMinor: 0,
    discountMinor: 0,
    totalMinor: snapshotLines.reduce((sum, line) => sum + line.lineTotalMinor, 0),
    expiresAt: 1,
    ...overrides,
  };
}

function localCart(initial: LocalCartLineId[]) {
  let lines = initial.map((line) => ({ ...line }));
  const adopted: CartSnapshot[] = [];
  const local: ExpressCartLocal = {
    lines: () => lines.map((line) => ({ ...line })),
    signature: () =>
      lines
        .map((line) => `${line.id}:${line.quantity}`)
        .sort()
        .join(","),
    upload: (locale) =>
      lines.length === 0
        ? undefined
        : {
            items: lines.map((line) => ({ id: line.id, quantity: line.quantity })),
            locale,
          },
    adoptSnapshot: (snapshot) => {
      adopted.push(snapshot);
      lines = snapshot.lines.map((line) => ({
        id: line.productId,
        quantity: line.quantity,
      }));
    },
    appendLines: (added) => {
      for (const line of added) {
        const existing = lines.find((el) => el.id === line.id);
        if (existing == null) {
          lines.push({ ...line });
        } else {
          existing.quantity += line.quantity;
        }
      }
    },
    removeLines: (removed) => {
      for (const line of removed) {
        const existing = lines.find((el) => el.id === line.id);
        if (existing == null) {
          continue;
        }
        existing.quantity -= line.quantity;
        if (existing.quantity <= 0) {
          lines = lines.filter((el) => el !== existing);
        }
      }
    },
    replaceLines: (next) => {
      lines = next.map((line) => ({ ...line }));
    },
  };
  return {
    local,
    adopted,
    get lines() {
      return lines;
    },
    setLines(next: LocalCartLineId[]) {
      lines = next.map((line) => ({ ...line }));
    },
  };
}

type WriteCall = {
  upload: { items: { id: string; quantity: number }[]; locale?: string };
  current?: { cartId: string; cartToken: string; expectedRevision: number };
};

function sessionWith(args: {
  local: ReturnType<typeof localCart>;
  responses: Array<() => CartWriteResult>;
  read?: () => Promise<ExpressResult<CartSnapshot>>;
}) {
  const storage = memoryStorage();
  const writes: WriteCall[] = [];
  const session = new ExpressCartSession({
    projectID: PROJECT,
    host: HOST,
    local: args.local.local,
    storage,
    now: () => 100,
    write: async (upload, current) => {
      writes.push({ upload: upload as WriteCall["upload"], current });
      const next = args.responses.shift();
      assert.ok(next != null, "unexpected extra cart write");
      return next();
    },
    read: args.read ?? (async () => ({ ok: false, code: "cart-not-found", message: "no" })),
  });
  return { session, writes, storage };
}

function created(overrides: Partial<CartSnapshot> = {}): CartWriteResult {
  return {
    ok: true,
    cartToken: "tok-1",
    snapshot: snapshotOf(0, [{ id: "p1", quantity: 1 }], overrides),
  };
}

function updated(
  revision: number,
  lines: Array<{ id: string; quantity: number }>,
): CartWriteResult {
  return { ok: true, snapshot: snapshotOf(revision, lines) };
}

describe("express cart session", () => {
  it("creates a cart once and stores the capability and revision", async () => {
    const local = localCart([{ id: "p1", quantity: 1 }]);
    const { session, writes } = sessionWith({
      local,
      responses: [() => created()],
    });
    const result = await session.ensure({ locale: "pl-PL" });
    assert.equal(result.ok, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].current, undefined);
    const record = session.getRecord();
    assert.equal(record?.cartToken, "tok-1");
    assert.equal(record?.revision, 0);
  });

  it("updates with the stored revision and does not resend the token in the body", async () => {
    const local = localCart([{ id: "p1", quantity: 1 }]);
    const { session, writes } = sessionWith({
      local,
      responses: [() => created(), () => updated(1, [{ id: "p1", quantity: 2 }])],
    });
    await session.ensure({ locale: "pl-PL" });
    local.setLines([{ id: "p1", quantity: 2 }]);
    const result = await session.ensure({ locale: "pl-PL" });
    assert.equal(result.ok, true);
    assert.equal(writes[1].current?.expectedRevision, 0);
    assert.equal(writes[1].current?.cartToken, "tok-1");
    assert.equal("cartToken" in writes[1].upload, false);
  });

  it("reconciles a revision conflict and retries the local content", async () => {
    const local = localCart([{ id: "p1", quantity: 4 }]);
    const storage = memoryStorage();
    writeExpressCartRecord(
      {
        projectID: PROJECT,
        host: HOST,
        environment: "production",
        cartId: "cart-1",
        cartToken: "tok-1",
        revision: 2,
        updatedAt: 1,
        syncedLines: [{ id: "p1", quantity: 1 }],
      },
      storage,
    );
    const writes: WriteCall[] = [];
    const session = new ExpressCartSession({
      projectID: PROJECT,
      host: HOST,
      local: local.local,
      storage,
      write: async (upload, current) => {
        writes.push({ upload: upload as WriteCall["upload"], current });
        if (writes.length === 1) {
          return {
            ok: false,
            code: "revision-conflict",
            message: "newer",
            currentRevision: 5,
            snapshot: snapshotOf(5, [{ id: "p1", quantity: 1 }]),
          };
        }
        return updated(6, [{ id: "p1", quantity: 1 }]);
      },
      read: async () => ({ ok: false, code: "cart-not-found", message: "no" }),
    });
    const result = await session.ensure({ locale: "pl-PL" });
    assert.equal(result.ok, true);
    assert.equal(writes.length, 2);
    assert.equal(writes[0].current?.expectedRevision, 2);
    assert.equal(writes[1].current?.expectedRevision, 5);
    assert.deepEqual(writes[1].upload.items, [{ id: "p1", quantity: 4 }]);
  });

  it("merges disjoint edits instead of overwriting the provider's change", async () => {
    const local = localCart([
      { id: "p1", quantity: 1 },
      { id: "p2", quantity: 2 },
    ]);
    const storage = memoryStorage();
    writeExpressCartRecord(
      {
        projectID: PROJECT,
        host: HOST,
        environment: "production",
        cartId: "cart-1",
        cartToken: "tok-1",
        revision: 2,
        updatedAt: 1,
        syncedLines: [{ id: "p1", quantity: 1 }],
      },
      storage,
    );
    const writes: WriteCall[] = [];
    const session = new ExpressCartSession({
      projectID: PROJECT,
      host: HOST,
      local: local.local,
      storage,
      write: async (upload, current) => {
        writes.push({ upload: upload as WriteCall["upload"], current });
        if (writes.length === 1) {
          return {
            ok: false,
            code: "revision-conflict",
            message: "newer",
            currentRevision: 3,
            snapshot: snapshotOf(3, [
              { id: "p1", quantity: 4 },
              { id: "p2", quantity: 2 },
            ]),
          };
        }
        return updated(4, [
          { id: "p1", quantity: 4 },
          { id: "p2", quantity: 2 },
        ]);
      },
      read: async () => ({ ok: false, code: "cart-not-found", message: "no" }),
    });
    const result = await session.ensure({ locale: "pl-PL" });
    assert.equal(result.ok, true);
    // The app changed p1; this tab added p2. Both survive.
    assert.deepEqual(writes[1].upload.items, [
      { id: "p1", quantity: 4 },
      { id: "p2", quantity: 2 },
    ]);
    assert.deepEqual(local.lines, [
      { id: "p1", quantity: 4 },
      { id: "p2", quantity: 2 },
    ]);
  });

  it("surfaces a same-line quantity conflict and never writes a guess", async () => {
    const local = localCart([{ id: "p1", quantity: 4 }]);
    const storage = memoryStorage();
    writeExpressCartRecord(
      {
        projectID: PROJECT,
        host: HOST,
        environment: "production",
        cartId: "cart-1",
        cartToken: "tok-1",
        revision: 2,
        updatedAt: 1,
        syncedLines: [{ id: "p1", quantity: 1 }],
      },
      storage,
    );
    const writes: WriteCall[] = [];
    const session = new ExpressCartSession({
      projectID: PROJECT,
      host: HOST,
      local: local.local,
      storage,
      write: async (upload, current) => {
        writes.push({ upload: upload as WriteCall["upload"], current });
        // Another tab (or the InPost app) changed the same line to 2 while
        // this tab had changed it to 4.
        return {
          ok: false,
          code: "revision-conflict",
          message: "newer",
          currentRevision: 3,
          snapshot: snapshotOf(3, [{ id: "p1", quantity: 2 }]),
        };
      },
      read: async () => ({ ok: false, code: "cart-not-found", message: "no" }),
    });
    const result = await session.ensure({ locale: "pl-PL" });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.code : "", "revision-conflict");
    assert.deepEqual(result.ok === false ? result.conflicts : undefined, [
      { id: "p1", base: 1, local: 4, server: 2 },
    ]);
    assert.equal(writes.length, 1, "no blind resubmit after a conflict");
    assert.deepEqual(local.lines, [{ id: "p1", quantity: 4 }], "local stays");
    assert.equal(session.getRecord()?.revision, 2, "revision is not adopted");
  });

  it("treats concurrent tabs changing the same line as a visible conflict", async () => {
    const local = localCart([{ id: "p1", quantity: 2 }]);
    const storage = memoryStorage();
    writeExpressCartRecord(
      {
        projectID: PROJECT,
        host: HOST,
        environment: "production",
        cartId: "cart-1",
        cartToken: "tok-1",
        revision: 5,
        updatedAt: 1,
        syncedLines: [{ id: "p1", quantity: 1 }],
      },
      storage,
    );
    const writes: WriteCall[] = [];
    const session = new ExpressCartSession({
      projectID: PROJECT,
      host: HOST,
      local: local.local,
      storage,
      write: async (upload, current) => {
        writes.push({ upload: upload as WriteCall["upload"], current });
        return {
          ok: false,
          code: "revision-conflict",
          message: "newer",
          currentRevision: 6,
          snapshot: snapshotOf(6, [{ id: "p1", quantity: 3 }]),
        };
      },
      read: async () => ({ ok: false, code: "cart-not-found", message: "no" }),
    });
    const result = await session.ensure({ locale: "pl-PL" });
    assert.equal(result.ok, false);
    assert.deepEqual(result.ok === false ? result.conflicts : undefined, [
      { id: "p1", base: 1, local: 2, server: 3 },
    ]);
    assert.equal(writes.length, 1);
  });

  it("starts a new cart when the stored one became an order", async () => {
    const local = localCart([{ id: "p1", quantity: 1 }]);
    const storage = memoryStorage();
    writeExpressCartRecord(
      {
        projectID: PROJECT,
        host: HOST,
        environment: "production",
        cartId: "old-cart",
        cartToken: "tok-old",
        revision: 3,
        updatedAt: 1,
      },
      storage,
    );
    const writes: WriteCall[] = [];
    const session = new ExpressCartSession({
      projectID: PROJECT,
      host: HOST,
      local: local.local,
      storage,
      write: async (upload, current) => {
        writes.push({ upload: upload as WriteCall["upload"], current });
        if (writes.length === 1) {
          return { ok: false, code: "cart-locked", message: "locked" };
        }
        return {
          ok: true,
          cartToken: "tok-new",
          snapshot: snapshotOf(0, [{ id: "p1", quantity: 1 }], { cartId: "new-cart" }),
        };
      },
      read: async () => ({ ok: false, code: "cart-not-found", message: "no" }),
    });
    const result = await session.ensure({ locale: "pl-PL" });
    assert.equal(result.ok, true);
    assert.equal(writes[1].current, undefined);
    assert.equal(session.getRecord()?.cartId, "new-cart");
  });

  it("uploads lines added while the request was in flight", async () => {
    const local = localCart([{ id: "p1", quantity: 1 }]);
    const writes: WriteCall[] = [];
    const storage = memoryStorage();
    const session = new ExpressCartSession({
      projectID: PROJECT,
      host: HOST,
      local: local.local,
      storage,
      write: async (upload, current) => {
        writes.push({ upload: upload as WriteCall["upload"], current });
        if (writes.length === 1) {
          // The buyer adds a product while the upload is in flight.
          local.setLines([
            { id: "p1", quantity: 1 },
            { id: "p2", quantity: 1 },
          ]);
          return {
            ok: true,
            cartToken: "tok-1",
            snapshot: snapshotOf(0, [{ id: "p1", quantity: 1 }]),
          };
        }
        return updated(1, [
          { id: "p1", quantity: 1 },
          { id: "p2", quantity: 1 },
        ]);
      },
      read: async () => ({ ok: false, code: "cart-not-found", message: "no" }),
    });
    const result = await session.ensure({ locale: "pl-PL" });
    assert.equal(result.ok, true);
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[1].upload.items, [
      { id: "p1", quantity: 1 },
      { id: "p2", quantity: 1 },
    ]);
    assert.equal(writes[1].current?.expectedRevision, 0);
  });

  it("keeps cancel and failure untouched", async () => {
    const local = localCart([{ id: "p1", quantity: 1 }]);
    const { session } = sessionWith({
      local,
      responses: [() => created(), () => updated(1, [{ id: "p1", quantity: 1 }])],
    });
    await session.ensure({ locale: "pl-PL" });
    const recordBefore = session.getRecord();
    const result = await session.start("inpostPay", {
      locale: "pl-PL",
      start: async () => ({
        ok: false,
        provider: "inpostPay",
        code: "provider-error",
        message: "down",
      }),
    });
    assert.equal(result.ok, false);
    const after = session.getRecord();
    assert.equal(after?.cartId, recordBefore?.cartId);
    assert.equal(after?.cartToken, recordBefore?.cartToken);
    assert.equal(after?.pending, undefined);
    assert.deepEqual(local.lines, [{ id: "p1", quantity: 1 }]);
  });

  it("records the binding key and frozen lines of a start", async () => {
    const local = localCart([{ id: "p1", quantity: 2 }]);
    const { session } = sessionWith({
      local,
      responses: [
        () => ({
          ok: true,
          cartToken: "tok-1",
          snapshot: snapshotOf(0, [{ id: "p1", quantity: 2 }]),
        }),
      ],
    });
    const start: ProviderStart = {
      ok: true,
      provider: "inpostPay",
      redirectUrl: "https://inpost.example/start",
      providerOrderId: "basket-1",
      cartRevision: 5,
      publicConfig: { basketBindingApiKey: "binding-key" },
    };
    const result = await session.start("inpostPay", {
      locale: "pl-PL",
      start: async () => ({ ok: true, value: start }),
    });
    assert.equal(result.ok, true);
    const record = session.getRecord();
    assert.equal(record?.inpostBindingApiKey, "binding-key");
    assert.equal(record?.pending?.provider, "inpostPay");
    assert.equal(record?.pending?.providerOrderId, "basket-1");
    assert.deepEqual(record?.pending?.lines, [{ id: "p1", quantity: 2 }]);
  });

  it("removes only purchased lines and keeps what was added meanwhile", async () => {
    const local = localCart([{ id: "p1", quantity: 1 }]);
    const { session } = sessionWith({
      local,
      responses: [
        () => created(),
        () => updated(1, [{ id: "p1", quantity: 1 }]),
      ],
    });
    await session.start("revolutPay", {
      locale: "pl-PL",
      start: async () => ({
        ok: true,
        value: {
          ok: true,
          provider: "revolutPay",
          redirectUrl: "https://shop.example/return",
          providerOrderId: "order-1",
          cartRevision: 0,
        },
      }),
    });
    // The buyer adds a product while the payment is underway.
    local.setLines([
      { id: "p1", quantity: 1 },
      { id: "p2", quantity: 2 },
    ]);
    session.completePurchase();
    assert.deepEqual(local.lines, [{ id: "p2", quantity: 2 }]);
    assert.equal(session.getRecord(), undefined, "the paid cart is forgotten");
  });

  it("adopts the server snapshot on reconcile and re-uploads new additions", async () => {
    const local = localCart([{ id: "p1", quantity: 1 }]);
    const writes: WriteCall[] = [];
    const storage = memoryStorage();
    writeExpressCartRecord(
      {
        projectID: PROJECT,
        host: HOST,
        environment: "production",
        cartId: "cart-1",
        cartToken: "tok-1",
        revision: 2,
        updatedAt: 1,
      },
      storage,
    );
    const session = new ExpressCartSession({
      projectID: PROJECT,
      host: HOST,
      local: local.local,
      storage,
      write: async (upload, current) => {
        writes.push({ upload: upload as WriteCall["upload"], current });
        return updated(4, [
          { id: "p1", quantity: 3 },
          { id: "p2", quantity: 1 },
        ]);
      },
      read: async () => {
        // The buyer adds a product while the snapshot is being read.
        local.setLines([
          { id: "p1", quantity: 1 },
          { id: "p2", quantity: 1 },
        ]);
        return {
          ok: true,
          value: snapshotOf(3, [{ id: "p1", quantity: 3 }]),
        };
      },
    });
    const result = await session.reconcileFromServer();
    assert.equal(result.ok, true);
    assert.deepEqual(local.lines, [
      { id: "p1", quantity: 3 },
      { id: "p2", quantity: 1 },
    ]);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].upload.items, [
      { id: "p1", quantity: 3 },
      { id: "p2", quantity: 1 },
    ]);
    assert.equal(writes[0].current?.expectedRevision, 3);
  });

  it("does not reuse a record of another environment", async () => {
    const local = localCart([{ id: "p1", quantity: 1 }]);
    const storage = memoryStorage();
    writeExpressCartRecord(
      {
        projectID: PROJECT,
        host: HOST,
        environment: "production",
        cartId: "prod-cart",
        cartToken: "tok-prod",
        revision: 9,
        updatedAt: 1,
      },
      storage,
    );
    const writes: WriteCall[] = [];
    const session = new ExpressCartSession({
      projectID: PROJECT,
      host: HOST,
      local: local.local,
      storage,
      write: async (upload, current) => {
        writes.push({ upload: upload as WriteCall["upload"], current });
        return {
          ok: true,
          cartToken: "tok-test",
          snapshot: snapshotOf(0, [{ id: "p1", quantity: 1 }], {
            cartId: "test-cart",
            environment: "test",
          }),
        };
      },
      read: async () => ({ ok: false, code: "cart-not-found", message: "no" }),
    });
    const result = await session.ensure({ locale: "pl-PL", environment: "test" });
    assert.equal(result.ok, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].current, undefined);
    assert.equal(session.getRecord()?.cartId, "test-cart");
    assert.equal(session.getRecord()?.environment, "test");
  });

  it("serializes concurrent uploads so revisions do not race", async () => {
    const local = localCart([{ id: "p1", quantity: 1 }]);
    const writes: WriteCall[] = [];
    const storage = memoryStorage();
    let revision = 0;
    const session = new ExpressCartSession({
      projectID: PROJECT,
      host: HOST,
      local: local.local,
      storage,
      write: async (upload, current) => {
        writes.push({ upload: upload as WriteCall["upload"], current });
        await new Promise((resolve) => setTimeout(resolve, 5));
        revision += 1;
        return {
          ok: true,
          ...(current == null ? { cartToken: "tok-1" } : {}),
          snapshot: snapshotOf(revision, [{ id: "p1", quantity: 1 }]),
        };
      },
      read: async () => ({ ok: false, code: "cart-not-found", message: "no" }),
    });
    await Promise.all([
      session.ensure({ locale: "pl-PL" }),
      session.ensure({ locale: "pl-PL" }),
    ]);
    assert.equal(writes.length, 2);
    assert.equal(writes[0].current, undefined);
    assert.equal(writes[1].current?.expectedRevision, 1);
    assert.equal(session.getRecord()?.revision, 2);
  });
});
