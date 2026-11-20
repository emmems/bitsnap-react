import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_PRICE_GATE_STATE,
  PRICE_SEEN_MS,
  buildCartView,
  createCartViewStore,
  hasPayWhatYouWantLine,
  isPayWhatYouWantLine,
  payWhatYouWantKind,
  runPriceGate,
  trackPrices,
  walletItems,
  walletsInert,
  type CartView,
  type CartViewFresh,
  type PriceGateState,
  type PriceMark,
  type ShownPrice,
} from "./cart-view.ts";
import type { CartLineDetails, CartSnapshot } from "./cart-snapshot.ts";

type Line = Parameters<typeof buildCartView>[0][number];

const NOW = 1_800_000_000_000;

function details(id: string, overrides: Record<string, unknown> = {}): CartLineDetails {
  const price = (overrides.price as number | undefined) ?? 1000;
  const version = (overrides.version as string | undefined) ?? "v1";
  const { version: _version, ...rest } = overrides;
  return {
    id,
    name: `Product ${id}`,
    price,
    currency: "PLN",
    image_url: null,
    pricing: {
      regularPrice: price,
      effectivePrice: price,
      currency: "PLN",
      referencePrice: { windowDays: 30, asOf: 1, basis: "observed-history", historyAvailable: false },
      priceVersion: version,
    },
    ...rest,
  } as CartLineDetails;
}

function line(id: string, productID = id, overrides: Partial<Line> = {}): Line {
  return { id, productID, quantity: 1, priceVersion: "v1", ...overrides };
}

function snapshotOf(...items: CartLineDetails[]): CartSnapshot {
  return Object.fromEntries(items.map((item) => [item.id, { at: NOW - 1000, details: item }]));
}

function freshOf(
  items: CartLineDetails[],
  confirmed: string[] = items.map((item) => item.id),
  failed = false,
  gateFresh: string[] = items.map((item) => item.id),
): CartViewFresh {
  return {
    details: new Map(items.map((item) => [item.id, item])),
    confirmed: new Set(confirmed),
    gateFresh: new Set(gateFresh),
    failed,
  };
}

describe("buildCartView statuses", () => {
  it("empty: no local lines", () => {
    const view = buildCartView([], snapshotOf(details("a")), undefined, NOW);
    assert.equal(view.status, "empty");
    assert.equal(view.sum, 0);
    assert.equal(view.lines.length, 0);
    assert.equal(walletsInert(view), false);
  });

  it("snapshot: every line has an entry, none confirmed", () => {
    const view = buildCartView([line("l1", "a", { quantity: 2 }), line("l2", "b")], snapshotOf(details("a", { price: 500 }), details("b")), undefined, NOW);
    assert.equal(view.status, "snapshot");
    assert.deepEqual(view.lines.map((item) => item.source), ["snapshot", "snapshot"]);
    assert.equal(view.sum, 2000);
    assert.equal(view.sumComplete, true);
    assert.equal(view.currency, "PLN");
  });

  it("partial: some line has no entry", () => {
    const view = buildCartView([line("l1", "a"), line("l2", "b")], snapshotOf(details("a")), undefined, NOW);
    assert.equal(view.status, "partial");
    assert.deepEqual(view.lines.map((item) => item.source), ["snapshot", "none"]);
    assert.equal(view.lines[1]!.details, undefined);
    assert.equal(view.sumComplete, false);
    assert.equal(view.sum, 1000);
  });

  it("fresh: every line confirmed", () => {
    const view = buildCartView([line("l1", "a")], {}, freshOf([details("a")]), NOW);
    assert.equal(view.status, "fresh");
    assert.equal(view.lines[0]!.source, "fresh");
    assert.equal(view.lines[0]!.confirmed, true);
    assert.equal(walletsInert(view), false);
  });

  it("unavailable-refresh: failed, nothing ever confirmed, a snapshot exists", () => {
    const view = buildCartView([line("l1", "a")], snapshotOf(details("a")), freshOf([], [], true), NOW);
    assert.equal(view.status, "unavailable-refresh");
    assert.equal(view.failed, true);
    assert.equal(view.lines[0]!.source, "snapshot");
  });

  it("failed with no snapshot at all is partial but reports `failed`", () => {
    const view = buildCartView([line("l1", "a")], {}, freshOf([], [], true), NOW);
    assert.equal(view.status, "partial");
    assert.equal(view.failed, true);
  });

  it("a confirmed line stays fresh when the later refetch fails", () => {
    const view = buildCartView([line("l1", "a")], snapshotOf(details("a")), freshOf([details("a", { price: 700 })], ["a"], true), NOW);
    assert.equal(view.status, "fresh");
    assert.equal(view.lines[0]!.unitPrice, 700);
  });

  it("another line joining makes only that line partial", () => {
    const fresh = freshOf([details("a")], ["a"], true);
    const view = buildCartView([line("l1", "a"), line("l2", "b")], snapshotOf(details("b")), fresh, NOW);
    assert.equal(view.status, "partial");
    assert.deepEqual(view.lines.map((item) => item.confirmed), [true, false]);
    assert.equal(walletsInert(view), true);
  });

  it("takes details from the query, not from a conflicting snapshot entry", () => {
    const view = buildCartView(
      [line("l1", "a")],
      snapshotOf(details("a", { price: 100, name: "Old name" })),
      freshOf([details("a", { price: 200, name: "New name" })]),
      NOW,
    );
    assert.equal(view.lines[0]!.details?.name, "New name");
    assert.equal(view.lines[0]!.unitPrice, 200);
    assert.equal(view.lines[0]!.source, "fresh");
  });

  it("two lines with the same productID share the details", () => {
    const view = buildCartView(
      [line("l1", "a", { quantity: 1, metadata: { size: "S" } }), line("l2", "a", { quantity: 3, metadata: { size: "L" } })],
      snapshotOf(details("a", { price: 100 })),
      undefined,
      NOW,
    );
    assert.equal(view.sum, 400);
    assert.deepEqual(walletItems(view).map((item) => [item.id, item.quantity, item.metadata?.size]), [["a", 1, "S"], ["a", 3, "L"]]);
  });

  it("handles variant lines (a variant id is the productID, details carry baseName/variantName)", () => {
    const variant = details("var_1", { name: "Shirt Blue", baseName: "Shirt", variantName: "Blue", price: 900 });
    const view = buildCartView([line("l1", "var_1")], snapshotOf(variant), undefined, NOW);
    assert.equal(view.lines[0]!.details?.baseName, "Shirt");
    assert.equal(view.lines[0]!.unitPrice, 900);
  });

  it("uses effectivePrice over price and reports deliverable lines", () => {
    const sale = details("a", { price: 1000, isDeliverable: true });
    sale.pricing!.effectivePrice = 800;
    const view = buildCartView([line("l1", "a", { quantity: 2 })], snapshotOf(sale), undefined, NOW);
    assert.equal(view.sum, 1600);
    assert.equal(view.isSomeProductDeliverable, true);
  });

  it("shows no price for a snapshot line whose scheduled price change has passed", () => {
    const stale = details("a");
    stale.pricing!.nextPriceChangeAt = Math.floor(NOW / 1000) - 5;
    const snapshotView = buildCartView([line("l1", "a")], snapshotOf(stale), undefined, NOW);
    assert.equal(snapshotView.lines[0]!.priceKnown, false);
    assert.equal(snapshotView.lines[0]!.unitPrice, undefined);
    assert.equal(snapshotView.lines[0]!.details?.name, "Product a", "name stays");
    assert.equal(snapshotView.sumComplete, false);
    // The same details from the server are trusted.
    const freshView = buildCartView([line("l1", "a")], {}, freshOf([stale]), NOW);
    assert.equal(freshView.lines[0]!.priceKnown, true);
    assert.equal(freshView.lines[0]!.unitPrice, 1000);
  });
});

