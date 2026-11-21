import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { create, fromBinary, toBinary, type DescMessage, type MessageInitShape } from "@bufbuild/protobuf";
import { resetTracker } from "@/src/analytics/core";
import { setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  GetPreOrderDetailsRequestSchema,
  GetPreOrderDetailsResponseSchema,
  IsOneClickPaymentAvailableResponseSchema,
} from "src/gen/proto/public/v1/public_api_pb";

/**
 * The instant drawer (plan part 1, slice 3): painted from the local snapshot,
 * quantity changes without a refetch, the price gate (D18) and the express
 * buttons (D12).
 */

const page = setupReactPage();

// "Next step" goes on only after every price was on screen for a second: the
// tests move this clock instead of waiting.
const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const lookAtCart = (ms = 1500) => void (clockOffset += ms);

/** The Apple Pay session the button creates. */
class FakeApplePaySession {
  static STATUS_SUCCESS = 0;
  static STATUS_FAILURE = 1;
  static instances: FakeApplePaySession[] = [];
  [key: string]: unknown;
  constructor() {
    FakeApplePaySession.instances.push(this);
  }
  begin() {}
  abort() {}
  completePayment() {}
  completeShippingMethodSelection() {}
}
function enableApplePay(on: boolean) {
  for (const target of [page.win as unknown as Record<string, unknown>, globalThis as unknown as Record<string, unknown>]) {
    if (on) target.ApplePaySession = FakeApplePaySession;
    else delete target.ApplePaySession;
  }
}

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let renderToString: typeof import("react-dom/server").renderToString;
let focusManager: typeof import("@tanstack/react-query").focusManager;
let onlineManager: typeof import("@tanstack/react-query").onlineManager;
let BitsnapCheckout: typeof import("./BitsnapCart.tsx").default;
let Bitsnap: typeof import("./methods.ts").Bitsnap;
let useCheckoutStore: typeof import("./state.ts").useCheckoutStore;
let snapshotModule: typeof import("./cart-snapshot.ts");
let walletAvailability: typeof import("./CartProvider.tsx").walletAvailability;
let cartCheckoutModule: typeof import("./CartCheckout.tsx");
let HOST: string;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  renderToString = (await import("react-dom/server")).renderToString;
  ({ focusManager, onlineManager } = await import("@tanstack/react-query"));
  BitsnapCheckout = (await import("./BitsnapCart.tsx")).default;
  ({ Bitsnap } = await import("./methods.ts"));
  ({ useCheckoutStore } = await import("./state.ts"));
  snapshotModule = await import("./cart-snapshot.ts");
  ({ walletAvailability } = await import("./CartProvider.tsx"));
  cartCheckoutModule = await import("./CartCheckout.tsx");
  ({ HOST } = await import("./constants.ts"));
});

// ------------------------------------------------------------------ server

const pricingOf = (price: number, priceVersion: string) => ({
  regularPrice: price,
  effectivePrice: price,
  currency: "PLN",
  referencePrice: { windowDays: 30, asOf: 0, basis: "observed-history", historyAvailable: false },
  priceVersion,
});

type Product = Record<string, unknown> & { id: string; price: number; pricing?: ReturnType<typeof pricingOf> };

function product(id: string, name: string, price: number, version: string, extra: Record<string, unknown> = {}): Product {
  return {
    id,
    ownerID: "o",
    name,
    description: null,
    price,
    currency: "PLN",
    metadata: {},
    image_url: null,
    isDeliverable: false,
    pricing: pricingOf(price, version),
    ...extra,
  };
}

/** What the server says now. */
let catalog: Map<string, Product>;
/** What a request without `cache: "no-cache"` gets for these ids (a stale HTTP cache). */
let httpCache: Map<string, Product>;
/** `ok`, `pending` (answers when `releaseProducts()` is called), `offline` or `error` (500). */
let productsMode: "ok" | "pending" | "offline" | "error";
let pendingProducts: Array<() => void>;
let paymentMethods: (body: { items: { quantity: number }[] }) => Response;
let oneClick: { applePay?: boolean; googlePay?: boolean };
let requests: { url: string; method: string; cache?: RequestCache; body?: unknown }[];
/** The network is down: nothing reaches the server. */
let networkDown: boolean;
const roots: Array<{ unmount: () => void }> = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function proto<T extends DescMessage>(schema: T, init: MessageInitShape<T>) {
  return new Response(toBinary(schema, create(schema, init)) as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/proto" },
  });
}
const setPrice = (id: string, price: number, version: string) => {
  const current = catalog.get(id)!;
  catalog.set(id, { ...current, price, pricing: pricingOf(price, version) });
};

function answerProducts(url: string, cache: RequestCache | undefined) {
  const ids = new URL(url).searchParams.get("ids")!.split(",");
  const result = ids.flatMap((id) => {
    const found = (cache !== "no-cache" ? httpCache.get(id) : undefined) ?? catalog.get(id);
    return found == null ? [] : [found];
  });
  return json({ success: true, result });
}

/** `/buy` as the server checks it: a stored version that is not the current one is refused. */
function answerBuy(body: { items: { id: string; priceVersion?: string; amount?: number }[] }) {
  for (const item of body.items) {
    const current = catalog.get(item.id);
    const pwyw = current?.priceType === "pay_what_you_want" && current.recurring == null;
    if (item.priceVersion != null && !pwyw && current?.pricing?.priceVersion !== item.priceVersion) {
      return json({ success: false, code: "price-changed", productId: item.id, error: "Price changed" }, 400);
    }
  }
  return json({ url: "https://pay.example.test/s/1", sessionID: "s1" });
}

