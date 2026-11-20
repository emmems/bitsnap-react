import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { collector, setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import { resetTracker } from "@/src/analytics/core";

/**
 * The cart warm-up (plan part 1, slice 4): the drawer's data is in the query
 * cache before the buyer opens it, with no duplicate and no analytics event.
 */

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let renderToString: typeof import("react-dom/server").renderToString;
let BitsnapCheckout: typeof import("./BitsnapCart.tsx").default;
let Bitsnap: typeof import("./methods.ts").Bitsnap;
let useCheckoutStore: typeof import("./state.ts").useCheckoutStore;
let snapshotModule: typeof import("./cart-snapshot.ts");
let warmup: typeof import("./cart-warmup.ts");
let addToCart: typeof import("../products/add-to-cart.ts");

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  renderToString = (await import("react-dom/server")).renderToString;
  BitsnapCheckout = (await import("./BitsnapCart.tsx")).default;
  ({ Bitsnap } = await import("./methods.ts"));
  ({ useCheckoutStore } = await import("./state.ts"));
  snapshotModule = await import("./cart-snapshot.ts");
  warmup = await import("./cart-warmup.ts");
  addToCart = await import("../products/add-to-cart.ts");
});

// ------------------------------------------------------------------ server

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const product = (id: string, name: string, price: number) => ({
  id,
  ownerID: "o",
  name,
  description: null,
  price,
  currency: "PLN",
  metadata: {},
  image_url: null,
  isDeliverable: false,
  pricing: {
    regularPrice: price,
    effectivePrice: price,
    currency: "PLN",
    referencePrice: { windowDays: 30, asOf: 0, basis: "observed-history", historyAvailable: false },
    priceVersion: `v-${id}`,
  },
});

const catalog = new Map([
  ["pa", product("pa", "Mug", 2500)],
  ["pb", product("pb", "Cap", 4000)],
]);

let requests: { url: string; method: string }[];
let pendingProducts: Array<() => void>;
let holdProducts: boolean;
const roots: Array<{ unmount: () => void }> = [];

/** `requestIdleCallback` as a browser has it, run by hand. */
let idle: { id: number; run: () => void; options?: { timeout?: number }; cancelled: boolean }[];
const idleGlobals = globalThis as unknown as Record<string, unknown>;

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const originalError = console.error;
const originalLog = console.log;

beforeEach(() => {
  resetTracker();
  page.win.localStorage.clear();
  snapshotModule.resetCartSnapshotState();
  useCheckoutStore.setState({ isCartVisible: false, numberOfProductsInCart: 0, notice: undefined });
  requests = [];
  pendingProducts = [];
  holdProducts = false;
  idle = [];
  idleGlobals.requestIdleCallback = (run: () => void, options?: { timeout?: number }) => {
    idle.push({ id: idle.length + 1, run, options, cancelled: false });
    return idle.length;
  };
  idleGlobals.cancelIdleCallback = (id: number) => {
    idle.find((entry) => entry.id === id)!.cancelled = true;
  };
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET" });
    if (url.includes("/public-commerce/products")) {
      const answer = () => {
        const ids = new URL(url).searchParams.get("ids")!.split(",");
        return json({ success: true, result: ids.flatMap((id) => (catalog.has(id) ? [catalog.get(id)] : [])) });
      };
      return holdProducts ? new Promise<Response>((resolve) => pendingProducts.push(() => resolve(answer()))) : answer();
    }
    if (url.includes("/public-commerce/countries")) return json([{ name: "Polska", code: "PL" }]);
    if (url.includes("/public-commerce/payment-methods")) return json({ success: true, choice: null });
    if (init?.method === "POST" && url.endsWith("/e")) return new Response(null, { status: 202 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  console.warn = () => {};
  console.error = () => {};
  console.log = () => {};
});

afterEach(async () => {
  mock.timers.reset();
  console.warn = originalWarn;
  console.error = originalError;
  console.log = originalLog;
  for (const release of pendingProducts.splice(0)) release();
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  globalThis.fetch = originalFetch;
  delete idleGlobals.requestIdleCallback;
  delete idleGlobals.cancelIdleCallback;
  page.win.document.body.innerHTML = "";
  resetTracker();
});

// ----------------------------------------------------------------- helpers

const settle = (ms = 30) => React.act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const doc = () => page.win.document;
const count = (part: string) => requests.filter((r) => r.url.includes(`/public-commerce/${part}`)).length;
const productCalls = () => count("products");
const countryCalls = () => count("countries");
const methodCalls = () => count("payment-methods");

/** A cart from an earlier visit: the lines and the stored country, before any component mounts. */
function storeCart(productIDs: string[], country: string | null = "PL") {
  page.win.localStorage.setItem(
    "checkout",
    JSON.stringify({
      ...(country != null ? { country } : {}),
      products: productIDs.map((productID, index) => ({ id: `l${index}`, productID, quantity: 1 })),
    }),
  );
}

async function mount(props: Partial<React.ComponentProps<typeof BitsnapCheckout>> = {}) {
  const container = doc().createElement("div");
  doc().body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(<BitsnapCheckout projectID={TEST_KEY} locale="pl-PL" analytics={false} {...props} />);
  });
  return root;
}