describe("confirmed set (N6)", () => {
  it("keeps old details after a set change (placeholder) and marks only the new product partial", () => {
    // `keepPreviousData`: the query still holds `a` while `b` has no answer.
    const fresh = freshOf([details("a")], ["a"]);
    const view = buildCartView([line("l1", "a"), line("l2", "b")], {}, fresh, NOW);
    assert.equal(view.lines[0]!.source, "fresh");
    assert.equal(view.lines[0]!.confirmed, true);
    assert.equal(view.lines[1]!.source, "none");
    assert.equal(view.status, "partial");
  });

  it("a refetch error after a set change keeps the confirmed lines fresh", () => {
    const fresh = freshOf([details("a")], ["a"], true);
    const view = buildCartView([line("l1", "a"), line("l2", "b")], snapshotOf(details("b")), fresh, NOW);
    assert.equal(view.lines[0]!.confirmed, true);
    assert.notEqual(view.status, "unavailable-refresh");
    assert.equal(view.lines[1]!.source, "snapshot");
  });

  it("a cleared confirmed set (project or locale change) is a snapshot cart again", () => {
    const view = buildCartView([line("l1", "a")], snapshotOf(details("a")), freshOf([details("a")], []), NOW);
    assert.equal(view.lines[0]!.confirmed, false);
    assert.equal(view.status, "snapshot");
  });
});