const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;
beforeEach(() => {
  resetTracker();
  clockOffset = 0;
  enableApplePay(false);
  FakeApplePaySession.instances = [];
  page.win.localStorage.clear();
  page.win.localStorage.setItem("checkout", JSON.stringify({ products: [] }));
  snapshotModule.resetCartSnapshotState();
  walletAvailability.reset();
  useCheckoutStore.setState({ isCartVisible: false, numberOfProductsInCart: 0, notice: undefined });
  catalog = new Map([
    ["pa", product("pa", "Mug", 2500, "va1")],
    ["pb", product("pb", "Cap", 4000, "vb1")],
    ["pc", product("pc", "Tee", 6000, "vc1")],
  ]);
  httpCache = new Map();
  productsMode = "ok";
  pendingProducts = [];
  paymentMethods = () => json({ success: true, choice: null });
  oneClick = {};
  requests = [];
  networkDown = false;
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    if (networkDown) throw new TypeError("Failed to fetch");
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    requests.push({ url, method: init?.method ?? "GET", cache: init?.cache, body });
    if (url.includes("/public-commerce/products")) {
      if (productsMode === "offline") throw new TypeError("Failed to fetch");
      if (productsMode === "error") return json({}, 500);
      if (productsMode === "pending") {
        return new Promise<Response>((resolve) =>
          pendingProducts.push(() => resolve(answerProducts(url, init?.cache))),
        );
      }
      return answerProducts(url, init?.cache);
    }
    if (url.includes("/public-commerce/countries")) return json([{ name: "Polska", code: "PL" }]);
    if (url.includes("/public-commerce/payment-methods")) return paymentMethods(body);
    if (url.includes("/public-commerce/buy")) return answerBuy(body);
    if (url.endsWith("/IsOneClickPaymentAvailable")) {
      return proto(IsOneClickPaymentAvailableResponseSchema, {
        applePay: oneClick.applePay === true,
        googlePay: oneClick.googlePay === true,
      });
    }
    if (url.endsWith("/GetPreOrderDetails")) {
      return proto(GetPreOrderDetailsResponseSchema, { totalAmount: 2500, currency: "PLN", country: "PL" });
    }
    if (init?.method === "POST" && url.endsWith("/e")) return new Response(null, { status: 202 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  console.error = () => {};
  console.warn = () => {};
  console.log = () => {};
});

afterEach(async () => {
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
  for (const release of pendingProducts.splice(0)) release();
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  resetTracker();
});

// ----------------------------------------------------------------- helpers

const settle = (ms = 30) => React.act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const doc = () => page.win.document;
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s/g, " ");
const names = () =>
  [...doc().querySelectorAll('[data-bitsnap-checkout-slot="productName"]')].map((el) => el.textContent);
const total = () => text(doc().querySelector('[data-bitsnap-checkout-slot="totalValue"]'));
const linePrices = () =>
  [...doc().querySelectorAll('[data-bitsnap-checkout-slot="productPrice"]')].map((el) => text(el));
const skeletons = () => doc().querySelectorAll('[data-bitsnap-checkout-slot="skeleton"]').length;
const productRequests = () => requests.filter((r) => r.url.includes("/public-commerce/products"));
const buys = () => requests.filter((r) => r.url.includes("/public-commerce/buy"));
const methodRequests = () => requests.filter((r) => r.url.includes("/public-commerce/payment-methods"));
const oneClickRequests = () => requests.filter((r) => r.url.endsWith("/IsOneClickPaymentAvailable"));
const reviewNotice = () => doc().querySelector('[data-bitsnap-checkout-notice="review-prices"]');
const wallets = () => doc().querySelector<HTMLElement>("[data-bitsnap-checkout-wallets]");
const storedLines = () =>
  JSON.parse(page.win.localStorage.getItem("checkout")!).products as {
    id: string;
    productID: string;
    quantity: number;
    priceVersion?: string;
    amount?: number;
  }[];

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

async function add(id: string, quantity = 1, args?: { amount?: number }) {
  await React.act(async () => void (await Bitsnap.addProductToCart(id, quantity, undefined, args)));
}

/** Opens the drawer; the assertions right after it see the first committed paint. */
const open = () => React.act(async () => Bitsnap.showCart());
async function close() {
  await React.act(async () => Bitsnap.hideCart());
  await settle();
}

async function clickNext() {
  const button = doc().querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="checkoutButton"]:not([data-bitsnap-checkout-retry])')!;
  await React.act(async () => button.click());
  await settle();
}

async function releaseProducts() {
  await React.act(async () => {
    for (const release of pendingProducts.splice(0)) release();
  });
  await settle();
}

/** Another tab writes the cart. */
async function otherTabWrites(
  products: { id: string; productID: string; quantity: number; priceVersion?: string; amount?: number }[],
) {
  const checkout = JSON.parse(page.win.localStorage.getItem("checkout")!);
  const newValue = JSON.stringify({ ...checkout, products });
  page.win.localStorage.setItem("checkout", newValue);
  await React.act(async () => {
    page.win.dispatchEvent(
      new page.win.StorageEvent("storage", { key: "checkout", newValue, storageArea: page.win.localStorage }),
    );
  });
}

const PLN = (major: string) => `${major} zł`;

// ------------------------------------------------------------------- paint

describe("instant drawer: painted from the snapshot", () => {
  it("shows the lines and the total in the first commit while /products never answers (A1)", async () => {
    let root = await mount();
    await add("pa", 2);
    // A new page: the query cache is gone, the snapshot stays on the device.
    await React.act(async () => root.unmount());
    root = await mount();
    productsMode = "pending";
    await open();
    assert.deepEqual(names(), ["Mug"]);
    assert.equal(total(), PLN("50,00"));
    assert.equal(skeletons(), 0, "no skeleton frame");
    assert.equal(productRequests().at(-1)?.url.includes("ids=pa"), true, "revalidates in the background");
  });

  it("paints offline: /products rejects, the lines stay with a retry row", async () => {
    const root = await mount();
    await add("pa");
    await React.act(async () => root.unmount());
    await mount();
    productsMode = "offline";
    await open();
    assert.deepEqual(names(), ["Mug"]);
    assert.equal(skeletons(), 0);
    await settle();
    assert.deepEqual(names(), ["Mug"], "the lines stay after the failure");
    assert.equal(text(doc().querySelector('[role="alert"]')), "Nie udało się wczytać koszyka.");

    productsMode = "ok";
    const retry = doc().querySelector<HTMLButtonElement>("[data-bitsnap-checkout-retry]")!;
    await React.act(async () => retry.click());
    await settle();
    assert.equal(doc().querySelector('[role="alert"]'), null);
  });

  it("with locale=\"en\" the entry written at add paints the drawer, and every /products asks for en-US (N16)", async () => {
    await mount({ locale: "en" });
    await add("pa");
    productsMode = "pending";
    await open();
    assert.deepEqual(names(), ["Mug"]);
    assert.equal(skeletons(), 0);
    const locales = productRequests().map((r) => new URL(r.url).searchParams.get("locale"));
    assert.ok(locales.length >= 2, "the add and the drawer asked");
    assert.deepEqual([...new Set(locales)], ["en-US"]);
  });

  it("add writes the snapshot after the line, so no commit shows a line without its details", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    const seen: number[] = [];
    const observer = new page.win.MutationObserver(() => seen.push(skeletons()));
    observer.observe(doc().body, { childList: true, subtree: true });
    await add("pb");
    observer.disconnect();
    assert.deepEqual(names(), ["Mug", "Cap"], "the added line paints with its details");
    assert.equal(Math.max(0, ...seen), 0, "never a skeleton for the new line");
  });

  it("a full storage on the snapshot key still adds the line, and the drawer paints from memory (N4)", async () => {
    await mount();
    const Storage = page.win.Storage.prototype as Storage;
    const setItem = Storage.setItem;
    const writes: string[] = [];
    Storage.setItem = function (this: Storage, key: string, value: string) {
      writes.push(key);
      if (key === snapshotModule.CART_SNAPSHOT_KEY) {
        throw new page.win.DOMException("full", "QuotaExceededError");
      }
      return setItem.call(this, key, value);
    };
    try {
      writes.length = 0;
      await add("pa");
      const cartWrites = writes.filter((key) => key !== "bitsnap-locale");
      assert.equal(cartWrites[0], "checkout", "the price check writes nothing before the line is saved");
      assert.ok(cartWrites.includes(snapshotModule.CART_SNAPSHOT_KEY), "the snapshot write came after");
      assert.equal(storedLines().length, 1, "the line is in the cart");
      assert.equal(page.win.localStorage.getItem(snapshotModule.CART_SNAPSHOT_KEY), null);
      productsMode = "pending";
      await open();
      assert.deepEqual(names(), ["Mug"], "painted from the in-memory snapshot");
    } finally {
      Storage.setItem = setItem;
    }
  });

  it("renders nothing more while nothing changes (no render loop)", async () => {
    await mount();
    await add("pa");
    await open();
    await settle(60);
    const observer = new page.win.MutationObserver(() => {});
    observer.observe(doc().body, { childList: true, subtree: true, attributes: true, characterData: true });
    await settle(200);
    assert.equal(observer.takeRecords().length, 0);
    observer.disconnect();
  });
});

