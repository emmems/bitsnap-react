import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { resetTracker } from "@/src/analytics/core";
import { setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";

/*
 * Class graph of the cart (PLAN D5, P15; part 2 step 7a).
 *
 * `cart.css` is hand-written and holds no Tailwind utilities, so a class name
 * the cart renders works only if it is a `bsc-*` class, the `bitsnap-react`
 * scope, or the merchant's own (`appearance.elements`, the trigger's
 * `className`). This mounts `BitsnapCheckout` (trigger included), opens it in
 * both presentations with products, two countries and the payment-method
 * choice, and in the loading, failed and empty states, and checks every class
 * token in the document.
 *
 * The express area is not mounted: no wallet is available in jsdom and InPost
 * and Revolut are answered "not available", so no wallet SDK needs a mock
 * (N21).
 *
 * `EXPECTED_OFFENDERS` is the shrinking allowlist: Tailwind classes still in
 * the cart, each with the step that removes it. The last test fails on an
 * entry that no longer renders, so every step deletes what it fixed. Empty
 * since step 17: every class the cart renders is ours or the merchant's.
 */
const EXPECTED_OFFENDERS: Record<string, string> = {
  // A token stays until its last user is rewritten; the label is the step
  // expected to remove it.
  // Step 15, line items: CartLines list, SingleProduct, ProductPrice,
  // ui/button, ui/button-group, lucide icons.
  ...removedBy("step 15", []),
  // Step 16, options and footer: CartCheckout summary, CountrySelector and
  // ui/select (native select, D4), PaymentMethodChoice, the Spinner.
  ...removedBy("step 16", []),
  // Step 17, states: skeleton layout, empty state, error with retryButton.
  ...removedBy("step 17", []),
};

function removedBy(step: string, tokens: string[]): Record<string, string> {
  return Object.fromEntries(tokens.map((token) => [token, step]));
}

/** The cart's own classes: `bsc-*`, the scope, and the theme marker of the root. */
const OURS = /^(bsc-[\w-]+|bitsnap-react|dark|light)$/;

const page = setupReactPage();

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

const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let BitsnapCheckout: typeof import("./BitsnapCart.tsx").default;
let Bitsnap: typeof import("./methods.ts").Bitsnap;
let useCheckoutStore: typeof import("./state.ts").useCheckoutStore;
let CHECKOUT_SLOT_NAMES: typeof import("./appearance.ts").CHECKOUT_SLOT_NAMES;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  BitsnapCheckout = (await import("./BitsnapCart.tsx")).default;
  ({ Bitsnap } = await import("./methods.ts"));
  ({ useCheckoutStore } = await import("./state.ts"));
  ({ CHECKOUT_SLOT_NAMES } = await import("./appearance.ts"));
});

const products = [
  {
    id: "prod1",
    ownerID: "o",
    name: "Mug",
    description: null,
    price: 2500,
    currency: "PLN",
    metadata: {},
    image_url: "https://cdn.example.test/mug.png",
    isDeliverable: true,
    variants: [{ id: "var1", name: "Blue", price: 2500, currency: "PLN" }],
  },
  {
    id: "prod2",
    ownerID: "o",
    name: "Ebook",
    description: null,
    price: 4990,
    currency: "PLN",
    metadata: {},
    image_url: null,
    isDeliverable: false,
    pricing: { discount: { regularPrice: 5990, omnibusPrice: 4990 } },
  },
];

type ProductsMode = "ok" | "fail" | "pending";
let productsMode: ProductsMode = "ok";
const roots: Array<{ unmount: () => void }> = [];
const offenders = new Map<string, string>();
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  resetTracker();
  productsMode = "ok";
  page.win.localStorage.clear();
  page.win.localStorage.setItem("checkout", JSON.stringify({ products: [] }));
  useCheckoutStore.setState({ isCartVisible: false, numberOfProductsInCart: 0, notice: undefined });
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (url.includes("/public-commerce/products")) {
      if (productsMode === "pending") return new Promise<Response>(() => {});
      return productsMode === "ok" ? json({ success: true, result: products }) : json({}, 500);
    }
    if (url.includes("/public-commerce/countries")) {
      return json([
        { name: "Polska", code: "PL" },
        { name: "Niemcy", code: "DE" },
      ]);
    }
    if (url.includes("/public-commerce/payment-methods")) {
      return json({ success: true, choice: { methods: ["online", "manual"], manualAccountTypes: ["blik"] } });
    }
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

after(teardownReactPage);

