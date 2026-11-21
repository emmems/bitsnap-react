import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { resetTracker } from "@/src/analytics/core";
import { setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";

const page = setupReactPage();

// auto-animate initialises only when `window` has a `ResizeObserver`, then asks
// `matchMedia` about reduced motion once for every parent it is attached to.
// Answering "reduce" keeps it from animating (jsdom has no Web Animations) and
// makes every attach countable. Set before the cart's modules load.
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
let autoAnimateAttaches = 0;
Object.assign(page.win, {
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
  matchMedia: (query: string) => {
    if (query === REDUCED_MOTION) autoAnimateAttaches += 1;
    return {
      matches: query === REDUCED_MOTION,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    };
  },
});

// "Next step" goes on only after every price was on screen for a second (the
// price gate, D18): the tests move this clock instead of waiting.
const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const lookAtCart = () => void (clockOffset += 1500);

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

const mount = mountCart;
const settle = () => React.act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const doc = () => page.win.document;
const trigger = () => doc().querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
const dialog = () => doc().querySelector<HTMLElement>('[role="dialog"]');

async function mountCart(props: Partial<React.ComponentProps<typeof BitsnapCheckout>> = {}) {
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

// One accessibility contract for every presentation (PLAN D7): the same
// assertions run for the drawer and the dialog.
for (const presentation of ["drawer", "dialog"] as const) {
describe(`cart accessibility (${presentation})`, () => {
  const mount = (props: Partial<React.ComponentProps<typeof BitsnapCheckout>> = {}) =>
    mountCart({ presentation, ...props });

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
    const root = panel.closest('[data-bitsnap-checkout="root"]');
    assert.ok(root, "it renders inside the cart root");
    // No `bitsnap-react` on the root: the main stylesheet's `.bitsnap-react`
    // block would redefine `--background` & co. there (19a review B1).
    assert.equal(root.classList.contains("bitsnap-react"), false);
    assert.equal(panel.getAttribute("data-bitsnap-checkout-presentation"), presentation);
    const title = doc().getElementById(panel.getAttribute("aria-labelledby")!)!;
    assert.equal(title.tagName, "H1");
    assert.equal(title.textContent, "Cart", "an empty cart shows no count");
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
    assert.equal(doc().activeElement, dialog(), "the panel itself takes the focus, not the close button (D11)");
    assert.equal(dialog()!.getAttribute("tabindex"), "-1");

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

  it("leaves the drawer's enter animation to cart.css, not auto-animate on the root", async () => {
    // auto-animate on the root ran its "add" keyframes on the portalled panel:
    // opacity 0 for the first ~250 ms of every open.
    autoAnimateAttaches = 0;
    await mount();
    await openCart();
    const panel = dialog()!;
    assert.ok(panel.closest('[data-bitsnap-checkout="root"]'), "the panel renders inside the checkout root");
    assert.equal(autoAnimateAttaches, 1, "auto-animate is attached to something besides the products list");
    assert.equal(panel.getAttribute("data-state"), "open", "cart.css keys the enter animation on data-state");
    for (const property of ["opacity", "transform", "animation"] as const) {
      assert.equal(panel.style[property], "", `the panel has an inline ${property}`);
    }
  });

  it("offers \"Continue shopping\" in the empty cart, which closes it (R15)", async () => {
    await mount();
    await openCart();
    const panel = dialog()!;
    assert.equal(panel.querySelector('[data-bitsnap-checkout-slot="emptyState"]')?.textContent, "Your cart is empty.");
    assert.equal(panel.querySelector('[data-bitsnap-checkout-slot="footer"]'), null, "no footer in the empty cart");
    const action = panel.querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="emptyAction"]')!;
    assert.equal(action.textContent, "Continue shopping");
    assert.equal(action.type, "button");
    await React.act(async () => action.click());
    await settle();
    assert.equal(useCheckoutStore.getState().isCartVisible, false, "the cart is closed");
  });

  it("names the badge count and labels the line controls", async () => {
    await mount();
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 2)));
    await settle();
    assert.equal(trigger().getAttribute("aria-label"), "Open cart. Items in cart: 2");
    assert.ok(trigger().textContent?.includes("Items in cart: 2"));

    await openCart();
    const panel = dialog()!;
    // The title carries the item count from the store (PLAN §5 item 8).
    assert.equal(doc().getElementById(panel.getAttribute("aria-labelledby")!)?.textContent, "Cart (2)");
    assert.equal(panel.querySelector('[data-bitsnap-checkout-slot="productName"]')?.textContent, "Mug");
    assert.equal(panel.querySelector('[data-bitsnap-checkout-slot="productVariant"]')?.textContent, "Blue");
    assert.equal(
      panel.querySelector('[data-bitsnap-checkout-slot="productUnitPrice"]')?.textContent?.replace(/\s/g, " "),
      "PLN 25.00 × 2",
      "the unit price for a quantity above 1",
    );
    assert.equal(panel.querySelector('[data-bitsnap-checkout-slot="quantityControl"]')?.getAttribute("role"), "group");
    assert.equal(
      panel.querySelector('[data-bitsnap-checkout-slot="quantityControl"]')?.getAttribute("aria-label"),
      "Quantity: Mug Blue",
      "each stepper group names its line (N4)",
    );
    assert.equal(panel.querySelector('[data-bitsnap-checkout-slot="removeButton"]')?.getAttribute("title"), "Remove");
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
    assert.equal(panel.querySelector("img"), null, "no broken image without a URL");
    const tile = panel.querySelector('[data-bitsnap-checkout-slot="productImage"]');
    assert.equal(tile?.tagName, "SPAN", "a placeholder tile instead");
    assert.equal(tile?.getAttribute("aria-hidden"), "true");
    assert.ok(tile?.querySelector("svg"), "the tile shows an image icon");
    assert.equal(
      panel.querySelector('[data-bitsnap-checkout-slot="summaryNote"]')?.textContent,
      "Discounts, shipping and taxes are calculated at the next step",
    );
    // One structure (D7, N11): header, scroll region, footer, no wrapper.
    assert.deepEqual(
      Array.from(panel.children).map((child) => child.getAttribute("data-bitsnap-checkout-slot")),
      ["header", "lines", "footer"],
    );
    const cta = panel.querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="checkoutButton"]')!;
    assert.equal(cta.textContent, "Go to checkout", "plain CTA, no amount (D10)");
    assert.equal(cta.closest('[data-bitsnap-checkout-slot="footer"]')?.parentElement, panel);
    assert.equal(
      panel.querySelector('[data-bitsnap-checkout-slot="deliveryText"]'),
      null,
      "the inline delivery note is gone",
    );
  });
});

}