/** The first idle moment of the page. */
const runIdle = async () => {
  await React.act(async () => idle.filter((entry) => !entry.cancelled).forEach((entry) => entry.run()));
  await settle();
};

const cartButton = () => doc().querySelector<HTMLButtonElement>("button[aria-haspopup='dialog']")!;

// -------------------------------------------------------------- scheduling

describe("whenIdle", () => {
  it("uses requestIdleCallback with a 500 ms timeout and cancels it", () => {
    let ran = 0;
    const cancel = warmup.whenIdle(() => void (ran += 1));
    assert.equal(idle.length, 1);
    assert.deepEqual(idle[0].options, { timeout: 500 });
    cancel();
    assert.equal(idle[0].cancelled, true);
    assert.equal(ran, 0);
  });

  it("falls back to setTimeout where requestIdleCallback is missing, and cancels it", () => {
    delete idleGlobals.requestIdleCallback;
    delete idleGlobals.cancelIdleCallback;
    mock.timers.enable({ apis: ["setTimeout"] });
    let ran = 0;
    const cancel = warmup.whenIdle(() => void (ran += 1));
    mock.timers.tick(499);
    assert.equal(ran, 0);
    mock.timers.tick(1);
    assert.equal(ran, 1);
    const cancelled = warmup.whenIdle(() => void (ran += 1));
    cancelled();
    mock.timers.tick(1000);
    assert.equal(ran, 1, "a cancelled timer never runs");
    cancel();
  });
});

// ------------------------------------------------------------- idle warm-up

describe("idle warm-up of the mounted cart", () => {
  it("asks for the products and the countries once, at the first idle moment, and not for the payment options", async () => {
    storeCart(["pa", "pb"]);
    await mount();
    assert.equal(idle.length, 1, "scheduled once");
    assert.deepEqual(idle[0].options, { timeout: 500 });
    assert.equal(productCalls() + countryCalls(), 0, "nothing before the idle moment");

    await runIdle();
    assert.equal(productCalls(), 1);
    assert.equal(countryCalls(), 1);
    assert.equal(methodCalls(), 0, "a POST waits for intent");
    assert.match(requests.find((r) => r.url.includes("/products"))!.url, /ids=pa%2Cpb|ids=pa,pb/);
  });

  it("with prefetch={false} sends nothing at idle or on hover and focus, but warmUp() still works", async () => {
    storeCart(["pa"]);
    await mount({ prefetch: false });
    await runIdle();
    await React.act(async () => {
      cartButton().dispatchEvent(new page.win.MouseEvent("pointerover", { bubbles: true }));
      cartButton().focus();
    });
    await settle();
    assert.equal(idle.length, 0, "no idle callback is scheduled");
    assert.equal(productCalls() + countryCalls() + methodCalls(), 0);

    await React.act(async () => Bitsnap.warmUp());
    await settle();
    assert.equal(productCalls(), 1, "an explicit warmUp() is not blocked");
    assert.equal(countryCalls(), 1);
  });

  it("sends nothing for an empty cart", async () => {
    await mount();
    await runIdle();
    await React.act(async () => Bitsnap.warmUp());
    await settle();
    assert.equal(productCalls() + countryCalls() + methodCalls(), 0);
  });

  it("sends nothing on the server: no window, so nothing is mounted to warm", async () => {
    storeCart(["pa"]);
    const g = globalThis as Record<string, unknown>;
    const saved = { window: g.window, document: g.document };
    // A server has neither (the page helper installed them for the other tests).
    delete g.window;
    delete g.document;
    try {
      assert.equal(typeof renderToString(<BitsnapCheckout projectID={TEST_KEY} analytics={false} />), "string");
      warmup.warmCart(true);
    } finally {
      Object.assign(g, saved);
    }
    await settle();
    assert.equal(productCalls() + countryCalls() + methodCalls(), 0);
  });

  it("cancels the idle callback when the cart unmounts", async () => {
    storeCart(["pa"]);
    const root = await mount();
    assert.equal(idle.length, 1);
    await React.act(async () => root.unmount());
    roots.length = 0;
    assert.equal(idle[0].cancelled, true);
    await runIdle();
    assert.equal(productCalls() + countryCalls(), 0);
  });

  it("does nothing once the cart is gone, even if a late call arrives", async () => {
    storeCart(["pa"]);
    const root = await mount();
    await React.act(async () => root.unmount());
    roots.length = 0;
    warmup.warmCart(true);
    await settle();
    assert.equal(productCalls() + countryCalls() + methodCalls(), 0);
  });
});

