import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { setupPage, teardownPage } from "@/src/analytics/testing";
import {
  activePendingAttempt,
  clearExpressCartRecord,
  expressCartKey,
  PENDING_EXPRESS_MAX_AGE_MS,
  readExpressCartRecord,
  writeExpressCartRecord,
  type ExpressCartRecord,
} from "./cart-record";

const page = setupPage("https://shop.example.test/cart");

beforeEach(() => {
  Object.assign(globalThis, { localStorage: page.win.localStorage });
  page.win.localStorage.clear();
});

after(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  teardownPage();
});

const record: ExpressCartRecord = {
  projectID: "proj1",
  host: "https://bitsnap.pl",
  environment: "production",
  cartId: "cart-1",
  cartToken: "secret-token",
  revision: 2,
  updatedAt: 10,
};

describe("express cart record", () => {
  it("scopes one record per project and host", () => {
    writeExpressCartRecord(record);
    const same = readExpressCartRecord({
      projectID: record.projectID,
      host: record.host,
    });
    assert.equal(same?.cartId, "cart-1");
    assert.equal(
      readExpressCartRecord({
        projectID: record.projectID,
        host: "https://other.example.test",
      }),
      undefined,
    );
    assert.equal(
      readExpressCartRecord({ projectID: "other", host: record.host }),
      undefined,
    );
    assert.notEqual(
      expressCartKey("https://a", "p"),
      expressCartKey("https://b", "p"),
    );
  });

  it("keeps the environment, the binding key and a pending attempt", () => {
    writeExpressCartRecord({
      ...record,
      environment: "test",
      inpostBindingApiKey: "binding-key",
      pending: {
        provider: "inpostPay",
        providerOrderId: "order-1",
        lines: [{ id: "p1", quantity: 2 }],
        ts: 11,
      },
    });
    const read = readExpressCartRecord({
      projectID: record.projectID,
      host: record.host,
    });
    assert.equal(read?.environment, "test");
    assert.equal(read?.inpostBindingApiKey, "binding-key");
    assert.deepEqual(read?.pending?.lines, [{ id: "p1", quantity: 2 }]);
  });

  it("drops a record written by another project or a broken one", () => {
    page.win.localStorage.setItem(
      expressCartKey(record.host, record.projectID),
      JSON.stringify({ ...record, projectID: "someone-else" }),
    );
    assert.equal(
      readExpressCartRecord({ projectID: "proj1", host: record.host }),
      undefined,
    );
    assert.equal(
      page.win.localStorage.getItem(expressCartKey(record.host, "proj1")),
      null,
      "the foreign record is removed, not reused",
    );

    page.win.localStorage.setItem(
      expressCartKey(record.host, "proj1"),
      "{broken",
    );
    assert.equal(
      readExpressCartRecord({ projectID: "proj1", host: record.host }),
      undefined,
    );
  });

  it("clears only the matching record", () => {
    writeExpressCartRecord(record);
    writeExpressCartRecord({ ...record, projectID: "proj2", cartId: "cart-2" });
    clearExpressCartRecord({ projectID: "proj1", host: record.host });
    assert.equal(
      readExpressCartRecord({ projectID: "proj1", host: record.host }),
      undefined,
    );
    assert.equal(
      readExpressCartRecord({ projectID: "proj2", host: record.host })?.cartId,
      "cart-2",
    );
  });

  it("ignores a provider attempt older than a day", () => {
    const pending = {
      provider: "revolutPay" as const,
      providerOrderId: "order-1",
      lines: [{ id: "p1", quantity: 1 }],
      ts: 1_000,
    };
    const recordWithPending: ExpressCartRecord = { ...record, pending };
    assert.deepEqual(
      activePendingAttempt(recordWithPending, 1_000 + 1_000),
      pending,
    );
    assert.equal(
      activePendingAttempt(
        recordWithPending,
        1_000 + PENDING_EXPRESS_MAX_AGE_MS + 1,
      ),
      undefined,
    );
  });
});