// --------------------------------------------------------------- quantity

describe("instant drawer: quantity and remove (D2)", () => {
  it("\"+\" updates the line and the total in the same commit, with no /products request (A7)", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    const before = productRequests().length;
    const plus = doc().querySelectorAll<HTMLButtonElement>('[data-bitsnap-checkout-slot="quantityButton"]')[1];
    await React.act(async () => plus.click());
    assert.equal(total(), PLN("50,00"));
    assert.equal(linePrices()[0], PLN("50,00"));
    assert.equal(useCheckoutStore.getState().numberOfProductsInCart, 2);
    await settle();
    assert.equal(productRequests().length, before, "no /products for a quantity change");
  });

  it("remove drops the line at once with no /products request", async () => {
    await mount();
    await add("pa");
    await add("pb");
    await open();
    await settle();
    const before = productRequests().length;
    const remove = doc().querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="removeButton"]')!;
    await React.act(async () => remove.click());
    assert.deepEqual(names(), ["Cap"]);
    assert.equal(total(), PLN("40,00"));
    await settle();
    assert.equal(productRequests().length, before, "a smaller set is answered from the session");
  });

  it("three quick \"+\" send one /payment-methods request; the one at open is not delayed", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    assert.equal(methodRequests().length, 1, "asked at open");
    const plus = () => doc().querySelectorAll<HTMLButtonElement>('[data-bitsnap-checkout-slot="quantityButton"]')[1];
    for (let i = 0; i < 3; i++) {
      await React.act(async () => plus().click());
    }
    assert.equal(methodRequests().length, 1, "nothing during the quick clicks");
    await settle(400);
    assert.equal(methodRequests().length, 2);
    assert.equal((methodRequests()[1].body as { items: { quantity: number }[] }).items[0].quantity, 4);
  });

  it("a storage that refuses the write rolls the quantity back and says so", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    const Storage = page.win.Storage.prototype as Storage;
    const setItem = Storage.setItem;
    Storage.setItem = function (this: Storage, key: string, value: string) {
      if (key === "checkout") throw new page.win.DOMException("full", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
    try {
      const plus = doc().querySelectorAll<HTMLButtonElement>('[data-bitsnap-checkout-slot="quantityButton"]')[1];
      await React.act(async () => plus.click());
      await settle();
    } finally {
      Storage.setItem = setItem;
    }
    const input = doc().querySelector<HTMLInputElement>('[data-bitsnap-checkout-slot="quantityInput"]')!;
    assert.equal(input.value, "1");
    assert.equal(total(), PLN("25,00"));
    assert.equal(
      text(doc().querySelector('[role="alert"][data-bitsnap-checkout-slot="error"]')),
      "Nie udało się zmienić tej pozycji. Koszyk pozostał bez zmian.",
    );
  });
});

// ------------------------------------------------------------------- tabs

describe("instant drawer: other tabs", () => {
  it("a cart change in another tab updates the open drawer and the badge", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    const [line] = storedLines();
    await otherTabWrites([{ ...line, quantity: 3 }]);
    assert.equal(total(), PLN("75,00"));
    assert.equal(useCheckoutStore.getState().numberOfProductsInCart, 3);
  });

  it("the badge follows another tab with the drawer closed", async () => {
    await mount();
    await add("pa");
    await otherTabWrites([...storedLines(), { id: "x2", productID: "pb", quantity: 2 }]);
    assert.equal(useCheckoutStore.getState().numberOfProductsInCart, 3);
  });

  it("a snapshot written by another tab (storage event) or by this tab re-renders the drawer", async () => {
    await mount();
    await add("pa");
    productsMode = "pending";
    await open();
    await otherTabWrites([...storedLines(), { id: "x2", productID: "pb", quantity: 1 }]);
    assert.deepEqual(names(), ["Mug"], "no details for the new line yet");
    assert.equal(skeletons(), 1, "a line-shaped placeholder");

    // Another tab learned about pb.
    const raw = JSON.parse(page.win.localStorage.getItem(snapshotModule.CART_SNAPSHOT_KEY)!);
    raw.entries["pl-PL|pb"] = { at: Date.now(), details: { id: "pb", name: "Cap", price: 4000, currency: "PLN", image_url: null } };
    const newValue = JSON.stringify(raw);
    page.win.localStorage.setItem(snapshotModule.CART_SNAPSHOT_KEY, newValue);
    await React.act(async () => {
      page.win.dispatchEvent(
        new page.win.StorageEvent("storage", {
          key: snapshotModule.CART_SNAPSHOT_KEY,
          newValue,
          storageArea: page.win.localStorage,
        }),
      );
    });
    assert.deepEqual(names(), ["Mug", "Cap"]);

    // This tab's own write (an express add) bumps the view too.
    await otherTabWrites([...storedLines(), { id: "x3", productID: "pc", quantity: 1 }]);
    assert.equal(skeletons(), 1);
    await React.act(async () => {
      snapshotModule.writeSnapshot(
        "pl-PL",
        [{ productID: "pc", details: { id: "pc", name: "Tee", price: 6000, currency: "PLN", image_url: null } }],
        ["pa", "pb", "pc"],
        { projectID: TEST_KEY },
      );
    });
    assert.deepEqual(names(), ["Mug", "Cap", "Tee"]);
    assert.equal(HOST.length > 0, true);
  });
});

// ------------------------------------------------------------- price gate

