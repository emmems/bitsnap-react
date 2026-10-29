import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { resetTracker } from "@/src/analytics/core";
import { setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";

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
  image_url: null as string | null,
  isDeliverable: false,
  variants: [{ id: "var1", name: "Blue", price: 2500, currency: "PLN" }],
};

let productsStatus = 200;
let buyUrl = "";
const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  resetTracker();
  productsStatus = 200;
  buyUrl = "https://pay.example.test/session/abc";
  page.win.localStorage.clear();
  page.win.localStorage.setItem("checkout", JSON.stringify({ products: [] }));
  useCheckoutStore.setState({ isCartVisible: false, numberOfProductsInCart: 0, notice: undefined });
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/public-commerce/products")) {
      return productsStatus === 200 ? json({ success: true, result: [product] }) : json({}, productsStatus);
    }
    if (url.includes("/public-commerce/countries")) return json([{ name: "Polska", code: "PL" }]);
    if (url.includes("/public-commerce/buy")) return json({ url: buyUrl, sessionID: "s" });
    if (init?.method === "POST" && url.endsWith("/e")) return new Response(null, { status: 202 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  console.error = () => {};
  console.warn = () => {};
});

afterEach(async () => {
  console.error = originalError;
  console.warn = originalWarn;
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  resetTracker();
});

const settle = () => React.act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const doc = () => page.win.document;
const trigger = () => doc().querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
const dialog = () => doc().querySelector<HTMLElement>('[role="dialog"]');

async function mount(props: Partial<React.ComponentProps<typeof BitsnapCheckout>> = {}) {
  const container = doc().createElement("div");
  doc().body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(<BitsnapCheckout projectID={TEST_KEY} locale="en-US" analytics={false} {...props} />);
  });
}

async function openCart() {
  await React.act(async () => trigger().click());
  await settle();
}

describe("cart drawer accessibility", () => {
  it("labels the trigger and exposes the drawer as a modal dialog inside the checkout root", async () => {
    await mount();
    assert.equal(trigger().getAttribute("aria-label"), "Open cart");
    assert.equal(trigger().getAttribute("aria-expanded"), "false");
    assert.equal(dialog(), null);

    await openCart();
    const panel = dialog()!;
    assert.ok(panel, "the dialog renders");
    assert.equal(panel.getAttribute("aria-modal"), "true");
    assert.equal(panel.getAttribute("data-bitsnap-checkout-slot"), "panel");
    assert.ok(panel.closest(".bitsnap-react"), "it renders inside the scoped root");
    const title = doc().getElementById(panel.getAttribute("aria-labelledby")!)!;
    assert.equal(title.tagName, "H1");
    assert.equal(title.textContent, "Cart");
    assert.equal(trigger().getAttribute("aria-expanded"), "true");
    assert.equal(trigger().getAttribute("aria-controls"), panel.id);

    const close = panel.querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="closeButton"]')!;
    assert.equal(close.getAttribute("type"), "button");
    assert.equal(close.getAttribute("aria-label"), "Close cart");
    assert.equal(close.querySelector("svg")?.getAttribute("aria-hidden"), "true");
    assert.equal(doc().querySelector('[data-bitsnap-checkout-slot="overlay"]')?.getAttribute("aria-hidden"), "true");
  });

  it("closes with Escape and gives the focus back to the trigger", async () => {
    await mount();
    trigger().focus();
    await openCart();
    assert.ok(dialog()!.contains(doc().activeElement), "focus moved into the panel");

    await React.act(async () => {
      doc().dispatchEvent(new page.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    assert.equal(dialog(), null);
    assert.equal(useCheckoutStore.getState().isCartVisible, false);
    assert.ok(doc().activeElement === trigger(), "focus is back on the trigger");
  });

  it("closes from the overlay and the close button", async () => {
    await mount();
    await openCart();
    await React.act(async () =>
      doc().querySelector<HTMLElement>('[data-bitsnap-checkout-slot="overlay"]')!.click(),
    );
    await settle();
    assert.equal(dialog(), null);

    await openCart();
    await React.act(async () =>
      doc().querySelector<HTMLElement>('[data-bitsnap-checkout-slot="closeButton"]')!.click(),
    );
    await settle();
    assert.equal(dialog(), null);
  });

  it("names the badge count and labels the line controls", async () => {
    await mount();
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 2)));
    await settle();
    assert.equal(trigger().getAttribute("aria-label"), "Open cart. Items in cart: 2");
    assert.ok(trigger().textContent?.includes("Items in cart: 2"));

    await openCart();
    const panel = dialog()!;
    assert.equal(panel.querySelector('[data-bitsnap-checkout-slot="productName"]')?.textContent, "Mug");
    assert.equal(panel.querySelector('[data-bitsnap-checkout-slot="productName"] + p')?.textContent, "Blue");
    assert.equal(panel.querySelector('[data-bitsnap-checkout-slot="removeButton"]')?.getAttribute("aria-label"), "Remove: Mug Blue");
    assert.deepEqual(
      Array.from(panel.querySelectorAll('[data-bitsnap-checkout-slot="quantityButton"]')).map((el) =>
        el.getAttribute("aria-label"),
      ),
      ["Decrease quantity", "Increase quantity"],
    );
    const input = panel.querySelector<HTMLInputElement>('[data-bitsnap-checkout-slot="quantityInput"]')!;
    assert.equal(input.getAttribute("inputmode"), "numeric");
    assert.equal(input.getAttribute("aria-label"), "Quantity");
    assert.equal(panel.querySelector('[data-bitsnap-checkout-slot="productImage"]'), null, "no broken image without a URL");
    assert.equal(
      panel.querySelector('[data-bitsnap-checkout-slot="summaryNote"]')?.textContent,
      "Discounts, shipping and taxes are calculated at the next step",
    );
  });
});