// ------------------------------------------------------------- no duplicates

describe("no duplicate requests", () => {
  it("a second warm-up, with the answers cached, asks for nothing", async () => {
    storeCart(["pa"]);
    await mount();
    await runIdle();
    await React.act(async () => Bitsnap.warmUp());
    await settle();
    await React.act(async () => Bitsnap.warmUp());
    await settle();
    assert.equal(productCalls(), 1);
    assert.equal(countryCalls(), 1);
    assert.equal(methodCalls(), 1, "the payment options once, on the first full warm-up");
  });

  it("calls that overlap share the running request", async () => {
    storeCart(["pa"]);
    await mount();
    holdProducts = true;
    await React.act(async () => {
      Bitsnap.warmUp();
      Bitsnap.warmUp();
      cartButton().dispatchEvent(new page.win.MouseEvent("pointerover", { bubbles: true }));
    });
    await settle();
    assert.equal(productCalls(), 1, "one request in flight");
    assert.equal(countryCalls(), 1);
    assert.equal(methodCalls(), 1);
  });

  it("a hover warms the payment options too, and only once for the same cart", async () => {
    storeCart(["pa"]);
    await mount();
    await runIdle();
    for (let i = 0; i < 3; i += 1) {
      await React.act(async () => {
        cartButton().dispatchEvent(new page.win.MouseEvent("pointerover", { bubbles: true }));
      });
      await settle();
    }
    assert.equal(methodCalls(), 1);
    assert.equal(productCalls(), 1);
  });

  it("without a stored country the payment options are not asked (the drawer writes the country on open)", async () => {
    storeCart(["pa"], null);
    await mount();
    await React.act(async () => Bitsnap.warmUp());
    await settle();
    assert.equal(methodCalls(), 0);
    assert.equal(productCalls(), 1);
    assert.equal(
      JSON.parse(page.win.localStorage.getItem("checkout")!).country,
      undefined,
      "the warm-up writes nothing to the device's cart",
    );
  });
});

// ------------------------------------------------------------ keys and drawer

describe("the drawer reads what the warm-up cached", () => {
  it("opening the warmed cart paints at once and asks again only for the products, once (the price gate wants an answer from after the open)", async () => {
    storeCart(["pa"]);
    await mount();
    await React.act(async () => Bitsnap.warmUp());
    await settle();
    const before = { products: productCalls(), countries: countryCalls(), methods: methodCalls() };
    assert.deepEqual(before, { products: 1, countries: 1, methods: 1 });

    await React.act(async () => Bitsnap.showCart());
    assert.equal(
      doc().querySelector('[data-bitsnap-checkout-slot="productName"]')?.textContent,
      "Mug",
      "the first commit shows the line",
    );
    assert.equal(doc().querySelectorAll('[data-bitsnap-checkout-slot="skeleton"]').length, 0);
    await settle(80);
    assert.equal(countryCalls(), before.countries, "the countries query key matches");
    assert.equal(methodCalls(), before.methods, "the payment options query key matches");
    assert.ok(productCalls() <= before.products + 1, "at most the revalidation of the open");
  });

  it("a warm-up still running at the open is asked again once it lands, and then unlocks the wallets (S14)", async () => {
    storeCart(["pa"]);
    await mount();
    holdProducts = true;
    await React.act(async () => Bitsnap.warmUp());
    await React.act(async () => Bitsnap.showCart());
    await settle();
    assert.equal(productCalls(), 1, "the open shares the running warm-up");
    holdProducts = false;
    await React.act(async () => {
      for (const release of pendingProducts.splice(0)) release();
    });
    await settle(80);
    assert.equal(productCalls(), 2, "one more /products after the warm-up landed");
    const wallets = doc().querySelector("[data-bitsnap-checkout-wallets]");
    assert.ok(wallets);
    assert.equal(wallets!.hasAttribute("inert"), false);
  });

  it("a warm-up running at the open that omits every item is asked again once it lands (S14)", async () => {
    storeCart(["pa"]);
    await mount();
    holdProducts = true;
    await React.act(async () => Bitsnap.warmUp());
    await React.act(async () => Bitsnap.showCart());
    await settle();
    assert.equal(productCalls(), 1, "the open shares the running warm-up");
    const mug = catalog.get("pa")!;
    catalog.delete("pa"); // the warm-up's answer omits it
    const release = async () => {
      await React.act(async () => {
        for (const run of pendingProducts.splice(0)) run();
      });
      await settle(80);
    };
    try {
      await release();
    } finally {
      catalog.set("pa", mug); // the follow-up answer has it again
    }
    await release();
    assert.equal(productCalls(), 2, "the omitted line got the follow-up /products");
    assert.equal(doc().querySelector("[data-bitsnap-checkout-unavailable]"), null);
    assert.equal(doc().querySelector('[data-bitsnap-checkout-slot="productName"]')?.textContent, "Mug");
  });

  it("another cart content is another key and is asked for", async () => {
    storeCart(["pa"]);
    await mount();
    await React.act(async () => Bitsnap.warmUp());
    await settle();
    storeCart(["pa", "pb"]);
    await React.act(async () => Bitsnap.warmUp());
    await settle();
    assert.equal(productCalls(), 2);
    assert.equal(methodCalls(), 2);
    assert.equal(countryCalls(), 1, "the countries do not depend on the cart");
  });

  it("sends no cart event: warming is not a view of the cart", async () => {
    storeCart(["pa"]);
    const events = collector();
    await mount({ analytics: { onEvent: events.onEvent } });
    await settle();
    const before = events.names().length;
    await runIdle();
    await React.act(async () => Bitsnap.warmUp());
    await settle();
    assert.ok(productCalls() >= 1, "the warm-up ran");
    assert.equal(events.names().length, before, `no event from the warm-up: ${events.names().join(",")}`);
    assert.deepEqual(events.named("cart_opened"), []);
    assert.deepEqual(events.named("cart_viewed"), []);
  });
});