describe("instant drawer: price gate (D18)", () => {
  it("a server price unlike the snapshot is shown and marked; the first click does not buy, the second sends the fresh version (A8)", async () => {
    await mount();
    await add("pa");
    setPrice("pa", 3000, "va2");
    productsMode = "pending";
    await open();
    assert.equal(linePrices()[0], PLN("25,00"), "the snapshot first");
    await releaseProducts();
    assert.ok(linePrices()[0]?.startsWith(PLN("30,00")), "then the server's price");
    assert.equal(
      text(doc().querySelector('[data-bitsnap-checkout-price="updated"]')),
      "Cena się zmieniła: była 25,00 zł, jest 30,00 zł.",
      "marked at once, before any click (N15)",
    );
    await clickNext();
    assert.equal(buys().length, 0, "a price changed less than a second ago is unseen");
    assert.ok(reviewNotice());

    lookAtCart();
    await clickNext();
    assert.equal(buys().length, 1);
    assert.equal((buys()[0].body as { items: { priceVersion?: string }[] }).items[0].priceVersion, "va2");
  });

  it("same price, new version, on screen for a second: the first click buys with the fresh version", async () => {
    await mount();
    await add("pa");
    setPrice("pa", 2500, "va2");
    await open();
    await settle();
    assert.equal(doc().querySelector('[data-bitsnap-checkout-price="updated"]'), null, "nothing to tell");
    lookAtCart();
    await clickNext();
    assert.equal(buys().length, 1);
    assert.equal((buys()[0].body as { items: { priceVersion?: string }[] }).items[0].priceVersion, "va2");
  });

  it("an unchanged cart clicked within the first second waits it out and buys, with no notice", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    const button = doc().querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="checkoutButton"]')!;
    await React.act(async () => button.click());
    assert.equal(buys().length, 0, "not at once");
    await settle(1200);
    assert.equal(buys().length, 1);
    assert.equal(reviewNotice(), null);
  });

  it("a stale HTTP answer cannot loop the buyer: price-changed revalidates with no-cache (N3)", async () => {
    await mount();
    await add("pa");
    // The server moved on; the browser's HTTP cache still has the old answer.
    httpCache.set("pa", catalog.get("pa")!);
    setPrice("pa", 2500, "va2");
    await open();
    await settle();
    lookAtCart();
    await clickNext();
    assert.equal(buys().length, 1, "the version the drawer saw went to /buy");
    assert.equal(productRequests().at(-1)?.cache, "no-cache", "price-changed asks past the HTTP cache");
    assert.ok(reviewNotice(), "the buyer is asked to check and continue");
    assert.equal(doc().querySelector('[data-bitsnap-checkout-slot="error"]'), null, "no 'Refresh the page'");

    lookAtCart();
    await clickNext();
    assert.equal(buys().length, 2);
    assert.equal((buys()[1].body as { items: { priceVersion?: string }[] }).items[0].priceVersion, "va2");
    assert.equal(buys().length, 2, "no loop");
  });

  it("data from before the open is asked again at the open; wallets and the click wait for it (m3)", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    await close();
    setPrice("pa", 2500, "va2");
    productsMode = "pending";
    const before = productRequests().length;
    await open();
    await settle();
    assert.equal(productRequests().length, before + 1, "the cached answer is asked again");
    assert.equal(wallets()!.hasAttribute("inert"), true, "a cached answer does not unlock the wallets");
    lookAtCart();
    await clickNext();
    assert.equal(buys().length, 0, "the click waits for the answer");
    productsMode = "ok";
    await releaseProducts();
    assert.equal(buys().length, 1);
    assert.equal((buys()[0].body as { items: { priceVersion?: string }[] }).items[0].priceVersion, "va2");
  });

  it("a click that falls back to no-cache still buys the fresh version", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    await close();
    setPrice("pa", 2500, "va2");
    productsMode = "error";
    await open();
    await settle();
    productsMode = "ok";
    const before = productRequests().length;
    lookAtCart();
    await clickNext();
    assert.deepEqual(productRequests().slice(before).map((r) => r.cache), ["no-cache"]);
    assert.equal((buys()[0].body as { items: { priceVersion?: string }[] }).items[0].priceVersion, "va2");
  });

  it("a cart first opened without a snapshot is gated by version", async () => {
    page.win.localStorage.setItem(
      "checkout",
      JSON.stringify({ products: [{ id: "l1", productID: "pa", quantity: 1, priceVersion: "va0" }] }),
    );
    await mount();
    productsMode = "pending";
    await open();
    assert.equal(skeletons() > 0, true, "nothing known yet");
    await releaseProducts();
    productsMode = "ok";
    await clickNext();
    assert.equal(buys().length, 0, "the price has just appeared");
    lookAtCart();
    await clickNext();
    assert.equal((buys()[0].body as { items: { priceVersion?: string }[] }).items[0].priceVersion, "va1");
  });

  it("a line without a stored version is gated the same way", async () => {
    page.win.localStorage.setItem("checkout", JSON.stringify({ products: [{ id: "l1", productID: "pa", quantity: 1 }] }));
    await mount();
    await open();
    await settle();
    await clickNext();
    assert.equal(buys().length, 0);
    lookAtCart();
    await clickNext();
    assert.equal((buys()[0].body as { items: { priceVersion?: string }[] }).items[0].priceVersion, "va1");
  });

  it("a new version between the two clicks is marked again, not adopted", async () => {
    await mount();
    await add("pa");
    setPrice("pa", 3000, "va2");
    await open();
    await settle();
    await clickNext();
    assert.equal(buys().length, 0);

    setPrice("pa", 3500, "va3");
    lookAtCart(31_000); // past the 30 s staleTime: a focus revalidates
    await React.act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    focusManager.setFocused(undefined);
    await settle();
    assert.ok(linePrices()[0]?.startsWith(PLN("35,00")));
    await clickNext();
    assert.equal(buys().length, 0, "the newer price was not seen");
    lookAtCart();
    await clickNext();
    assert.equal((buys()[0].body as { items: { priceVersion?: string }[] }).items[0].priceVersion, "va3");
  });

  it("closing the drawer during the 1 s wait sends no /buy, even after the wait (S3)", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    const button = doc().querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="checkoutButton"]')!;
    await React.act(async () => button.click());
    assert.equal(buys().length, 0, "waiting for the price to be seen");
    await close();
    await settle(1200);
    assert.equal(buys().length, 0, "the closed drawer's click is dropped");
  });

  it("an offline click fails at once and never resumes after the drawer closed (S12)", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    lookAtCart();
    try {
      onlineManager.setOnline(false);
      networkDown = true;
      await clickNext();
      assert.equal(text(doc().querySelector('[data-bitsnap-checkout-slot="error"]')), "Coś poszło nie tak. Spróbuj ponownie później.");
      await close();
      networkDown = false;
      await React.act(async () => onlineManager.setOnline(true));
      await settle(100);
    } finally {
      networkDown = false;
      onlineManager.setOnline(true);
    }
    assert.equal(buys().length, 0, "no /buy from a click of the closed drawer");
  });

  it("an adopted price version asks /payment-methods again, so the seller's options show (S5)", async () => {
    // The server refuses a stale version; the client reads that as "no choice".
    paymentMethods = (body) =>
      (body as { items: { priceVersion?: string }[] }).items[0].priceVersion === catalog.get("pa")!.pricing!.priceVersion
        ? json({ success: true, choice: { methods: ["online", "manual"], manualAccountTypes: ["blik"] } })
        : json({ success: false, code: "price-changed", error: "Price changed" }, 400);
    const option = () => doc().querySelector('[data-bitsnap-checkout-slot="paymentMethodOption"]');
    await mount();
    await add("pa");
    setPrice("pa", 2500, "va2");
    await open();
    await settle();
    assert.equal(option(), null, "the stored version got no options");
    lookAtCart();
    await clickNext();
    assert.equal(storedLines()[0].priceVersion, "va2", "the gate adopted the new version");
    assert.equal(
      (methodRequests().at(-1)!.body as { items: { priceVersion?: string }[] }).items[0].priceVersion,
      "va2",
      "asked again with the adopted version",
    );
    assert.ok(option(), "the manual payment option shows");
    assert.equal(buys().length, 0, "the buyer sees the options before /buy");
  });

  it("a failed revalidation never sends /buy", async () => {
    const root = await mount();
    await add("pa");
    await React.act(async () => root.unmount());
    await mount();
    productsMode = "error";
    await open();
    await settle();
    lookAtCart();
    await clickNext();
    assert.equal(buys().length, 0);
    assert.equal(text(doc().querySelector('[role="alert"]')), "Nie udało się wczytać koszyka.");
  });
});

// --------------------------------------------------------- pay what you want

