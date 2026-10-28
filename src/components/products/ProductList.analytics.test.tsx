import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { getTracker, resetTracker } from "@/src/analytics/core";
import {
  TEST_KEY,
  collector,
  deviceState,
  findPII,
  setupReactPage,
  teardownReactPage,
} from "@/src/analytics/react-testing";
import { getCartInstrument, noopInstrument, setCartInstrument, type Instrument } from "@/src/analytics/instrument";
import type { PublicListProduct } from "./fetch.ts";

const page = setupReactPage();

class FakeObserver {
  static instances: FakeObserver[] = [];
  observed = new Map<Element, true>();
  constructor(public callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
    FakeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.set(el, true);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
}
(globalThis as { IntersectionObserver: unknown }).IntersectionObserver = FakeObserver;

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let ProductList: typeof import("./ProductList.tsx").ProductList;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ ProductList } = await import("./ProductList.tsx"));
});

const roots: Array<{ unmount: () => void }> = [];

beforeEach(() => {
  resetTracker();
  FakeObserver.instances = [];
});
afterEach(async () => {
  // Unmounting flushes pending impressions, so reset the tracker afterwards.
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  resetTracker();
});

function product(n: number, extra: Partial<PublicListProduct> = {}): PublicListProduct {
  return {
    id: `prod${n}`,
    cartItemId: `var${n}`,
    uniqueSlug: `slug-${n}`,
    name: `Product ${n}`,
    shortDescription: null,
    image: null,
    price: 1000 * n,
    currency: "PLN",
    compareAtPrice: null,
    priceFrom: false,
    variantCount: 1,
    isRecurring: false,
    available: true,
    addToCart: true,
    ...extra,
  };
}

const items = [product(1), product(2), product(3)];
const initialData = { items, totalCount: 3 };

async function mount(props: Partial<React.ComponentProps<typeof ProductList>> = {}) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(<ProductList projectID={TEST_KEY} initialData={initialData} {...props} />);
  });
  return { container, root };
}

function see(el: Element, ratio: number) {
  // A counted card is no longer observed, but a late callback may still arrive.
  FakeObserver.instances[0].callback([{ target: el, isIntersecting: ratio > 0, intersectionRatio: ratio }]);
}

/** The batched impressions are flushed when the page is hidden. */
async function hidePage() {
  Object.defineProperty(page.win.document, "visibilityState", { value: "hidden", configurable: true });
  await React.act(async () => {
    page.win.document.dispatchEvent(new page.win.Event("visibilitychange"));
  });
  Object.defineProperty(page.win.document, "visibilityState", { value: "visible", configurable: true });
}