describe("cart trigger", () => {
  it("is styled by cart.css only without a merchant class (D20)", async () => {
    await mount();
    assert.equal(trigger().getAttribute("data-bitsnap-checkout-trigger"), "default");
    assert.equal(trigger().className, "bitsnap-react");
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));

    await mount({ className: "my-cart-button" });
    assert.equal(trigger().getAttribute("data-bitsnap-checkout-trigger"), "custom");
    assert.equal(trigger().className, "bitsnap-react my-cart-button");
  });

  it("treats className=\"\" as a merchant look: custom, with no default styling (D20, S2)", async () => {
    // An empty string meant "no default look" before 1.32; it must not fall
    // back to the default trigger styles.
    await mount({ className: "" });
    assert.equal(trigger().getAttribute("data-bitsnap-checkout-trigger"), "custom");
    assert.equal(trigger().className, "bitsnap-react");
  });

  it("counts before the lines load: the title reads the store", async () => {
    useCheckoutStore.setState({ numberOfProductsInCart: 3 });
    productsStatus = 500;
    await mount();
    useCheckoutStore.setState({ numberOfProductsInCart: 3 });
    await openCart();
    const panel = dialog()!;
    assert.equal(doc().getElementById(panel.getAttribute("aria-labelledby")!)?.textContent, "Cart (3)");
  });
});