const settle = () => React.act(async () => void (await new Promise((r) => setTimeout(r, 40))));
const doc = () => page.win.document;
const trigger = () => doc().querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;

/** Merchant classes on every slot: they must pass through untouched. */
const merchantElements = () =>
  Object.fromEntries(CHECKOUT_SLOT_NAMES.map((name) => [name, { className: `merchant-${name}` }]));

async function mount(props: Record<string, unknown> = {}) {
  const container = doc().createElement("div");
  doc().body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(<BitsnapCheckout projectID={TEST_KEY} locale="en-US" analytics={false} {...props} />);
  });
}

/** Every class token in the document; anything not ours or the merchant's is an offender. */
function collect(where: string) {
  for (const element of Array.from(doc().body.querySelectorAll("[class]"))) {
    const value = element.getAttribute("class") ?? "";
    for (const token of value.split(/\s+/).filter(Boolean)) {
      if (OURS.test(token) || token.startsWith("merchant-")) continue;
      if (!offenders.has(token)) offenders.set(token, `${where}: <${element.tagName.toLowerCase()} class="${value}">`);
    }
  }
}

describe("cart class graph", () => {
  it("renders the trigger with only the scope class, or the scope and the merchant's class (D20)", async () => {
    await mount();
    assert.equal(trigger().className, "bitsnap-react");
    assert.equal(trigger().getAttribute("data-bitsnap-checkout-trigger"), "default");
    collect("trigger default");
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));

    await mount({ className: "merchant-trigger" });
    assert.equal(trigger().className, "bitsnap-react merchant-trigger");
    collect("trigger custom");
  });

  for (const presentation of ["drawer", "dialog"] as const) {
    it(`renders a full cart (${presentation}): lines, sale, two countries, payment choice`, async () => {
      await mount({ presentation, appearance: { elements: merchantElements() } });
      await React.act(async () => void (await Bitsnap.addProductToCart("var1", 2)));
      await React.act(async () => void (await Bitsnap.addProductToCart("prod2", 1)));
      await React.act(async () => Bitsnap.showCart());
      await settle();
      clockOffset += 1500;
      await settle();
      assert.ok(doc().querySelector('[data-bitsnap-checkout-slot="productName"]'), "the lines render");
      assert.ok(doc().querySelector('[data-bitsnap-checkout-slot="paymentMethods"]'), "the payment choice renders");
      assert.ok(doc().querySelector('[data-bitsnap-checkout-slot="countryTrigger"]'), "the country picker renders");
      collect(`full ${presentation}`);
    });

    it(`renders the loading, failed and empty states (${presentation})`, async () => {
      await mount({ presentation });
      await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
      await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));

      // A reload without the instant snapshot: the lines wait for /products.
      page.win.localStorage.removeItem("bitsnap-cart-view");
      productsMode = "pending";
      await mount({ presentation });
      await React.act(async () => Bitsnap.showCart());
      await settle();
      assert.ok(doc().querySelector('[data-bitsnap-checkout-slot="skeleton"]'), "the skeleton renders");
      collect(`loading ${presentation}`);
      await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
      useCheckoutStore.setState({ isCartVisible: false });

      page.win.localStorage.removeItem("bitsnap-cart-view");
      productsMode = "fail";
      await mount({ presentation });
      await React.act(async () => Bitsnap.showCart());
      await settle();
      assert.ok(doc().querySelector('[role="alert"]'), "the failed state renders");
      collect(`failed ${presentation}`);
      await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
      useCheckoutStore.setState({ isCartVisible: false });

      page.win.localStorage.setItem("checkout", JSON.stringify({ products: [] }));
      productsMode = "ok";
      await mount({ presentation });
      await React.act(async () => Bitsnap.showCart());
      await settle();
      assert.ok(doc().querySelector('[data-bitsnap-checkout-slot="emptyState"]'), "the empty state renders");
      collect(`empty ${presentation}`);
    });
  }

  it("renders only bsc-*, bitsnap-react and merchant classes, apart from the allowlist", () => {
    const unexpected = [...offenders].filter(([token]) => !(token in EXPECTED_OFFENDERS));
    assert.deepEqual(
      unexpected.map(([token, where]) => `${token} (${where})`),
      [],
      "new Tailwind classes in the cart: use bsc-* classes and cart.css",
    );
  });

  it("has no stale allowlist entry: remove what a step fixed", () => {
    const stale = Object.keys(EXPECTED_OFFENDERS).filter((token) => !offenders.has(token));
    assert.deepEqual(stale, [], "these tokens no longer render; delete them from EXPECTED_OFFENDERS");
  });
});
