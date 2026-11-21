import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { resetTracker } from "@/src/analytics/core";
import { collector, setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";

const page = setupReactPage();

// auto-animate asks `matchMedia` about reduced motion; "reduce" keeps it idle
// (jsdom has no Web Animations). Set before the cart's modules load.
Object.assign(page.win, {
  matchMedia: (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }),
});

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

const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  resetTracker();
  page.win.localStorage.clear();
  page.win.localStorage.setItem("checkout", JSON.stringify({ products: [] }));
  useCheckoutStore.setState({ isCartVisible: false, numberOfProductsInCart: 0, notice: undefined });
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/public-commerce/products")) return json({ success: true, result: [product] });
    if (url.includes("/public-commerce/countries")) return json([{ name: "Polska", code: "PL" }]);
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
const slot = (name: string) => doc().querySelector<HTMLElement>(`[data-bitsnap-checkout-slot="${name}"]`);

async function mount(props: Record<string, unknown> = {}) {
  const container = doc().createElement("div");
  doc().body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(<BitsnapCheckout projectID={TEST_KEY} locale="en-US" analytics={false} {...props} />);
  });
}

async function open() {
  await React.act(async () => trigger().click());
  await settle();
}

describe("cart presentation attribute", () => {
  it("defaults to the drawer on the root, the overlay and the panel", async () => {
    await mount();
    assert.equal(slot("root")?.getAttribute("data-bitsnap-checkout-presentation"), "drawer");
    await open();
    for (const name of ["root", "overlay", "panel"]) {
      assert.equal(slot(name)?.getAttribute("data-bitsnap-checkout-presentation"), "drawer", name);
    }
  });

  it("writes dialog when asked, and drawer for an unknown value", async () => {
    await mount({ presentation: "dialog" });
    await open();
    for (const name of ["root", "overlay", "panel"]) {
      assert.equal(slot(name)?.getAttribute("data-bitsnap-checkout-presentation"), "dialog", name);
    }
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    useCheckoutStore.setState({ isCartVisible: false });

    await mount({ presentation: "left" });
    await open();
    for (const name of ["root", "overlay", "panel"]) {
      assert.equal(slot(name)?.getAttribute("data-bitsnap-checkout-presentation"), "drawer", name);
    }
  });
});