describe("ProductList analytics", () => {
  it("reports the list view once per mount", async () => {
    const seen = collector();
    const { root } = await mount({ analytics: { onEvent: seen.onEvent } });
    assert.deepEqual(seen.named("product_list_viewed").map((e) => e.props), [
      { list_id: "catalog", item_count: 3 },
    ]);
    assert.equal(seen.named("product_list_viewed")[0].page_type, "catalog");
    await React.act(async () => {
      root.render(
        <ProductList projectID={TEST_KEY} initialData={initialData} analytics={{ onEvent: seen.onEvent }} />,
      );
    });
    assert.equal(seen.named("product_list_viewed").length, 1);
  });

  it("batches impressions of products that were at least half visible, each once", async () => {
    const seen = collector();
    const { container } = await mount({ analytics: { onEvent: seen.onEvent } });
    const cards = Array.from(container.querySelectorAll("li"));
    assert.equal(cards.length, 3);
    see(cards[0], 0.4);
    see(cards[1], 0.8);
    see(cards[2], 1);
    see(cards[1], 1);
    await hidePage();
    assert.deepEqual(seen.named("product_impression").map((e) => e.props), [
      { list_id: "catalog", product_ids: ["prod2", "prod3"], positions: [1, 2] },
    ]);

    see(cards[0], 0.6);
    await hidePage();
    assert.deepEqual(seen.named("product_impression").map((e) => (e.props as { product_ids: string[] }).product_ids), [
      ["prod2", "prod3"],
      ["prod1"],
    ]);
    // They arrive in the tracker's queue before the page goes away.
    const sent = (await page.events()).filter((e) => e.event === "product_impression");
    assert.equal(sent.length, 2);
  });

  it("reports a click with the product and its position", async () => {
    const seen = collector();
    const { container } = await mount({ analytics: { onEvent: seen.onEvent } });
    const link = container.querySelectorAll<HTMLAnchorElement>('a[data-bitsnap-products-slot="cardLink"]')[1];
    link.addEventListener("click", (e) => e.preventDefault());
    await React.act(async () => link.click());
    const [clicked] = seen.named("product_clicked");
    assert.deepEqual(clicked.props, { list_id: "catalog", position: 1 });
    assert.equal(clicked.product_id, "prod2");
  });

  it("reports add to cart for a custom cart, with product, variant, quantity and value", async () => {
    const seen = collector();
    const added: string[] = [];
    const { container } = await mount({
      analytics: { onEvent: seen.onEvent },
      onAddToCart: (p) => void added.push(p.id),
    });
    const button = container.querySelectorAll<HTMLButtonElement>('button[data-bitsnap-products-slot="addToCartButton"]')[2];
    await React.act(async () => button.click());
    assert.deepEqual(added, ["prod3"]);
    const [event] = seen.named("add_to_cart");
    assert.deepEqual(event.props, { qty: 1, value_minor: 3000, currency: "PLN" });
    assert.equal(event.product_id, "prod3");
    assert.equal(event.variant_id, "var3");
  });

  it("mutes the cart sink while onAddToCart runs, so the add is reported once", async () => {
    const seen = collector();
    const sinks: Instrument[] = [];
    const reporting = { track: () => {}, flush: () => {} } as unknown as Instrument;
    setCartInstrument(reporting);
    const { container } = await mount({
      analytics: { onEvent: seen.onEvent },
      onAddToCart: async () => {
        await Promise.resolve();
        sinks.push(getCartInstrument());
      },
    });
    const button = container.querySelector<HTMLButtonElement>('button[data-bitsnap-products-slot="addToCartButton"]')!;
    await React.act(async () => button.click());
    assert.deepEqual(sinks, [noopInstrument], "the cart helper reports nowhere inside onAddToCart");
    assert.strictEqual(getCartInstrument(), reporting, "and works again afterwards");
    setCartInstrument(null);
    assert.equal(seen.named("add_to_cart").length, 1);
  });

  it("does not report a failed add to cart", async () => {
    const seen = collector();
    const { container } = await mount({
      analytics: { onEvent: seen.onEvent },
      onAddToCart: () => Promise.reject(new Error("no")),
    });
    const originalError = console.error;
    console.error = () => {};
    const button = container.querySelector<HTMLButtonElement>('button[data-bitsnap-products-slot="addToCartButton"]')!;
    await React.act(async () => button.click());
    console.error = originalError;
    assert.equal(seen.named("add_to_cart").length, 0);
  });

  it("never reports the search text, and writes nothing to the device", async () => {
    const seen = collector();
    const before = deviceState(page.win);
    await mount({ analytics: { onEvent: seen.onEvent }, search: "jane.doe@example.com" });
    assert.deepEqual(seen.named("product_list_viewed").map((e) => e.props), [
      { list_id: "search", item_count: 3 },
    ]);
    assert.deepEqual(findPII(seen.events), []);
    assert.equal(deviceState(page.win), before);
  });

  it("sends nothing with analytics={false}", async () => {
    const seen = collector();
    const { container } = await mount({ analytics: false });
    see(container.querySelector("li")!, 1);
    await hidePage();
    assert.equal(getTracker(), undefined);
    assert.equal(seen.events.length, 0);
    assert.equal(page.pendingBeacons(), 0);
  });

  it("carries no email-like value or product text in any payload", async () => {
    const seen = collector();
    const { container } = await mount({
      analytics: { onEvent: seen.onEvent },
      onAddToCart: () => {},
    });
    const cards = Array.from(container.querySelectorAll("li"));
    cards.forEach((card) => see(card, 1));
    await hidePage();
    await React.act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    assert.ok(seen.events.length >= 3);
    assert.deepEqual(findPII(seen.events), []);
    const wire = JSON.stringify(await page.events());
    assert.ok(!wire.includes("Product 1"), "product names are not sent");
  });
});

process.on("exit", teardownReactPage);