describe("cart line details", () => {
  it("hides a variant equal to the name and the unit price for one item (F-09)", async () => {
    product.variants[0].name = " mug ";
    try {
      await mount();
      await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
      await openCart();
      const line = dialog()!.querySelector('[data-bitsnap-checkout-slot="product"]')!;
      assert.equal(line.querySelector('[data-bitsnap-checkout-slot="productName"]')?.textContent, "Mug");
      assert.equal(line.querySelector('[data-bitsnap-checkout-slot="productVariant"]'), null);
      assert.equal(line.querySelector('[data-bitsnap-checkout-slot="productUnitPrice"]'), null);
    } finally {
      product.variants[0].name = "Blue";
    }
  });
});

describe("cart line removal", () => {
  const removeButtons = () =>
    Array.from(dialog()!.querySelectorAll<HTMLButtonElement>('[data-bitsnap-checkout-slot="removeButton"]'));
  const announcer = () => dialog()!.querySelector<HTMLElement>("[data-bitsnap-checkout-announcer]")!;

  it("moves the focus to the next line, then to the panel, and announces the empty cart (S1, N7)", async () => {
    await mount();
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
    await React.act(async () => void (await Bitsnap.addProductToCart("prod1", 1)));
    await openCart();
    const region = announcer();
    assert.equal(region.getAttribute("role"), "status");
    assert.equal(region.textContent, "", "nothing to announce while the cart has lines");
    const [first, second] = removeButtons();
    assert.ok(first && second, "two lines");

    first.focus();
    await React.act(async () => first.click());
    await settle();
    assert.ok(removeButtons().length === 1 && removeButtons()[0] === second, "the first line is gone");
    // The panel's focus scope moves the focus to the panel when the line goes;
    // the removal still hands it on to the remaining line.
    assert.ok(doc().activeElement === second, "focus lands on the remaining line's remove button");

    await React.act(async () => second.click());
    await settle();
    assert.equal(removeButtons().length, 0);
    assert.ok(doc().activeElement === dialog(), "removing the last line leaves the focus on the panel");
    assert.ok(announcer() === region, "the live region was on the page before the change");
    assert.equal(region.textContent, "Your cart is empty.");
    assert.ok(dialog()!.querySelector('[data-bitsnap-checkout-slot="emptyState"]'), "the empty state shows");
  });

  it("does not announce a cart that opens empty", async () => {
    await mount();
    await openCart();
    assert.equal(announcer().textContent, "");
  });

  it("keeps the line at quantity 1 when 0 is typed: only the trash button removes (N5)", async () => {
    await mount();
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 2)));
    await openCart();
    const input = dialog()!.querySelector<HTMLInputElement>('[data-bitsnap-checkout-slot="quantityInput"]')!;
    const setValue = Object.getOwnPropertyDescriptor(page.win.HTMLInputElement.prototype, "value")!.set!;
    input.focus();
    await React.act(async () => {
      setValue.call(input, "0");
      input.dispatchEvent(new page.win.Event("input", { bubbles: true }));
    });
    await React.act(async () => {
      input.dispatchEvent(new page.win.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
    assert.equal(removeButtons().length, 1, "the line stays");
    assert.equal(input.value, "1");
    assert.ok(doc().activeElement === input, "the focus stays in the input");
  });
});