// ------------------------------------------------------------------ after add

describe("after add", () => {
  const mug = { id: "pa", cartItemId: "pa", name: "Mug", price: 2500, currency: "PLN" };

  it("one warm-up call follows a successful add, before the drawer opens", async () => {
    await mount();
    assert.equal(countryCalls(), 0);
    await React.act(async () => {
      await addToCart.addProductToCart(mug, { projectID: TEST_KEY, showCart: false });
    });
    await settle();
    assert.equal(JSON.parse(page.win.localStorage.getItem("checkout")!).products.length, 1);
    assert.equal(countryCalls(), 1, "countries warmed by the add");
    const productsAfterAdd = productCalls();

    await React.act(async () => Bitsnap.showCart());
    await settle(80);
    assert.equal(countryCalls(), 1, "opening does not ask again");
    assert.ok(productCalls() <= productsAfterAdd + 1, "at most the revalidation of the open");
    assert.equal(doc().querySelector('[data-bitsnap-checkout-slot="productName"]')?.textContent, "Mug");
  });

  it("the public Bitsnap.addProductToCart warms too (S19)", async () => {
    storeCart([]);
    await mount();
    await React.act(async () => void (await Bitsnap.addProductToCart("pa")));
    await settle();
    assert.equal(JSON.parse(page.win.localStorage.getItem("checkout")!).products.length, 1);
    assert.equal(countryCalls(), 1, "countries warmed by the add");
  });

  it("a failed add warms nothing", async () => {
    await mount();
    // The backend does not know the id: `addProductToCart` returns an error.
    const failing = { ...mug, id: "unknown", cartItemId: "unknown" };
    const countBefore = countryCalls();
    globalThis.fetch = (async (input: string, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, method: init?.method ?? "GET" });
      if (url.includes("/public-commerce/products")) return json({ success: true, result: [] });
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    await assert.rejects(async () => {
      await React.act(async () => {
        await addToCart.addProductToCart(failing, { projectID: TEST_KEY, showCart: false });
      });
    });
    assert.equal(countryCalls(), countBefore);
  });
});

// ------------------------------------------------------ wallet availability