describe("pay what you want rule (N5)", () => {
  const recurring = { billingPeriod: "monthly" };

  it("recurring + amount: catalog price, gated", () => {
    const d = details("a", { priceType: "pay_what_you_want", recurring });
    assert.equal(payWhatYouWantKind({ amount: 500 }, d), "none");
    assert.equal(isPayWhatYouWantLine({ amount: 500 }, d), false);
    const view = buildCartView([line("l1", "a", { amount: 500 })], snapshotOf(d), undefined, NOW);
    assert.equal(view.lines[0]!.unitPrice, 1000);
  });

  it("priceType pay_what_you_want + amount: priced at amount, not gated", () => {
    const d = details("a", { priceType: "pay_what_you_want" });
    assert.equal(payWhatYouWantKind({ amount: 500 }, d), "amount");
    const view = buildCartView([line("l1", "a", { amount: 500, quantity: 2 })], snapshotOf(d), undefined, NOW);
    assert.equal(view.lines[0]!.unitPrice, 500);
    assert.equal(view.sum, 1000);
  });

  it("pay what you want without amount: catalog price, counts for the wallet rule only", () => {
    const d = details("a", { priceType: "pay_what_you_want" });
    assert.equal(payWhatYouWantKind({}, d), "suggested");
    assert.equal(isPayWhatYouWantLine({}, d), false);
    const view = buildCartView([line("l1", "a")], snapshotOf(d), undefined, NOW);
    assert.equal(view.lines[0]!.unitPrice, 1000);
    assert.equal(hasPayWhatYouWantLine(view), true);
  });

  it("priceType one_time + amount (switched to fixed price): catalog price and gated", () => {
    for (const priceType of ["one_time", "subscription", "installments", "free"]) {
      const d = details("a", { priceType });
      assert.equal(payWhatYouWantKind({ amount: 500 }, d), "none", priceType);
    }
    const d = details("a", { priceType: "one_time" });
    const view = buildCartView([line("l1", "a", { amount: 500 })], snapshotOf(d), undefined, NOW);
    assert.equal(view.lines[0]!.unitPrice, 1000);
  });

  it("priceType absent + amount: catalog price and gated (the server ignores the amount)", () => {
    const d = details("a");
    assert.equal(payWhatYouWantKind({ amount: 500 }, d), "none");
    assert.equal(payWhatYouWantKind({}, d), "none");
    assert.equal(payWhatYouWantKind({ amount: 500 }, undefined), "none");
    assert.equal(isPayWhatYouWantLine({ amount: 500 }, d), false);
    const view = buildCartView([line("l1", "a", { amount: 500 })], snapshotOf(d), undefined, NOW);
    assert.equal(view.lines[0]!.payWhatYouWant, "none");
    assert.equal(view.lines[0]!.unitPrice, 1000);
    assert.equal(view.sum, 1000);
  });

  it("a line with an amount and no priceType goes through the gate", () => {
    const d = details("a", { version: "v1" });
    const view = viewOf([line("l1", "a", { amount: 500, priceVersion: "v0" })], [d]);
    assert.equal(runPriceGate(EMPTY_PRICE_GATE_STATE, view, NOW).result, "marked");
    assert.equal(runPriceGate(stateOf({ l1: seenLongAgo(1000) }), view, NOW).result, "pass");
  });
});

describe("stable store", () => {
  function fakeStore(initial = 0) {
    let version = initial;
    const listeners = new Set<() => void>();
    return {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
      version: () => version,
      bump: () => {
        version += 1;
        listeners.forEach((listener) => listener());
      },
      size: () => listeners.size,
    };
  }

  it("returns the same number twice, grows on a change in either store", () => {
    const local = fakeStore(3);
    const snapshot = fakeStore(5);
    const store = createCartViewStore(local, snapshot);
    assert.equal(store.getVersion(), 8);
    assert.equal(store.getVersion(), 8);
    let calls = 0;
    const stop = store.subscribe(() => {
      calls += 1;
    });
    local.bump();
    assert.equal(store.getVersion(), 9);
    snapshot.bump();
    assert.equal(store.getVersion(), 10);
    assert.equal(calls, 2);
    stop();
    assert.equal(local.size() + snapshot.size(), 0);
    local.bump();
    assert.equal(calls, 2);
  });
});

function viewOf(lines: Line[], items: CartLineDetails[], marks?: Map<string, PriceMark>): CartView {
  return buildCartView(lines, {}, freshOf(items), NOW, marks);
}

function stateOf(shown: Record<string, ShownPrice> = {}, marks: Record<string, PriceMark> = {}): PriceGateState {
  return { shown: new Map(Object.entries(shown)), marks: new Map(Object.entries(marks)) };
}

const seenLongAgo = (price: number): ShownPrice => ({ price, currency: "PLN", since: NOW - PRICE_SEEN_MS - 1 });