describe("instant drawer: pay what you want (N5)", () => {
  it("a PWYW line is priced at its amount and never marked, even when the catalog price changed", async () => {
    catalog.set("pw", product("pw", "Tip", 2500, "vw1", { priceType: "pay_what_you_want" }));
    await mount();
    await add("pw", 1, { amount: 1500 });
    setPrice("pw", 3000, "vw2");
    await open();
    assert.equal(total(), PLN("15,00"));
    await settle();
    assert.equal(total(), PLN("15,00"));
    assert.equal(doc().querySelector('[data-bitsnap-checkout-state="price-updated"]'), null);
    await clickNext();
    // No version check, only the seen rule (S13): a click within 1 s waits it out.
    assert.equal(buys().length, 0, "the amount is on screen for less than 1 s");
    assert.equal(doc().querySelector('[data-bitsnap-checkout-state="price-updated"]'), null);
    await settle(1100);
    assert.equal(buys().length, 1);
    assert.equal(reviewNotice(), null);
    assert.equal((buys()[0].body as { items: { amount?: number }[] }).items[0].amount, 1500);
  });

  it("a PWYW line without an amount sends the suggested price it showed as its amount; other lines do not change (S2)", async () => {
    catalog.set("pw", product("pw", "Tip", 2500, "vw1", { priceType: "pay_what_you_want" }));
    await mount();
    await add("pw");
    await add("pa");
    await open();
    await settle();
    assert.equal(total(), PLN("50,00"));
    lookAtCart();
    await clickNext();
    assert.equal(buys().length, 1);
    const items = (buys()[0].body as { items: { id: string; amount?: number }[] }).items;
    assert.equal(items.find((item) => item.id === "pw")!.amount, 2500);
    assert.equal("amount" in items.find((item) => item.id === "pa")!, false);
  });

  it("a PWYW amount of 0 on a product with a positive price keeps the total and the button (S4)", async () => {
    catalog.set("pw", product("pw", "Tip", 2500, "vw1", { priceType: "pay_what_you_want" }));
    await mount();
    await add("pw", 1, { amount: 0 });
    await open();
    await settle();
    assert.equal(total(), PLN("0,00"), "the charged total");
    assert.ok(doc().querySelector('[data-bitsnap-checkout-slot="checkoutButton"]'), "the button stays");
    lookAtCart();
    await clickNext();
    assert.equal((buys()[0].body as { items: { amount?: number }[] }).items[0].amount, 0);
  });

  for (const [name, extra] of [
    ["a recurring variant", { priceType: "pay_what_you_want", recurring: { billingPeriod: "monthly" } }],
    ["a product switched to a fixed price", { priceType: "one_time" }],
    ["a product without priceType", {}],
  ] as const) {
    it(`${name} with an amount is priced at the catalog price and gated`, async () => {
      catalog.set("px", product("px", "Plan", 2500, "vx1", extra));
      await mount();
      await add("px", 1, { amount: 1500 });
      await open();
      await settle();
      assert.equal(total(), PLN("25,00"));
      setPrice("px", 3000, "vx2");
      lookAtCart(31_000);
      await React.act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      focusManager.setFocused(undefined);
      await settle();
      assert.ok(doc().querySelector('[data-bitsnap-checkout-state="price-updated"]'), "marked");
      await clickNext();
      assert.equal(buys().length, 0);
    });
  }
});

// ------------------------------------------------------------ payment methods

describe("instant drawer: payment method vs a quick edit (N7)", () => {
  it("\"+\" then \"Next step\" asks for the new cart first and buys with a method it offers", async () => {
    paymentMethods = (body) =>
      json({
        success: true,
        choice:
          body.items[0].quantity === 1
            ? { methods: ["online", "cod"], manualAccountTypes: [] }
            : { methods: ["manual", "online"], manualAccountTypes: ["bankTransfer"] },
      });
    await mount();
    await add("pa");
    await open();
    await settle();
    assert.equal(methodRequests().length, 1);
    lookAtCart();
    const plus = doc().querySelectorAll<HTMLButtonElement>('[data-bitsnap-checkout-slot="quantityButton"]')[1];
    await React.act(async () => plus.click());
    await clickNext();
    assert.equal(methodRequests().length, 2, "one request for the new cart");
    assert.equal((methodRequests()[1].body as { items: { quantity: number }[] }).items[0].quantity, 2);
    assert.equal(buys().length, 1);
    const index = requests.indexOf(buys()[0]);
    assert.ok(requests.indexOf(methodRequests()[1]) < index, "asked before /buy");
    assert.ok(["manual", "online"].includes((buys()[0].body as { paymentMethod: string }).paymentMethod));
    await settle(400);
    assert.equal(methodRequests().length, 2, "the debounce sends nothing more");
  });
});

// ------------------------------------------------------------------ wallets

describe("instant drawer: express buttons (D12, N1, N2)", () => {
  it("mount once the cart is confirmed and stay through a failed refetch and another tab's line", async () => {
    const root = await mount();
    await add("pa");
    await React.act(async () => root.unmount());
    await mount();
    productsMode = "pending";
    await open();
    assert.equal(wallets(), null, "not on snapshot data");
    await releaseProducts();
    const area = wallets()!;
    assert.ok(area, "mounted after the server answered");
    assert.equal(area.getAttribute("aria-disabled"), null);
    assert.equal(area.hasAttribute("inert"), false);

    productsMode = "error";
    lookAtCart(31_000);
    await React.act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    focusManager.setFocused(undefined);
    await settle();
    assert.equal(wallets(), area, "still the same mounted area after a failed refetch");

    productsMode = "pending";
    await otherTabWrites([...storedLines(), { id: "x2", productID: "pb", quantity: 1 }]);
    await settle();
    assert.equal(wallets(), area, "not unmounted by a new line");
    assert.equal(area.getAttribute("aria-disabled"), "true");
    assert.equal(area.hasAttribute("inert"), true);
    assert.equal(area.style.pointerEvents, "none");
    assert.equal(
      text(doc().querySelector('[data-bitsnap-checkout-notice="wallets-updating"]')),
      "Aktualizujemy koszyk…",
    );

    await releaseProducts();
    assert.equal(area.hasAttribute("inert"), false, "active once the line is answered");
    assert.equal(doc().querySelector('[data-bitsnap-checkout-notice="wallets-updating"]'), null);

    const removes = () => doc().querySelectorAll<HTMLButtonElement>('[data-bitsnap-checkout-slot="removeButton"]');
    await React.act(async () => removes()[0].click());
    await React.act(async () => removes()[0].click());
    assert.equal(wallets(), null, "unmounted when the cart is empty");
  });

  it("are inert while a line is price-marked", async () => {
    await mount();
    await add("pa");
    setPrice("pa", 3000, "va2");
    productsMode = "pending";
    await open();
    await releaseProducts();
    assert.ok(doc().querySelector('[data-bitsnap-checkout-price="updated"]'));
    assert.equal(wallets()!.hasAttribute("inert"), true);
    assert.equal(wallets()!.getAttribute("aria-disabled"), "true");
  });

  it("take the whole local cart as items, also an unconfirmed line; Apple Pay keeps every line", async () => {
    enableApplePay(true);
    oneClick = { applePay: true };
    await mount();
    await add("pa", 2);
    await add("pb");
    await open();
    await settle(60);
    const previews = () =>
      requests
        .filter((r) => r.url.endsWith("/GetPreOrderDetails"))
        .map((r) => fromBinary(GetPreOrderDetailsRequestSchema, r.body as Uint8Array).items.map((i) => `${i.id}:${i.quantity}`));
    assert.deepEqual(previews().at(-1), ["pa:2", "pb:1"]);

    // Apple Pay re-creates the local cart from its items: nothing is lost.
    const before = storedLines().map((l) => `${l.productID}:${l.quantity}`);
    const button = wallets()!.querySelector<HTMLElement>("button, apple-pay-button, [role=button]")!;
    assert.ok(button, "the Apple Pay button renders");
    await React.act(async () => button.click());
    await settle(60);
    assert.ok(FakeApplePaySession.instances.length > 0);
    assert.deepEqual(storedLines().map((l) => `${l.productID}:${l.quantity}`), before);

    productsMode = "pending";
    await otherTabWrites([...storedLines(), { id: "x3", productID: "pc", quantity: 1 }]);
    await settle(60);
    assert.deepEqual(previews().at(-1), ["pa:2", "pb:1", "pc:1"], "the unconfirmed line is in the items");
  });

  it("hide Apple Pay and Google Pay while a line is pay-what-you-want; InPost and Revolut stay", async () => {
    catalog.set("pw", product("pw", "Tip", 2500, "vw1", { priceType: "pay_what_you_want" }));
    await mount();
    await add("pa");
    await add("pw", 1, { amount: 1500 });
    await open();
    await settle(60);
    assert.ok(wallets(), "the express area is there");
    assert.equal(wallets()!.querySelectorAll('[data-bitsnap-checkout-slot="paymentButtons"]').length, 1, "only InPost/Revolut");
    assert.equal(oneClickRequests().length, 0, "Google Pay asks nothing");

    const remove = doc().querySelectorAll<HTMLButtonElement>('[data-bitsnap-checkout-slot="removeButton"]')[1];
    await React.act(async () => remove.click());
    await settle(60);
    assert.equal(wallets()!.querySelectorAll('[data-bitsnap-checkout-slot="paymentButtons"]').length, 2, "Google Pay is back");
    assert.ok(oneClickRequests().length > 0);
  });
});