describe("cart product links", () => {
  it("links the image and the name to the product page given when adding", async () => {
    product.image_url = "https://cdn.example.test/mug.png";
    try {
      await mount();
      await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1, undefined, { url: "/p/mug" })));
      await React.act(async () => void (await Bitsnap.addProductToCart("prod1", 1, undefined, { url: "javascript:alert(1)" })));
      await openCart();
      const [linked, unsafe] = Array.from(dialog()!.querySelectorAll('[data-bitsnap-checkout-slot="product"]'));

      const expected = new URL("/p/mug", page.win.location.href).href;
      const nameLink = linked.querySelector<HTMLAnchorElement>('[data-bitsnap-checkout-slot="productName"] a')!;
      assert.equal(nameLink.getAttribute("href"), expected);
      assert.equal(nameLink.textContent, "Mug");
      const imageLink = linked.querySelector('[data-bitsnap-checkout-slot="productImage"]')!.closest("a")!;
      assert.equal(imageLink.getAttribute("href"), expected);
      assert.equal(imageLink.getAttribute("tabindex"), "-1", "one tab stop per item");
      assert.equal(imageLink.getAttribute("aria-hidden"), "true");

      assert.equal(unsafe.querySelector("a"), null, "a javascript: URL is not linked");
      assert.equal(unsafe.querySelector('[data-bitsnap-checkout-slot="productName"]')?.textContent, "Mug");
    } finally {
      product.image_url = null;
    }
  });
});

describe("cart loading", () => {
  it("shows a retryable alert instead of an empty cart when the products cannot be loaded", async () => {
    await mount();
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
    productsStatus = 500;
    await openCart();
    const alert = dialog()!.querySelector('[role="alert"]')!;
    assert.equal(alert.textContent, "Could not load your cart.");
    assert.equal(dialog()!.querySelector('[data-bitsnap-checkout-slot="emptyState"]'), null);

    useCheckoutStore.getState().setNotice("Could not start the payment.");
    await settle();
    assert.equal(
      Array.from(dialog()!.querySelectorAll('[role="alert"]')).map((el) => el.textContent).join("|"),
      "Could not load your cart.|Could not start the payment.",
    );
    useCheckoutStore.getState().setNotice(undefined);

    productsStatus = 200;
    const retry = Array.from(dialog()!.querySelectorAll("button")).find((el) => el.textContent === "Try again")!;
    await React.act(async () => retry.click());
    await settle();
    assert.equal(dialog()!.querySelector('[role="alert"]'), null);
    assert.equal(dialog()!.querySelector('[data-bitsnap-checkout-slot="productName"]')?.textContent, "Mug");
  });

  it("shows the subscription message through the cart instead of an alert", async () => {
    await mount();
    let blocked = 0;
    (globalThis as { alert?: () => void }).alert = () => void blocked++;
    await React.act(async () => {
      page.win.dispatchEvent(
        new page.win.MessageEvent("message", {
          data: { id: "x", type: "ADD_TO_CART", payload: { id: "sub1", isSubscription: true, quantity: 1 } },
        }),
      );
    });
    await settle();
    assert.equal(blocked, 0);
    assert.equal(dialog()!.querySelector('[role="alert"]')?.textContent, "Subscriptions cannot be added to the cart yet.");
    delete (globalThis as { alert?: () => void }).alert;
  });
});

describe("cart after the redirect to the payment", () => {
  async function checkout() {
    await mount();
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
    await openCart();
    const button = doc().querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="checkoutButton"]')!;
    await React.act(async () => button.click());
    await settle();
  }
  const storedProducts = () => JSON.parse(page.win.localStorage.getItem("checkout")!).products as unknown[];

  it("keeps the cart and remembers the order when the payment page names it", async () => {
    buyUrl = "https://bitsnap.pl/payment/common/pid1/ord1";
    await checkout();
    assert.equal(storedProducts().length, 1);
    const pending = JSON.parse(page.win.localStorage.getItem("bitsnap-pending-order")!);
    assert.equal(pending.orderId, "ord1");
    assert.equal(pending.projectId, "pid1");
    assert.equal(typeof pending.ts, "number");
    assert.equal(pending.cartProjectId, TEST_KEY);
    assert.deepEqual(pending.lines, [{ id: (storedProducts()[0] as { id: string }).id, quantity: 1 }]);
  });

  it("clears the cart before the redirect when it cannot tell the order", async () => {
    await checkout();
    assert.equal(storedProducts().length, 0);
    assert.equal(page.win.localStorage.getItem("bitsnap-pending-order"), null);
  });
});

process.on("exit", teardownReactPage);