describe("price gate (D18)", () => {
  it("L === F passes when the price has been on screen for >= 1 s", () => {
    const view = viewOf([line("l1", "a", { priceVersion: "v1" })], [details("a")]);
    const gate = runPriceGate(stateOf({ l1: seenLongAgo(1000) }), view, NOW);
    assert.equal(gate.result, "pass");
    assert.deepEqual(gate.adopt, []);
  });

  it("L === F on screen < 1 s, or not shown at all: marked, nothing adopted (R3)", () => {
    const view = viewOf([line("l1", "a", { priceVersion: "v1" })], [details("a")]);
    const recent = runPriceGate(stateOf({ l1: { price: 1000, currency: "PLN", since: NOW - (PRICE_SEEN_MS - 1) } }), view, NOW);
    assert.equal(recent.result, "marked");
    assert.deepEqual(recent.adopt, []);
    assert.deepEqual(recent.state.marks.get("l1"), { priceVersion: "v1", shownPrice: 1000, markedAt: NOW });
    assert.equal(runPriceGate(EMPTY_PRICE_GATE_STATE, view, NOW).result, "marked");
  });

  it("L === F but the screen shows another price: marked", () => {
    const view = viewOf([line("l1", "a", { priceVersion: "v1" })], [details("a")]);
    assert.equal(runPriceGate(stateOf({ l1: seenLongAgo(900) }), view, NOW).result, "marked");
  });

  it("needs a server answer fetched after the drawer opened (R4)", () => {
    const d = details("a");
    const placeholder = buildCartView([line("l1", "a")], {}, freshOf([d], ["a"], false, []), NOW);
    assert.equal(placeholder.lines[0]!.gateFresh, false);
    const gate = runPriceGate(stateOf({ l1: seenLongAgo(1000) }), placeholder, NOW);
    assert.equal(gate.result, "needs-fresh");
    assert.deepEqual(gate.adopt, []);
    const partial = buildCartView([line("l1", "a"), line("l2", "b")], {}, freshOf([d, details("b")], ["a", "b"], false, ["a"]), NOW);
    assert.equal(runPriceGate(stateOf({ l1: seenLongAgo(1000), l2: seenLongAgo(1000) }), partial, NOW).result, "needs-fresh");
    const noSet = buildCartView([line("l1", "a")], {}, { details: new Map([["a", d]]), confirmed: new Set(["a"]), gateFresh: new Set() }, NOW);
    assert.equal(runPriceGate(stateOf({ l1: seenLongAgo(1000) }), noSet, NOW).result, "needs-fresh");
  });

  it("needs a server answer first", () => {
    const view = buildCartView([line("l1", "a")], snapshotOf(details("a")), undefined, NOW);
    assert.equal(runPriceGate(EMPTY_PRICE_GATE_STATE, view, NOW).result, "needs-fresh");
    const partial = buildCartView([line("l1", "a"), line("l2", "b")], {}, freshOf([details("a")]), NOW);
    assert.equal(runPriceGate(EMPTY_PRICE_GATE_STATE, partial, NOW).result, "needs-fresh");
  });

  it("L !== F, same price shown for >= 1 s: adopts silently", () => {
    const view = viewOf([line("l1", "a", { priceVersion: "v0" })], [details("a", { version: "v1" })]);
    const gate = runPriceGate(stateOf({ l1: seenLongAgo(1000) }), view, NOW);
    assert.equal(gate.result, "pass");
    assert.deepEqual(gate.adopt, [{ lineId: "l1", priceVersion: "v1" }]);
  });

  it("L !== F, same price but on screen < 1 s: marked, not adopted (N15)", () => {
    const view = viewOf([line("l1", "a", { priceVersion: "v0" })], [details("a", { version: "v1" })]);
    const gate = runPriceGate(stateOf({ l1: { price: 1000, currency: "PLN", since: NOW - (PRICE_SEEN_MS - 1) } }), view, NOW);
    assert.equal(gate.result, "marked");
    assert.deepEqual(gate.adopt, []);
    assert.deepEqual(gate.state.marks.get("l1"), { priceVersion: "v1", shownPrice: 1000, markedAt: NOW });
  });

  it("nothing shown yet counts as unseen", () => {
    const view = viewOf([line("l1", "a", { priceVersion: "v0" })], [details("a", { version: "v1" })]);
    assert.equal(runPriceGate(EMPTY_PRICE_GATE_STATE, view, NOW).result, "marked");
  });

  it("the compared field is effectivePrice ?? price: a regularPrice-only change does not count", () => {
    const d = details("a", { version: "v1" });
    d.pricing!.regularPrice = 5000;
    const view = viewOf([line("l1", "a", { priceVersion: "v0" })], [d]);
    const gate = runPriceGate(stateOf({ l1: seenLongAgo(1000) }), view, NOW);
    assert.equal(gate.result, "pass");
  });

  it("a different currency is a different price", () => {
    const d = details("a", { version: "v1", currency: "EUR" });
    const view = viewOf([line("l1", "a", { priceVersion: "v0" })], [d]);
    assert.equal(runPriceGate(stateOf({ l1: seenLongAgo(1000) }), view, NOW).result, "marked");
  });

  it("L missing follows the same rules", () => {
    const missing = line("l1", "a", { priceVersion: undefined });
    const view = viewOf([missing], [details("a")]);
    assert.equal(runPriceGate(stateOf({ l1: seenLongAgo(1000) }), view, NOW).result, "pass");
    assert.equal(runPriceGate(stateOf({ l1: seenLongAgo(900) }), view, NOW).result, "marked");
  });

  it("L !== F with a different price: marked with {priceVersion, shownPrice}", () => {
    const view = viewOf([line("l1", "a", { priceVersion: "v0" })], [details("a", { version: "v2", price: 1200 })]);
    const gate = runPriceGate(stateOf({ l1: seenLongAgo(1000) }), view, NOW);
    assert.equal(gate.result, "marked");
    assert.deepEqual(gate.state.marks.get("l1"), { priceVersion: "v2", shownPrice: 1200, markedAt: NOW });
    assert.deepEqual(gate.adopt, []);
  });

  it("second click with the same fresh version adopts once the price was on screen >= 1 s", () => {
    const view = viewOf([line("l1", "a", { priceVersion: "v0" })], [details("a", { version: "v2", price: 1200 })]);
    const mark: PriceMark = { priceVersion: "v2", shownPrice: 1200, markedAt: NOW - PRICE_SEEN_MS };
    const gate = runPriceGate(stateOf({}, { l1: mark }), view, NOW);
    assert.equal(gate.result, "pass");
    assert.deepEqual(gate.adopt, [{ lineId: "l1", priceVersion: "v2" }]);
    assert.equal(gate.state.marks.has("l1"), false);
  });

  it("a mark made by trackPrices at T is not adopted by a click at T + 50 ms (R1, N15)", () => {
    const first = trackPrices(
      EMPTY_PRICE_GATE_STATE,
      buildCartView([line("l1", "a", { priceVersion: "v1" })], snapshotOf(details("a")), undefined, NOW),
      NOW,
    );
    const freshItems = [details("a", { version: "v2", price: 1500 })];
    const freshView = viewOf([line("l1", "a", { priceVersion: "v1" })], freshItems);
    const tracked = trackPrices(first, freshView, NOW + 200);
    assert.deepEqual(tracked.marks.get("l1"), { priceVersion: "v2", shownPrice: 1500, markedAt: NOW + 200 });
    const early = runPriceGate(tracked, freshView, NOW + 250);
    assert.equal(early.result, "marked");
    assert.deepEqual(early.adopt, []);
    assert.equal(early.state.marks.get("l1")!.markedAt, NOW + 200, "the clock is not restarted by a click");
    const late = runPriceGate(early.state, freshView, NOW + 200 + PRICE_SEEN_MS);
    assert.equal(late.result, "pass");
    assert.deepEqual(late.adopt, [{ lineId: "l1", priceVersion: "v2" }]);
  });

  it("a mark of a price the screen does not show yet is not adopted", () => {
    const view = viewOf([line("l1", "a", { priceVersion: "v0" })], [details("a", { version: "v2", price: 1200 })]);
    const mark: PriceMark = { priceVersion: "v2", shownPrice: 1200, markedAt: NOW - 5000 };
    const gate = runPriceGate(stateOf({ l1: seenLongAgo(1000) }, { l1: mark }), view, NOW);
    assert.equal(gate.result, "marked");
    assert.deepEqual(gate.adopt, []);
  });

  it("a mark whose price was on screen since long ago adopts even if the mark is newer", () => {
    const view = viewOf([line("l1", "a", { priceVersion: "v0" })], [details("a", { version: "v2", price: 1200 })]);
    const mark: PriceMark = { priceVersion: "v2", shownPrice: 1200, markedAt: NOW - 10 };
    const gate = runPriceGate(stateOf({ l1: seenLongAgo(1200) }, { l1: mark }), view, NOW);
    assert.equal(gate.result, "pass");
    assert.deepEqual(gate.adopt, [{ lineId: "l1", priceVersion: "v2" }]);
  });

  it("second click after the fresh version changed marks again and does not adopt", () => {
    const view = viewOf([line("l1", "a", { priceVersion: "v0" })], [details("a", { version: "v3", price: 1300 })]);
    const mark: PriceMark = { priceVersion: "v2", shownPrice: 1200, markedAt: NOW - 5000 };
    const gate = runPriceGate(stateOf({}, { l1: mark }), view, NOW);
    assert.equal(gate.result, "marked");
    assert.deepEqual(gate.adopt, []);
    assert.deepEqual(gate.state.marks.get("l1"), { priceVersion: "v3", shownPrice: 1300, markedAt: NOW });
  });

  it("a blocked click keeps the marks of the lines that would have passed", () => {
    const view = viewOf(
      [line("l1", "a", { priceVersion: "v0" }), line("l2", "b", { priceVersion: "v0" })],
      [details("a", { version: "v1" }), details("b", { version: "v1", price: 2000 })],
    );
    const okMark: PriceMark = { priceVersion: "v1", shownPrice: 1000, markedAt: NOW - 5000 };
    const gate = runPriceGate(stateOf({ l1: seenLongAgo(1000) }, { l1: okMark }), view, NOW);
    assert.equal(gate.result, "marked");
    assert.deepEqual(gate.adopt, []);
    assert.ok(gate.state.marks.has("l1"), "kept until the click that adopts");
    assert.ok(gate.state.marks.has("l2"));
  });

  it("one marked line blocks the others from adopting this click", () => {
    const view = viewOf(
      [line("l1", "a", { priceVersion: "v0" }), line("l2", "b", { priceVersion: "v0" })],
      [details("a", { version: "v1" }), details("b", { version: "v1", price: 2000 })],
    );
    const gate = runPriceGate(stateOf({ l1: seenLongAgo(1000), l2: seenLongAgo(1500) }), view, NOW);
    assert.equal(gate.result, "marked");
    assert.deepEqual(gate.adopt, []);
  });

  it("a pay-what-you-want line with a changed catalog price is never marked", () => {
    const d = details("a", { priceType: "pay_what_you_want", version: "v9", price: 5000 });
    const view = viewOf([line("l1", "a", { priceVersion: "v0", amount: 700 })], [d]);
    // Only its amount counts (S13): an amount marked over 1 s ago is adopted.
    const gate = runPriceGate(
      stateOf({}, { l1: { priceVersion: "", shownPrice: 700, markedAt: NOW - PRICE_SEEN_MS - 1 } }),
      view,
      NOW,
    );
    assert.equal(gate.result, "pass");
    assert.deepEqual(gate.adopt, []);
    assert.equal(gate.state.marks.has("l1"), false);
    assert.equal(trackPrices(EMPTY_PRICE_GATE_STATE, view, NOW).marks.size, 0);
  });

  it("an amount without a mark passes only when the drawer showed that amount for >= 1 s (S13)", () => {
    const d = details("a", { priceType: "pay_what_you_want" });
    const view = viewOf([line("l1", "a", { amount: 900 })], [d]);
    // Another tab wrote 900; the drawer still shows 1500 (no storage event yet).
    const older = runPriceGate(stateOf({ l1: seenLongAgo(1500) }), view, NOW);
    assert.equal(older.result, "marked");
    assert.deepEqual(older.state.marks.get("l1"), { priceVersion: "", shownPrice: 900, markedAt: NOW });
    assert.equal(runPriceGate(EMPTY_PRICE_GATE_STATE, view, NOW).result, "marked", "never shown");
    const young = runPriceGate(stateOf({ l1: { price: 900, currency: "PLN", since: NOW - 50 } }), view, NOW);
    assert.equal(young.result, "marked");
    const otherCurrency = runPriceGate(stateOf({ l1: { price: 900, currency: "EUR", since: NOW - PRICE_SEEN_MS - 1 } }), view, NOW);
    assert.equal(otherCurrency.result, "marked");
    const seen = runPriceGate(stateOf({ l1: seenLongAgo(900) }), view, NOW);
    assert.equal(seen.result, "pass");
    assert.deepEqual(seen.adopt, []);
  });

  it("a server answer without pricing is gated by the seen rule alone (N1)", () => {
    const d = details("a");
    delete d.pricing;
    const view = viewOf([line("l1", "a", { priceVersion: "v0" })], [d]);
    const unseen = runPriceGate(EMPTY_PRICE_GATE_STATE, view, NOW);
    assert.equal(unseen.result, "marked");
    assert.deepEqual(unseen.state.marks.get("l1"), { priceVersion: "", shownPrice: 1000, markedAt: NOW });
    const recent = runPriceGate(stateOf({ l1: { price: 1000, currency: "PLN", since: NOW - 50 } }), view, NOW);
    assert.equal(recent.result, "marked");
    const seen = runPriceGate(stateOf({ l1: seenLongAgo(1000) }), view, NOW);
    assert.equal(seen.result, "pass");
    assert.deepEqual(seen.adopt, [], "no version to adopt");
  });

  it("snapshot 10, fresh 12 painted 50 ms before the click, no priceVersion: blocked (N1)", () => {
    const snapshotD = details("a", { price: 1000 });
    delete snapshotD.pricing;
    const freshD = details("a", { price: 1200 });
    delete freshD.pricing;
    const first = trackPrices(
      EMPTY_PRICE_GATE_STATE,
      buildCartView([line("l1", "a", { priceVersion: undefined })], snapshotOf(snapshotD), undefined, NOW),
      NOW,
    );
    const freshView = viewOf([line("l1", "a", { priceVersion: undefined })], [freshD]);
    const tracked = trackPrices(first, freshView, NOW + 5000);
    assert.deepEqual(tracked.marks.get("l1"), { priceVersion: "", shownPrice: 1200, markedAt: NOW + 5000 });
    const early = runPriceGate(tracked, freshView, NOW + 5050);
    assert.equal(early.result, "marked");
    assert.equal(early.state.marks.get("l1")!.markedAt, NOW + 5000, "the clock is not restarted");
    assert.deepEqual(early.adopt, []);
    const late = runPriceGate(early.state, freshView, NOW + 5000 + PRICE_SEEN_MS);
    assert.equal(late.result, "pass");
    assert.deepEqual(late.adopt, []);
    assert.equal(late.state.marks.has("l1"), false);
  });

  it("a pay-what-you-want line without an amount is gated at regularPrice ?? price (N3)", () => {
    const d = details("a", { priceType: "pay_what_you_want", version: "v1", price: 2000 });
    d.pricing!.effectivePrice = 1500;
    const view = viewOf([line("l1", "a", { priceVersion: "v1" })], [d]);
    assert.equal(view.lines[0]!.unitPrice, 2000);
    assert.equal(view.sum, 2000);
    assert.equal(runPriceGate(stateOf({ l1: seenLongAgo(1500) }), view, NOW).result, "marked", "the discounted price is not what is charged");
    assert.equal(runPriceGate(stateOf({ l1: seenLongAgo(2000) }), view, NOW).result, "pass");
    assert.equal(runPriceGate(EMPTY_PRICE_GATE_STATE, view, NOW).result, "marked");
  });
});