// ------------------------------------------------------- gate review fixes

describe("instant drawer: gate review fixes (N2, N5, m1, m2, S15)", () => {
  const priceUpdated = () => doc().querySelector('[data-bitsnap-checkout-state="price-updated"]');
  const walletsUpdating = () => doc().querySelector('[data-bitsnap-checkout-notice="wallets-updating"]');
  const failedRow = () => doc().querySelector('[role="alert"]');
  const buyItems = (index: number) =>
    (buys()[index].body as { items: { id: string; quantity: number; priceVersion?: string; amount?: number }[] }).items;

  /** `/payment-methods` answers only when `releaseMethods()` is called. */
  let heldMethods: Array<() => void>;
  function holdMethods() {
    heldMethods = [];
    paymentMethods = () =>
      new Promise<Response>((resolve) =>
        heldMethods.push(() => resolve(json({ success: true, choice: null }))),
      ) as unknown as Response;
  }
  async function releaseMethods() {
    await React.act(async () => {
      for (const release of heldMethods.splice(0)) release();
    });
    await settle();
  }

  it("N2: a reopened drawer counts the seen time again; a click within 1 s sends no /buy before 1 s", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    lookAtCart(5000);
    await close();
    await open();
    await settle();
    assert.equal(wallets()!.hasAttribute("inert"), false, "the answer asked at the reopen unlocks the wallets");
    await clickNext();
    assert.equal(buys().length, 0, "the earlier open does not count");
    await settle(500);
    assert.equal(buys().length, 0, "still under a second");
    await settle(800);
    assert.equal(buys().length, 1);
  });

  it("m1: the wait-out marks nothing: no price-updated state, wallets stay active, no updating note", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    assert.equal(wallets()!.hasAttribute("inert"), false);
    await clickNext();
    // Seen during the wait; asserted after it, so a failure leaves no wait running.
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      if (buys().length > 0) seen.push("buy");
      if (priceUpdated() != null) seen.push("price-updated");
      if (walletsUpdating() != null) seen.push("walletsUpdating");
      if (wallets()?.hasAttribute("inert")) seen.push("inert");
      await settle(200);
    }
    await settle(400);
    assert.deepEqual([...new Set(seen)], [], "nothing marked or announced during the wait");
    assert.equal(buys().length, 1);
    assert.equal(reviewNotice(), null);
  });

  it("m2: a cart change during the wait asks the server again instead of failing", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    await clickNext();
    // Another tab adds a line; its answer is still on the way when the wait ends.
    productsMode = "pending";
    await otherTabWrites([...storedLines(), { id: "x2", productID: "pb", quantity: 1 }]);
    await settle(1300);
    productsMode = "ok";
    await releaseProducts();
    assert.equal(buys().length, 0, "the new line has not been seen");
    assert.equal(failedRow(), null, "not the 'could not load' row");
    assert.ok(reviewNotice(), "asks to review the prices");
    lookAtCart();
    await clickNext();
    assert.equal(buys().length, 1);
    assert.deepEqual(buyItems(0).map((item) => item.priceVersion), ["va1", "vb1"]);
  });

  it("a classic line (no server version) clicked within 1 s shows reviewPrices, then buys", async () => {
    catalog.set("pk", { ...product("pk", "Classic", 1200, ""), pricing: undefined });
    await mount();
    await add("pk");
    await open();
    await settle();
    await clickNext();
    await settle(1200);
    assert.equal(buys().length, 0, "no wait-out without a version");
    assert.ok(reviewNotice());
    lookAtCart();
    await clickNext();
    assert.equal(buys().length, 1);
    assert.equal(buyItems(0)[0].priceVersion, undefined);
  });

  it("a price-changed recheck that passes (same price, new version) lets the second click buy", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    lookAtCart();
    setPrice("pa", 2500, "va2");
    await clickNext();
    assert.equal(buys().length, 1);
    assert.equal(buyItems(0)[0].priceVersion, "va1", "the drawer still had va1");
    assert.equal(storedLines()[0].priceVersion, "va2", "adopted silently by the recheck");
    assert.equal(priceUpdated(), null, "nothing to mark");
    assert.equal(failedRow(), null);
    await clickNext();
    assert.equal(buys().length, 2);
    assert.equal(buyItems(1)[0].priceVersion, "va2");
  });

  it("N5: a line without a version added by another tab while the payment options load runs the gate again", async () => {
    await mount();
    await add("pa");
    holdMethods();
    await open();
    await settle();
    lookAtCart();
    await clickNext();
    assert.equal(buys().length, 0, "waits for the payment options");
    await otherTabWrites([...storedLines(), { id: "x3", productID: "pc", quantity: 1 }]);
    await releaseMethods();
    await settle(100);
    assert.equal(buys().length, 0, "the new line was not seen");
    assert.ok(reviewNotice());
  });

  it("N5: a pay-what-you-want amount changed by another tab before /buy stops; it pays only after 1 s on screen (S13)", async () => {
    catalog.set("pw", product("pw", "Tip", 2500, "vw1", { priceType: "pay_what_you_want" }));
    await mount();
    await add("pw", 1, { amount: 1500 });
    holdMethods();
    await open();
    await settle();
    lookAtCart();
    await clickNext();
    const [line] = storedLines();
    await otherTabWrites([{ ...line, amount: 900 }]);
    await releaseMethods();
    assert.equal(buys().length, 0, "the new amount was not on screen when the gate passed");
    assert.ok(reviewNotice());
    assert.equal(total(), PLN("9,00"));
    assert.equal(
      text(doc().querySelector('[data-bitsnap-checkout-price="updated"]')),
      "Cena się zmieniła: była 15,00 zł, jest 9,00 zł.",
    );
    await clickNext();
    await releaseMethods();
    assert.equal(buys().length, 0, "the new amount is on screen for less than 1 s");
    assert.ok(reviewNotice());

    lookAtCart();
    await clickNext();
    // The amount is part of the /payment-methods key (S5): the options of the new cart.
    await releaseMethods();
    assert.equal(buys().length, 1);
    assert.equal(buyItems(0)[0].amount, 900);
  });

  it("S12: an amount written between the gate's read and the dispatch is not accepted as approved", async () => {
    catalog.set("pw", product("pw", "Tip", 2500, "vw1", { priceType: "pay_what_you_want" }));
    await mount();
    await add("pa");
    await add("pw", 1, { amount: 1500 });
    setPrice("pa", 2500, "va2"); // same price, new version: the gate adopts it
    await open();
    await settle();
    lookAtCart();
    // Another tab's amount lands right after the gate read storage: the
    // adoption write carries it.
    const proto = page.win.Storage.prototype;
    const setItem = proto.setItem;
    let injected = false;
    proto.setItem = function (this: Storage, key: string, value: string) {
      if (!injected && key === "checkout" && value.includes('"va2"')) {
        injected = true;
        const checkout = JSON.parse(value);
        checkout.products = checkout.products.map((l: { productID: string }) =>
          l.productID === "pw" ? { ...l, amount: 900 } : l,
        );
        value = JSON.stringify(checkout);
      }
      return setItem.call(this, key, value);
    };
    try {
      await clickNext();
    } finally {
      proto.setItem = setItem;
    }
    assert.ok(injected, "the adoption wrote storage");
    assert.deepEqual(buys().map((_, i) => buyItems(i).find((item) => item.id === "pw")?.amount), [], "no /buy");
    assert.ok(reviewNotice());
  });

  it("N5: a quantity change re-runs the gate and buys; a second change stops as marked", async () => {
    await mount();
    await add("pa");
    holdMethods();
    await open();
    await settle();
    lookAtCart();
    await clickNext();
    let [line] = storedLines();
    await otherTabWrites([{ ...line, quantity: 2 }]);
    await releaseMethods();
    // The second attempt waits for the options of the new cart.
    [line] = storedLines();
    await otherTabWrites([{ ...line, quantity: 3 }]);
    await releaseMethods();
    await settle(100);
    assert.equal(buys().length, 0, "moved twice: stop");
    assert.ok(reviewNotice());

    paymentMethods = () => json({ success: true, choice: null });
    await releaseMethods();
    await clickNext();
    assert.equal(buys().length, 1);
    assert.equal(buyItems(0)[0].quantity, 3);
  });

  it("N5: one quantity change while the options load re-runs the gate and buys the new quantity", async () => {
    await mount();
    await add("pa");
    holdMethods();
    await open();
    await settle();
    lookAtCart();
    await clickNext();
    const [line] = storedLines();
    await otherTabWrites([{ ...line, quantity: 2 }]);
    await releaseMethods();
    await releaseMethods();
    await settle(100);
    assert.equal(buys().length, 1);
    assert.equal(buyItems(0)[0].quantity, 2);
    assert.equal(reviewNotice(), null);
  });

  it("a line the answer did not return stays in storage as an unavailable row, blocks checkout, and comes back (S15)", async () => {
    await mount();
    await add("pa");
    await add("pb");
    const removed = catalog.get("pb")!;
    catalog.delete("pb"); // or an upstream lookup failed: the server still answers success
    lookAtCart(31_000); // the answer from the add is stale
    productsMode = "pending";
    await open();
    await settle();
    assert.deepEqual(names(), ["Mug", "Cap"], "painted from the snapshot");
    productsMode = "ok";
    await releaseProducts();
    await settle(60);
    const row = doc().querySelector("[data-bitsnap-checkout-unavailable]");
    assert.ok(row, "an unavailable row");
    assert.equal(text(row!.querySelector('[data-bitsnap-checkout-slot="productName"]')), "Cap");
    assert.ok(text(row!)?.includes("Produkt niedostępny"));
    assert.ok(row!.querySelector('[data-bitsnap-checkout-slot="removeButton"]'), "the buyer can remove it");
    assert.deepEqual(storedLines().map((l) => l.productID), ["pa", "pb"], "nothing removed from storage");
    assert.equal(useCheckoutStore.getState().numberOfProductsInCart, 2);
    assert.equal(total(), PLN("25,00"), "not in the total");
    const button = doc().querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="checkoutButton"]')!;
    assert.equal(button.disabled, true, "Next step is disabled");
    assert.equal(
      text(doc().querySelector('[data-bitsnap-checkout-slot="error"]')),
      "Nie wszystkie produkty są dostępne w magazynie.",
    );
    assert.equal(wallets()?.hasAttribute("inert") ?? true, true, "no wallet starts");
    assert.equal(doc().querySelector('[data-bitsnap-checkout-notice="wallets-updating"]'), null);

    // The next fresh answer has it again.
    catalog.set("pb", removed);
    lookAtCart(31_000);
    await React.act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    focusManager.setFocused(undefined);
    await settle(60);
    assert.equal(doc().querySelector("[data-bitsnap-checkout-unavailable]"), null);
    assert.deepEqual(names(), ["Mug", "Cap"]);
    assert.equal(total(), PLN("65,00"));
    assert.equal(button.disabled, false);
  });

  it("an unavailable row without a snapshot shows a generic name, and remove drops it (S15)", async () => {
    await mount();
    await add("pa");
    await open();
    await settle();
    await otherTabWrites([...storedLines(), { id: "x9", productID: "gone", quantity: 1 }]);
    await settle(60);
    const row = doc().querySelector("[data-bitsnap-checkout-unavailable]")!;
    assert.equal(text(row.querySelector('[data-bitsnap-checkout-slot="productName"]')), "Produkt niedostępny");
    await React.act(async () =>
      row.querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="removeButton"]')!.click(),
    );
    assert.deepEqual(storedLines().map((l) => l.productID), ["pa"]);
    assert.equal(doc().querySelector("[data-bitsnap-checkout-unavailable]"), null);
  });
});

