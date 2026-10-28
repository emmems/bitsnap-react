import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createImpressionTracker, type ImpressionBatch } from "./impressions.ts";

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

class FakeObserver {
  static instances: FakeObserver[] = [];
  observed = new Set<Element>();
  constructor(public callback: Callback) {
    FakeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
  see(el: Element, ratio: number) {
    this.callback([{ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio }]);
  }
}

const saved = globalThis.IntersectionObserver;
beforeEach(() => {
  FakeObserver.instances = [];
  (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = FakeObserver;
});
afterEach(() => {
  (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = saved;
});

const el = () => ({}) as Element;

describe("impression tracker", () => {
  it("counts a product once, only at 50% visibility, in one batch", () => {
    const batches: ImpressionBatch[] = [];
    const tracker = createImpressionTracker((batch) => batches.push(batch));
    const [a, b, c] = [el(), el(), el()];
    tracker.observe(a, "p1", 0);
    tracker.observe(b, "p2", 1);
    tracker.observe(c, "p3", 2);
    const observer = FakeObserver.instances[0];
    observer.see(a, 0.49);
    observer.see(b, 0.5);
    observer.see(a, 0.9);
    observer.see(b, 1);
    tracker.flush();
    assert.deepEqual(batches, [{ productIds: ["p2", "p1"], positions: [1, 0] }]);

    // Seen already: observing again, or seeing it again, adds nothing.
    tracker.observe(el(), "p1", 0);
    tracker.flush();
    assert.equal(batches.length, 1);
    tracker.destroy();
  });

  it("splits batches at the contract limit of 50", () => {
    const batches: ImpressionBatch[] = [];
    const tracker = createImpressionTracker((batch) => batches.push(batch));
    const elements = Array.from({ length: 120 }, el);
    elements.forEach((e, i) => tracker.observe(e, `p${i}`, i));
    elements.forEach((e) => FakeObserver.instances[0].see(e, 1));
    tracker.flush();
    assert.deepEqual(batches.map((b) => b.productIds.length), [50, 50, 20]);
    tracker.destroy();
  });

  it("reports nothing without IntersectionObserver and never throws", () => {
    (globalThis as { IntersectionObserver: unknown }).IntersectionObserver = undefined;
    const batches: ImpressionBatch[] = [];
    const tracker = createImpressionTracker((batch) => batches.push(batch));
    assert.doesNotThrow(() => tracker.observe(el(), "p1", 0)());
    tracker.destroy();
    assert.deepEqual(batches, []);
  });

  it("a throwing sink does not break the page", () => {
    const tracker = createImpressionTracker(() => {
      throw new Error("sink");
    });
    const e = el();
    tracker.observe(e, "p1", 0);
    FakeObserver.instances[0].see(e, 1);
    assert.doesNotThrow(() => tracker.flush());
    tracker.destroy();
  });
});