describe("trackPrices", () => {
  it("remembers the first paint without marking", () => {
    const view = buildCartView([line("l1", "a")], snapshotOf(details("a")), undefined, NOW);
    const state = trackPrices(EMPTY_PRICE_GATE_STATE, view, NOW);
    assert.deepEqual(state.shown.get("l1"), { price: 1000, currency: "PLN", since: NOW });
    assert.equal(state.marks.size, 0);
  });

  it("returns the same state object when nothing changed", () => {
    const view = buildCartView([line("l1", "a")], snapshotOf(details("a")), undefined, NOW);
    const first = trackPrices(EMPTY_PRICE_GATE_STATE, view, NOW);
    assert.equal(trackPrices(first, view, NOW + 5000), first);
  });

  it("keeps `since` while the price stays the same", () => {
    const snapshotView = buildCartView([line("l1", "a")], snapshotOf(details("a")), undefined, NOW);
    const first = trackPrices(EMPTY_PRICE_GATE_STATE, snapshotView, NOW);
    const freshView = viewOf([line("l1", "a", { priceVersion: "v0" })], [details("a", { version: "v1" })]);
    const second = trackPrices(first, freshView, NOW + 3000);
    assert.equal(second.shown.get("l1")!.since, NOW);
    assert.equal(second.marks.size, 0, "same price, new version: no mark, the gate adopts");
  });

  it("a rendered price that changes while open marks the line at once (N15)", () => {
    const snapshotView = buildCartView([line("l1", "a", { priceVersion: "v1" })], snapshotOf(details("a")), undefined, NOW);
    const first = trackPrices(EMPTY_PRICE_GATE_STATE, snapshotView, NOW);
    const freshView = viewOf([line("l1", "a", { priceVersion: "v1" })], [details("a", { version: "v2", price: 1500 })]);
    const second = trackPrices(first, freshView, NOW + 200);
    assert.deepEqual(second.marks.get("l1"), { priceVersion: "v2", shownPrice: 1500, markedAt: NOW + 200 });
    assert.deepEqual(second.shown.get("l1"), { price: 1500, currency: "PLN", since: NOW + 200 });
    const marked = buildCartView([line("l1", "a", { priceVersion: "v1" })], {}, freshOf([details("a", { version: "v2", price: 1500 })]), NOW + 200, second.marks);
    assert.equal(marked.lines[0]!.marked, true);
    assert.equal(walletsInert(marked), true);
  });

  it("a server-answer price change marks the line whatever its stored version is (R3)", () => {
    const first = trackPrices(
      EMPTY_PRICE_GATE_STATE,
      buildCartView([line("l1", "a", { priceVersion: "v2" })], snapshotOf(details("a")), undefined, NOW),
      NOW,
    );
    const view = viewOf([line("l1", "a", { priceVersion: "v2" })], [details("a", { version: "v2", price: 1500 })]);
    const next = trackPrices(first, view, NOW + 300);
    assert.deepEqual(next.marks.get("l1"), { priceVersion: "v2", shownPrice: 1500, markedAt: NOW + 300 });
    assert.equal(trackPrices(next, view, NOW + 400), next, "a mark is not dropped for carrying the stored version");
  });

  it("a changed price from the snapshot alone does not mark (not a server answer)", () => {
    const first = trackPrices(EMPTY_PRICE_GATE_STATE, buildCartView([line("l1", "a")], snapshotOf(details("a")), undefined, NOW), NOW);
    const next = trackPrices(first, buildCartView([line("l1", "a")], snapshotOf(details("a", { price: 1700, version: "v2" })), undefined, NOW), NOW + 10);
    assert.equal(next.marks.size, 0);
    assert.equal(next.shown.get("l1")!.price, 1700);
  });

  it("marks a fresh price change even without a priceVersion (N1)", () => {
    const old = details("a", { price: 1000 });
    delete old.pricing;
    const next = details("a", { price: 1200 });
    delete next.pricing;
    const first = trackPrices(EMPTY_PRICE_GATE_STATE, buildCartView([line("l1", "a")], snapshotOf(old), undefined, NOW), NOW);
    const state = trackPrices(first, viewOf([line("l1", "a")], [next]), NOW + 100);
    assert.deepEqual(state.marks.get("l1"), { priceVersion: "", shownPrice: 1200, markedAt: NOW + 100 });
  });

  it("a pay-what-you-want line without an amount is tracked at regularPrice ?? price (N3)", () => {
    const d = details("a", { priceType: "pay_what_you_want", price: 2000 });
    d.pricing!.effectivePrice = 1500;
    const state = trackPrices(EMPTY_PRICE_GATE_STATE, viewOf([line("l1", "a")], [d]), NOW);
    assert.equal(state.shown.get("l1")!.price, 2000);
    // A discount change alone moves nothing the shopper pays.
    const d2 = details("a", { priceType: "pay_what_you_want", price: 2000, version: "v2" });
    d2.pricing!.effectivePrice = 1200;
    const next = trackPrices(state, viewOf([line("l1", "a")], [d2]), NOW + 100);
    assert.equal(next, state);
  });

  it("a line that shows no price loses its shown entry, a returning price counts from its return (N2)", () => {
    const stale = details("a", { price: 1000 });
    stale.pricing!.nextPriceChangeAt = Math.floor(NOW / 1000) - 5;
    const first = trackPrices(EMPTY_PRICE_GATE_STATE, viewOf([line("l1", "a")], [details("a")]), NOW);
    assert.equal(first.shown.get("l1")!.since, NOW);
    const hidden = trackPrices(first, buildCartView([line("l1", "a")], snapshotOf(stale), undefined, NOW), NOW + 3000);
    assert.equal(hidden.shown.has("l1"), false);
    const none = trackPrices(hidden, buildCartView([line("l1", "a")], {}, undefined, NOW), NOW + 3500);
    assert.equal(none, hidden, "nothing to forget twice");
    const back = trackPrices(hidden, viewOf([line("l1", "a")], [details("a")]), NOW + 4000);
    assert.equal(back.shown.get("l1")!.since, NOW + 4000);
    assert.equal(back.marks.size, 0, "no earlier price on screen, so nothing changed for the shopper");
    const gate = runPriceGate(back, viewOf([line("l1", "a")], [details("a")]), NOW + 4500);
    assert.equal(gate.result, "marked");
  });

  it("drops marks and shown prices of removed lines", () => {
    const state = stateOf(
      { gone: seenLongAgo(1) },
      { gone: { priceVersion: "v2", shownPrice: 1, markedAt: NOW }, l1: { priceVersion: "v2", shownPrice: 1500, markedAt: NOW } },
    );
    const view = viewOf([line("l1", "a", { priceVersion: "v0" })], [details("a", { version: "v2", price: 1500 })]);
    const next = trackPrices(state, view, NOW);
    assert.deepEqual([...next.marks.keys()], ["l1"]);
    assert.equal(next.shown.has("gone"), false);
  });
});