// ----------------------------------------------------------- request graph

describe("request graph and wallet availability (slice 5)", () => {
  const storedGooglePay = () =>
    JSON.parse(page.win.localStorage.getItem("checkout")!).googlePayConfig as
      | { isAvailable: boolean; checkedAt?: number; checkedFor?: string }
      | undefined;
  /** A new page: the query cache and the in-memory wallet answer are gone, storage stays. */
  async function newPage(root: { unmount: () => void }) {
    await React.act(async () => root.unmount());
    walletAvailability.reset();
    return mount();
  }

  it("with a snapshot: /payment-methods and the wallet check start at the open, while /products is still out (A4)", async () => {
    const root = await mount();
    await add("pa");
    await newPage(root);
    productsMode = "pending";
    const before = requests.length;
    await open();
    await settle();
    const sent = requests.slice(before).map((r) => r.url);
    assert.ok(sent.some((url) => url.includes("/public-commerce/products")), "revalidates");
    assert.equal(methodRequests().length, 1, "payment methods do not wait for /products");
    assert.equal(oneClickRequests().length, 1, "the wallet check does not wait for /products");
    assert.equal(wallets(), null, "the buttons still wait for the confirmed cart");

    await releaseProducts();
    assert.ok(wallets(), "mounted once confirmed");
    await settle(60);
    assert.equal(oneClickRequests().length, 1, "the Google Pay button reuses the answer");
    assert.equal(methodRequests().length, 1);
  });

  it("cold, without a snapshot: /payment-methods and the wallet check do not wait for /products", async () => {
    page.win.localStorage.setItem(
      "checkout",
      JSON.stringify({ country: "PL", products: [{ id: "l1", productID: "pa", quantity: 2, priceVersion: "va1" }] }),
    );
    await mount();
    productsMode = "pending";
    await open();
    await settle();
    assert.ok(skeletons() > 0, "nothing to paint yet");
    assert.equal(methodRequests().length, 1);
    assert.equal((methodRequests()[0].body as { items: { quantity: number }[] }).items[0].quantity, 2, "built from the local lines");
    assert.equal(oneClickRequests().length, 1);
    await releaseProducts();
    assert.deepEqual(names(), ["Mug"]);
    assert.equal(methodRequests().length, 1, "the answer of /products does not ask again");
  });

  it("a reopen asks no wallet question again; after a page load a stored 'no Google Pay' is trusted for 10 min", async () => {
    let root = await mount();
    await add("pa");
    await open();
    await settle(60);
    assert.equal(oneClickRequests().length, 1);
    assert.equal(storedGooglePay()?.isAvailable, false);
    assert.equal(typeof storedGooglePay()?.checkedAt, "number");

    await close();
    await open();
    await settle(60);
    assert.equal(oneClickRequests().length, 1, "reopen: from memory");

    await close();
    root = await newPage(root);
    await open();
    await settle(60);
    assert.equal(oneClickRequests().length, 1, "new page: from storage");

    await close();
    lookAtCart(10 * 60_000 + 1000);
    root = await newPage(root);
    await open();
    await settle(60);
    assert.equal(oneClickRequests().length, 2, "asked again after 10 min");
  });

  it("a stored 'no Google Pay' without checkedAt (an older SDK rewrote the cart) is asked again", async () => {
    await mount();
    await add("pa");
    const checkout = JSON.parse(page.win.localStorage.getItem("checkout")!);
    page.win.localStorage.setItem(
      "checkout",
      JSON.stringify({
        ...checkout,
        googlePayConfig: { isAvailable: false, merchantId: "", merchantName: "", gateway: "", gatewayId: "" },
      }),
    );
    await open();
    await settle(60);
    assert.equal(oneClickRequests().length, 1);
    assert.equal(typeof storedGooglePay()?.checkedAt, "number", "stamped now");
  });

  it("a broken checkedAt does not break the cart; it only expires the answer", async () => {
    await mount();
    await add("pa");
    const checkout = JSON.parse(page.win.localStorage.getItem("checkout")!);
    page.win.localStorage.setItem(
      "checkout",
      JSON.stringify({
        ...checkout,
        googlePayConfig: { isAvailable: false, merchantId: "", merchantName: "", gateway: "", gatewayId: "", checkedAt: "soon" },
      }),
    );
    await open();
    await settle(60);
    assert.deepEqual(names(), ["Mug"]);
    assert.equal(oneClickRequests().length, 1);
  });

  it("on Safari Apple Pay and Google Pay share one request per open window", async () => {
    enableApplePay(true);
    oneClick = { applePay: true };
    await mount();
    await add("pa");
    await open();
    await settle(60);
    assert.ok(wallets()!.querySelector("button, apple-pay-button, [role=button]"), "the Apple Pay button renders");
    assert.equal(oneClickRequests().length, 1);
    await close();
    await open();
    await settle(60);
    assert.equal(oneClickRequests().length, 1);
  });

  it("the stored cart is not rewritten by the wallet check: lines changed meanwhile stay", async () => {
    await mount();
    await add("pa");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string, init?: RequestInit) => {
      if (String(input).endsWith("/IsOneClickPaymentAvailable")) await gate;
      return realFetch(input, init);
    }) as typeof fetch;
    await open();
    await settle();
    const plus = doc().querySelectorAll<HTMLButtonElement>('[data-bitsnap-checkout-slot="quantityButton"]')[1];
    await React.act(async () => plus.click());
    await React.act(async () => release());
    await settle(60);
    assert.equal(storedLines()[0].quantity, 2, "the quantity written during the request is kept");
    assert.equal(storedGooglePay()?.isAvailable, false);
  });

  it("the express area is lazy, and its buttons stay inert while a line is unconfirmed after the chunk loaded (N1, m3)", async () => {
    enableApplePay(true);
    oneClick = { applePay: true };
    await mount();
    await add("pa");
    await open();
    await settle(60);
    const area = wallets()!;
    const button = area.querySelector<HTMLElement>("button, apple-pay-button, [role=button]")!;
    assert.ok(button, "loaded and rendered");
    assert.equal(area.hasAttribute("inert"), false);

    productsMode = "pending";
    await otherTabWrites([...storedLines(), { id: "x2", productID: "pb", quantity: 1 }]);
    await settle();
    assert.equal(wallets(), area, "kept mounted");
    assert.ok(button.isConnected, "the loaded button stays");
    assert.equal(button.closest("[inert]"), area, "the button sits in the inert container");
    assert.equal(area.getAttribute("aria-disabled"), "true");
    assert.equal(area.style.pointerEvents, "none");
    assert.ok(doc().querySelector('[data-bitsnap-checkout-notice="wallets-updating"]'));
    await releaseProducts();
    assert.equal(area.hasAttribute("inert"), false);
  });

  it("a chunk that failed to load is asked for again at the next open, and the buttons show (review N1)", async () => {
    enableApplePay(true);
    oneClick = { applePay: true };
    const { expressAreaChunk, forgetExpressArea } = cartCheckoutModule;
    const realLoad = expressAreaChunk.load;
    let failing = true;
    let loads = 0;
    expressAreaChunk.load = () => {
      loads += 1;
      return failing ? Promise.reject(new TypeError("Failed to fetch dynamically imported module")) : realLoad();
    };
    // Earlier tests loaded the chunk; start this page without it.
    forgetExpressArea();
    const button = () => wallets()?.querySelector<HTMLElement>("button, apple-pay-button, [role=button]") ?? null;
    try {
      await mount();
      await add("pa");
      await open();
      await settle(60);
      assert.ok(wallets(), "the wallets container is there");
      assert.equal(button(), null, "no buttons while the chunk cannot load");
      const failedLoads = loads;
      assert.ok(failedLoads >= 1);

      failing = false;
      await close();
      await open();
      await settle(60);
      assert.ok(loads > failedLoads, "the reopened drawer asks for the chunk again");
      const area = wallets()!;
      assert.ok(button(), "the buttons show after the retry");
      assert.equal(button()!.closest("[data-bitsnap-checkout-wallets]"), area, "inside the wallets container");
      assert.equal(area.hasAttribute("inert"), false);
    } finally {
      expressAreaChunk.load = realLoad;
    }
  });
});

// --------------------------------------------------------------------- SSR

describe("instant drawer: server rendering", () => {
  it("renders on the server with a snapshot in storage, without cart content", async () => {
    await mount();
    await add("pa");
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    const g = globalThis as Record<string, unknown>;
    const saved = { window: g.window, document: g.document };
    delete g.window;
    delete g.document;
    let html = "";
    try {
      html = renderToString(<BitsnapCheckout projectID={TEST_KEY} locale="pl-PL" analytics={false} />);
    } finally {
      Object.assign(g, saved);
    }
    assert.ok(!html.includes("Mug"), "no line on the server");
    assert.ok(!html.includes('data-bitsnap-checkout-slot="product"'));
  });
});

process.on("exit", teardownReactPage);