describe("Google Pay status", () => {
  it("announces the confirmation with a visually hidden status beside a spinner (S2)", async () => {
    const { WalletBusy } = await import("./GooglePay.tsx");
    const { CheckoutTextsProvider } = await import("./texts.context.tsx");
    const container = doc().createElement("div");
    doc().body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    const render = (busy: boolean, locale = "en-US") =>
      React.act(async () =>
        root.render(
          <CheckoutTextsProvider locale={locale}>
            <WalletBusy busy={busy} />
          </CheckoutTextsProvider>,
        ),
      );

    await render(false);
    const status = container.querySelector<HTMLElement>('[data-bitsnap-checkout-part="wallet-busy"]')!;
    assert.equal(status.getAttribute("role"), "status", "the live region is on the page before the payment");
    assert.equal(status.textContent, "");
    assert.equal(status.children.length, 0, "empty, so cart.css hides it");

    await render(true);
    assert.ok(container.querySelector('[data-bitsnap-checkout-part="wallet-busy"]') === status, "the same region");
    assert.equal(status.querySelector('[data-bitsnap-checkout-part="sr"]')?.textContent, "Confirming your payment…");
    assert.equal(status.querySelector(".bsc-spinner")?.getAttribute("aria-hidden"), "true");
    assert.equal(status.closest("[data-bitsnap-checkout]"), null, "no checkout root: the part attribute styles it");

    await render(true, "pl-PL");
    assert.equal(status.querySelector('[data-bitsnap-checkout-part="sr"]')?.textContent, "Potwierdzamy płatność…");
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
    // A new page: the add warmed this cache (S19), a reload starts without it.
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    await mount();
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
    assert.equal(retry.getAttribute("data-bitsnap-checkout-slot"), "retryButton", "not styled by checkoutButton (F-15)");
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

  it("ignores a bad ADD_TO_CART payload with a warning, then still accepts a good one", async () => {
    await mount();
    const warnings: unknown[][] = [];
    console.warn = (...args: unknown[]) => void warnings.push(args);
    const post = (payload: unknown) =>
      React.act(async () => {
        page.win.dispatchEvent(
          new page.win.MessageEvent("message", { data: { id: "x", type: "ADD_TO_CART", payload } }),
        );
      });

    await post({ id: 5, quantity: 1 });
    await post({ id: "var1", quantity: "2" });
    await post(undefined);
    await settle();
    assert.equal(useCheckoutStore.getState().numberOfProductsInCart, 0);
    assert.equal(useCheckoutStore.getState().isCartVisible, false);
    assert.equal(dialog(), null);
    const problems = warnings
      .filter(([message]) => message === "cannot add item to cart")
      .map(([, error]) => (error as Error).message);
    assert.deepEqual(problems, [
      "addToCart.id: expected a string",
      "addToCart.quantity: expected a number",
      "addToCart: expected an object",
    ]);

    await post({ id: "var1", quantity: 2, somethingElse: true });
    await settle();
    assert.equal(useCheckoutStore.getState().numberOfProductsInCart, 2);
    assert.equal(useCheckoutStore.getState().isCartVisible, true);
  });

  it("window.cart.buyProduct warns about a bad argument and sends nothing", async () => {
    await mount();
    const warnings: unknown[][] = [];
    console.warn = (...args: unknown[]) => void warnings.push(args);
    const requests: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: string, init?: RequestInit) => {
      requests.push(String(input));
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      const cart = (page.win as unknown as { cart: { buyProduct(args: unknown): Promise<void> } }).cart;
      assert.equal(typeof cart.buyProduct, "function");
      await cart.buyProduct({ productID: 7 });
      await cart.buyProduct(null);
      await cart.buyProduct({ productID: "var1", marketingAgreement: "yes" });
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.deepEqual(requests, []);
    assert.deepEqual(
      warnings.map(([error]) => (error as Error).message),
      [
        "buyProduct.productID: expected a string",
        "buyProduct: expected an object",
        "buyProduct.marketingAgreement: expected a boolean",
      ],
    );
  });
});

describe("cart after the redirect to the payment", () => {
  async function checkout() {
    await mount();
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
    await openCart();
    const button = doc().querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="checkoutButton"]')!;
    lookAtCart();
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