describe("wallet state (N1, N2)", () => {
  it("is inert when any line is partial or marked, and not otherwise", () => {
    const fresh = viewOf([line("l1", "a")], [details("a")]);
    assert.equal(walletsInert(fresh), false);
    const partial = buildCartView([line("l1", "a"), line("l2", "b")], snapshotOf(details("b")), freshOf([details("a")]), NOW);
    assert.equal(walletsInert(partial), true);
    const marked = viewOf([line("l1", "a")], [details("a")], new Map([["l1", { priceVersion: "v2", shownPrice: 1, markedAt: NOW }]]));
    assert.equal(walletsInert(marked), true);
    const snapshotOnly = buildCartView([line("l1", "a")], snapshotOf(details("a")), undefined, NOW);
    assert.equal(walletsInert(snapshotOnly), true);
  });

  it("is inert on a confirmed answer from before the open; the server prices wallets without a version check (m3)", () => {
    const cached = buildCartView([line("l1", "a")], {}, freshOf([details("a")], ["a"], false, []), NOW);
    assert.equal(cached.lines[0]!.confirmed, true);
    assert.equal(walletsInert(cached), true);
    const oneStale = buildCartView([line("l1", "a"), line("l2", "b")], {}, freshOf([details("a"), details("b")], ["a", "b"], false, ["a"]), NOW);
    assert.equal(walletsInert(oneStale), true);
  });

  it("walletItems is the whole local cart, in local order, with metadata and catalog prices", () => {
    const sale = details("b", { price: 2000, isDeliverable: true });
    sale.pricing!.effectivePrice = 1800;
    const view = buildCartView(
      [line("l1", "a", { quantity: 2, metadata: { note: "x" }, amount: 300 }), line("l2", "b"), line("l3", "unknown", { quantity: 4 })],
      {},
      freshOf([details("a", { priceType: "pay_what_you_want" }), sale], ["a"]),
      NOW,
    );
    assert.deepEqual(walletItems(view), [
      { name: "Product a", id: "a", price: 1000, currency: "PLN", quantity: 2, isDeliverable: false, metadata: { note: "x" } },
      { name: "Product b", id: "b", price: 1800, currency: "PLN", quantity: 1, isDeliverable: true, metadata: undefined },
      { name: "", id: "unknown", price: 0, currency: undefined, quantity: 4, isDeliverable: false, metadata: undefined },
    ]);
  });

  it("hasPayWhatYouWantLine: amount, or pay-what-you-want without amount; not a recurring variant without amount", () => {
    const withAmount = viewOf([line("l1", "a", { amount: 100 })], [details("a")]);
    assert.equal(hasPayWhatYouWantLine(withAmount), true);
    const suggested = viewOf([line("l1", "a")], [details("a", { priceType: "pay_what_you_want" })]);
    assert.equal(hasPayWhatYouWantLine(suggested), true);
    const recurring = viewOf([line("l1", "a")], [details("a", { priceType: "pay_what_you_want", recurring: { billingPeriod: "monthly" } })]);
    assert.equal(hasPayWhatYouWantLine(recurring), false);
    const plain = viewOf([line("l1", "a")], [details("a")]);
    assert.equal(hasPayWhatYouWantLine(plain), false);
  });
});