for (const presentation of ["drawer", "dialog"] as const) {
  describe(`cart frame (${presentation})`, () => {
    it("focuses the panel on open, not the close button", async () => {
      await mount({ presentation });
      trigger().focus();
      await open();
      assert.equal(doc().activeElement, dialog());
      assert.notEqual(doc().activeElement, slot("closeButton"));
    });

    it("closes with Escape and gives the focus back to the trigger", async () => {
      await mount({ presentation });
      trigger().focus();
      await open();
      assert.equal(doc().activeElement, dialog(), "the panel takes the focus");
      await React.act(async () => {
        doc().dispatchEvent(new page.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      await settle();
      assert.equal(dialog(), null, "Escape closes the cart");
      assert.equal(useCheckoutStore.getState().isCartVisible, false);
      assert.equal(doc().activeElement, trigger(), "the focus is back on the trigger");
    });

    it("keeps the pointer-down-outside rule: pointer down on the overlay does not close, the click does", async () => {
      await mount({ presentation });
      await open();
      const overlay = slot("overlay")!;
      await React.act(async () => {
        overlay.dispatchEvent(new page.win.PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      });
      await settle();
      assert.ok(dialog(), "a pointer down outside leaves the cart open");
      await React.act(async () => overlay.click());
      await settle();
      assert.equal(dialog(), null);
    });

    it("marks the overlay and the panel with Radix's data-state for the stylesheet", async () => {
      await mount({ presentation });
      await open();
      assert.equal(slot("overlay")?.getAttribute("data-state"), "open");
      assert.equal(slot("panel")?.getAttribute("data-state"), "open");
    });

    it("renders the header as the panel's first direct child", async () => {
      await mount({ presentation });
      await open();
      const panel = dialog()!;
      assert.equal(panel.parentElement, slot("root"), "nothing wraps the panel");
      assert.equal(panel.firstElementChild, slot("header"));
      assert.ok(!slot("overlay")!.contains(panel), "the overlay does not contain the panel");
    });

    it("reports visibility once per change", async () => {
      const seen: boolean[] = [];
      await mount({ presentation, onVisibleChange: (visible: boolean) => seen.push(visible) });
      await open();
      await React.act(async () => slot("closeButton")!.click());
      await settle();
      assert.deepEqual(seen, [false, true, false]);
    });

    it("sends cart_opened once per opening", async () => {
      const seen = collector();
      await mount({ presentation, analytics: { onEvent: seen.onEvent } });
      await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
      await open();
      await React.act(async () => slot("closeButton")!.click());
      await settle();
      await open();
      assert.equal(seen.named("cart_opened").length, 2);
    });
  });
}

const html = () => doc().documentElement;
const CART_OPEN = "data-bitsnap-cart-open";

/** A stored cart of `var1` × 2 and a product the server no longer returns × 3. */
function seedWithUnavailable() {
  page.win.localStorage.setItem(
    "checkout",
    JSON.stringify({
      country: "PL",
      products: [
        { id: "line-1", productID: "var1", quantity: 2 },
        { id: "line-2", productID: "gone", quantity: 3 },
      ],
    }),
  );
  useCheckoutStore.setState({ numberOfProductsInCart: 5 });
}

for (const presentation of ["drawer", "dialog"] as const) {
  describe(`cart open mark for the consent banner (${presentation}, D19)`, () => {
    it("sets data-bitsnap-cart-open on <html> while open, removes it on close and unmount", async () => {
      await mount({ presentation });
      assert.equal(html().hasAttribute(CART_OPEN), false, "closed: no mark");
      await open();
      assert.equal(html().getAttribute(CART_OPEN), "");
      await React.act(async () => slot("closeButton")!.click());
      await settle();
      assert.equal(html().hasAttribute(CART_OPEN), false, "closed again");
      await open();
      assert.equal(html().hasAttribute(CART_OPEN), true);
      await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
      assert.equal(html().hasAttribute(CART_OPEN), false, "unmounted while open");
    });
  });

  describe(`cart regions (${presentation})`, () => {
    it("puts the header, the scroll region and the footer directly in the panel", async () => {
      await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
      await mount({ presentation });
      await open();
      const children = Array.from(dialog()!.children);
      assert.deepEqual(
        children.map((child) => child.getAttribute("data-bitsnap-checkout-slot")),
        ["header", "lines", "footer"],
      );
    });

    it("offers the empty state's Continue shopping, which closes the cart", async () => {
      await mount({ presentation });
      await open();
      const action = slot("emptyAction");
      assert.ok(action, "the empty state has its action");
      assert.equal(slot("continueShopping"), null, "no second one without a checkout button");
      await React.act(async () => action.click());
      await settle();
      assert.equal(dialog(), null);
    });
  });
}

describe("cart open mark with two carts (N16)", () => {
  it("keeps the mark until the last open cart closes", async () => {
    await mount();
    await mount({ presentation: "dialog" });
    await open(); // the store is shared: both carts open
    assert.equal(doc().querySelectorAll('[role="dialog"]').length, 2);
    assert.equal(html().hasAttribute(CART_OPEN), true);
    const [first] = roots.splice(0, 1);
    await React.act(async () => first.unmount());
    assert.equal(html().hasAttribute(CART_OPEN), true, "the other cart is still open");
    await React.act(async () => useCheckoutStore.getState().hideCart());
    await settle();
    assert.equal(html().hasAttribute(CART_OPEN), false);
  });
});

describe("Continue shopping under the checkout button", () => {
  it("renders in the dialog, after the checkout button, and closes the cart", async () => {
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
    await mount({ presentation: "dialog" });
    await open();
    const button = slot("continueShopping");
    assert.ok(button, "the dialog offers it");
    assert.equal(button.textContent, "Continue shopping");
    assert.equal(button.parentElement, slot("footer"));
    const checkout = slot("checkoutButton")!;
    assert.ok(
      checkout.compareDocumentPosition(button) & page.win.Node.DOCUMENT_POSITION_FOLLOWING,
      "under the checkout button",
    );
    await React.act(async () => button.click());
    await settle();
    assert.equal(dialog(), null);
    assert.equal(useCheckoutStore.getState().isCartVisible, false);
  });

  it("is not rendered in the drawer", async () => {
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
    await mount({ presentation: "drawer" });
    await open();
    assert.ok(slot("checkoutButton"));
    assert.equal(slot("continueShopping"), null);
  });
});

describe("unavailable line", () => {
  it("has no quantity stepper, keeps its remove button, and stays out of the header count", async () => {
    seedWithUnavailable();
    await mount();
    await open();
    await settle();
    const row = doc().querySelector<HTMLElement>("[data-bitsnap-checkout-unavailable]");
    assert.ok(row, "the unavailable row renders");
    assert.equal(row.querySelector('[data-bitsnap-checkout-slot="quantityControl"]'), null, "no stepper");
    assert.ok(row.querySelector('[data-bitsnap-checkout-slot="removeButton"]'), "the remove button stays");
    const available = doc().querySelector<HTMLElement>(
      '[data-bitsnap-checkout-slot="product"]:not([data-bitsnap-checkout-unavailable])',
    );
    assert.ok(available?.querySelector('[data-bitsnap-checkout-slot="quantityControl"]'), "an available line keeps it");
    assert.equal(slot("title")?.textContent, "Cart (2)", "only the available quantity counts");
    assert.equal(useCheckoutStore.getState().numberOfProductsInCart, 5, "the trigger's badge is unchanged");

    await React.act(async () => slot("closeButton")!.click());
    await settle();
    assert.equal(useCheckoutStore.getState().unavailableInCart, 0, "forgotten when the cart closes");
  });
});

describe("country names", () => {
  it("shows the countries in the cart's locale, in the server's order", async () => {
    const serve = globalThis.fetch;
    globalThis.fetch = (async (input: string, init?: RequestInit) =>
      String(input).includes("/public-commerce/countries")
        ? new Response(
            JSON.stringify([
              { name: "Poland", code: "PL" },
              { name: "Germany", code: "DE" },
              { name: "Atlantis", code: "XX" },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        : serve(input, init)) as typeof fetch;
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
    await mount({ locale: "pl-PL" });
    await open();
    await settle();
    const select = slot("countryTrigger") as HTMLSelectElement | null;
    assert.ok(select, "the country select renders");
    assert.deepEqual(
      Array.from(select.options).map((option) => [option.value, option.textContent]),
      [
        ["PL", "Polska"],
        ["DE", "Niemcy"],
        ["XX", "Atlantis"],
      ],
      "an unknown code keeps the server's name",
    );
  });
});

process.on("exit", teardownReactPage);
