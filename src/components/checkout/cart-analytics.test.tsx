import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { getTracker, resetTracker } from "@/src/analytics/core";
import { findPII, collector, setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let BitsnapCheckout: typeof import("./BitsnapCart.tsx").default;
let Bitsnap: typeof import("./methods.ts").Bitsnap;
let useCheckoutStore: typeof import("./state.ts").useCheckoutStore;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  BitsnapCheckout = (await import("./BitsnapCart.tsx")).default;
  ({ Bitsnap } = await import("./methods.ts"));
  ({ useCheckoutStore } = await import("./state.ts"));
});

const product = {
  id: "prod1",
  ownerID: "o",
  name: "Mug",
  description: null,
  price: 2500,
  currency: "PLN",
  metadata: {},
  image_url: null,
  isDeliverable: false,
  variants: [{ id: "var1", name: "Blue", price: 2500, currency: "PLN" }],
};

let fetched: string[] = [];
const roots: Array<{ unmount: () => void }> = [];

const originalError = console.error;
beforeEach(() => {
  resetTracker();
  fetched = [];
  // An empty stored cart: without one the cart code shares (and mutates) a module-level template.
  page.win.localStorage.clear();
  page.win.localStorage.setItem("checkout", JSON.stringify({ products: [] }));
  useCheckoutStore.setState({ isCartVisible: false, numberOfProductsInCart: 0 });
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    fetched.push(url);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/public-commerce/products")) return json({ success: true, result: [product] });
    if (url.includes("/public-commerce/countries")) return json([{ name: "Polska", code: "PL" }]);
    if (url.includes("/public-commerce/buy")) return json({ url: "https://pay.example.test/s/1", sessionID: "s1" });
    if (init?.method === "POST" && url.endsWith("/e")) return new Response(null, { status: 202 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  // jsdom cannot navigate; the checkout redirect only logs.
  console.error = () => {};
});
afterEach(async () => {
  console.error = originalError;
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  resetTracker();
});

async function mount(props: Partial<React.ComponentProps<typeof BitsnapCheckout>> = {}) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(<BitsnapCheckout projectID={TEST_KEY} locale="pl-PL" {...props} />);
  });
}

const settle = () => React.act(async () => void (await new Promise((r) => setTimeout(r, 30))));

describe("BitsnapCheckout analytics", () => {
  it("reports adding a variant through Bitsnap.addProductToCart", async () => {
    const seen = collector();
    await mount({ analytics: { onEvent: seen.onEvent } });
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 2)));
    const [added] = seen.named("add_to_cart");
    assert.deepEqual(added.props, { qty: 2, value_minor: 5000, currency: "PLN" });
    assert.equal(added.product_id, "prod1");
    assert.equal(added.variant_id, "var1");
  });

  it("reports the drawer opening and the start of the checkout, once", async () => {
    const seen = collector();
    await mount({ analytics: { onEvent: seen.onEvent } });
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 2)));
    await React.act(async () => Bitsnap.showCart());
    await settle();
    assert.deepEqual(seen.named("cart_opened").map((e) => e.props), [
      { item_count: 2, value_minor: 5000, currency: "PLN" },
    ]);
    assert.equal(seen.named("cart_opened")[0].page_type, "cart");

    const button = page.win.document.querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="checkoutButton"]')!;
    await settle();
    await React.act(async () => button.click());
    await React.act(async () => button.click());
    await settle();
    assert.deepEqual(seen.named("checkout_started").map((e) => e.props), [
      { item_count: 2, checkout_type: "cart", value_minor: 5000, currency: "PLN" },
    ]);
  });

  it("reports removing from the drawer with the removed quantity and value", async () => {
    const seen = collector();
    await mount({ analytics: { onEvent: seen.onEvent } });
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 2)));
    await React.act(async () => Bitsnap.showCart());
    await settle();
    const remove = page.win.document.querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="removeButton"]')!;
    await React.act(async () => remove.click());
    await settle();
    const [removed] = seen.named("remove_from_cart");
    assert.deepEqual(removed.props, { qty: 2, value_minor: 5000, currency: "PLN" });
    assert.equal(removed.product_id, "prod1");
    assert.equal(removed.variant_id, "var1");
  });

  it("sends nothing with analytics={false}, and the cart still works", async () => {
    const seen = collector();
    await mount({ analytics: false });
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
    await React.act(async () => Bitsnap.showCart());
    await settle();
    assert.equal(seen.events.length, 0);
    assert.equal(getTracker(), undefined);
    assert.equal(page.pendingBeacons(), 0);
    assert.equal(useCheckoutStore.getState().numberOfProductsInCart, 1);
  });

  it("sends no personal data and adds nothing to the device", async () => {
    const seen = collector();
    await mount({ analytics: { onEvent: seen.onEvent } });
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
    await React.act(async () => Bitsnap.showCart());
    await settle();
    getTracker()?.flush();
    const wire = await page.events();
    assert.ok(seen.events.length >= 2);
    assert.deepEqual(findPII([...seen.events, ...wire]), []);
    assert.ok(!JSON.stringify(wire).includes("Mug"), "product names are not sent");
    // The cart and the locale are the library's own; analytics adds no key.
    assert.deepEqual(Object.keys(page.win.localStorage).sort(), ["bitsnap-locale", "checkout"]);
    assert.equal(page.win.sessionStorage.length, 0);
    assert.equal(page.win.document.cookie, "");
  });
});

process.on("exit", teardownReactPage);