describe("wallet availability (slice 5)", () => {
  type Stored = import("./wallet-availability.ts").StoredGooglePayConfig;
  let walletModule: typeof import("./wallet-availability.ts");
  before(async () => {
    walletModule = await import("./wallet-availability.ts");
  });

  /** A shared "device storage", a clock and a counted server. */
  function setup(answer: { applePay: boolean; googlePay: boolean } = { applePay: false, googlePay: false }) {
    const state = { stored: undefined as Stored | undefined, at: 1_000_000, asks: 0, writes: 0 };
    let release: (() => void) | undefined;
    const create = () =>
      walletModule.createWalletAvailability({
        ask: async () => {
          state.asks += 1;
          if (release === undefined) {
            await new Promise<void>((resolve) => (release = resolve));
          }
          return {
            ...answer,
            ...(answer.googlePay
              ? { googlePayConfig: { gateway: "g", gatewayMerchantId: "gm", merchantName: "Shop", merchantId: "m" } }
              : {}),
          };
        },
        host: () => "https://bitsnap.pl",
        readStored: () => (state.stored == null ? undefined : { ...state.stored }),
        writeStored: (config) => {
          state.writes += 1;
          state.stored = { ...config };
        },
        now: () => state.at,
      });
    return { state, create, release: () => release?.(), answerAtOnce: () => (release = () => {}) };
  }

  it("three overlapping callers share one request", async () => {
    const { state, create, release } = setup({ applePay: true, googlePay: false });
    const wallets = create();
    const calls = [wallets.applePay("p1"), wallets.googlePay("p1"), wallets.applePay("p1")];
    await new Promise((r) => setTimeout(r, 0));
    release();
    const [apple, google, apple2] = await Promise.all(calls);
    assert.equal(state.asks, 1);
    assert.equal(apple, true);
    assert.equal(apple2, true);
    assert.equal(google.isAvailable, false);
  });

  it("a negative Google Pay answer is reused for 10 minutes by a new instance (storage), then asked again", async () => {
    const { state, create, answerAtOnce } = setup();
    answerAtOnce();
    assert.equal((await create().googlePay("p1")).isAvailable, false);
    assert.equal(state.asks, 1);
    assert.equal(state.stored?.checkedAt, 1_000_000);
    assert.equal(state.stored?.checkedFor, "https://bitsnap.pl|p1");

    state.at += walletModule.WALLET_AVAILABILITY_TTL_MS - 1;
    assert.equal((await create().googlePay("p1")).isAvailable, false);
    assert.equal(state.asks, 1, "trusted within the TTL");

    state.at += 2;
    await create().googlePay("p1");
    assert.equal(state.asks, 2, "expired");
  });

  it("a negative answer without checkedAt, from the future, or for another shop is expired", async () => {
    const { state, create, answerAtOnce } = setup();
    answerAtOnce();
    const negative = { isAvailable: false, merchantId: "", merchantName: "", gateway: "", gatewayId: "" };
    state.stored = { ...negative };
    await create().googlePay("p1");
    assert.equal(state.asks, 1, "no stamp: an older SDK dropped it");

    state.stored = { ...negative, checkedAt: state.at + 60_000, checkedFor: "https://bitsnap.pl|p1" };
    await create().googlePay("p1");
    assert.equal(state.asks, 2, "a stamp in the future");

    state.stored = { ...negative, checkedAt: state.at, checkedFor: "https://bitsnap.pl|p2" };
    await create().googlePay("p1");
    assert.equal(state.asks, 3, "another shop");
  });

  it("a positive Google Pay answer is kept as before: no request while it is stored", async () => {
    const { state, create, answerAtOnce } = setup({ applePay: false, googlePay: true });
    answerAtOnce();
    const config = await create().googlePay("p1");
    assert.deepEqual(
      { ...config },
      { isAvailable: true, gateway: "g", gatewayId: "gm", merchantName: "Shop", merchantId: "m" },
    );
    state.at += 24 * 60 * 60_000;
    await create().googlePay("p1");
    assert.equal(state.asks, 1);
  });

  it("the answer in memory is reused for 10 minutes, and nothing is written when nothing changed", async () => {
    const { state, create, answerAtOnce } = setup();
    answerAtOnce();
    const wallets = create();
    await wallets.applePay("p1");
    await wallets.googlePay("p1");
    await wallets.googlePay("p1");
    assert.equal(state.asks, 1);
    assert.equal(state.writes, 1, "one write for the new answer");
    state.at += walletModule.WALLET_AVAILABILITY_TTL_MS;
    await wallets.applePay("p1");
    assert.equal(state.asks, 2);
  });

  it("a failed request is not kept: the next caller asks again", async () => {
    let fail = true;
    let asks = 0;
    const wallets = walletModule.createWalletAvailability({
      ask: async () => {
        asks += 1;
        if (fail) throw new Error("offline");
        return { applePay: true, googlePay: false };
      },
      host: () => "https://bitsnap.pl",
      readStored: () => undefined,
      writeStored: () => {},
    });
    await assert.rejects(wallets.applePay("p1"));
    fail = false;
    assert.equal(await wallets.applePay("p1"), true);
    assert.equal(asks, 2);
  });
});
