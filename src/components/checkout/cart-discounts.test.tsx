import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { resetTracker } from "@/src/analytics/core";
import { setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";

/*
 * The buyer's discounts in the drawer (`GetCartDiscountContext`): the request
 * the drawer sends, the lines it shows (customer or club wins, the struck one
 * with its reason and screen-reader text), the hint for an anonymous buyer,
 * the express buttons held back only while the customer discount applies, and
 * the footer as before on any failure.
 */

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let BitsnapCheckout: typeof import("./BitsnapCart.tsx").default;
let Bitsnap: typeof import("./methods.ts").Bitsnap;
let useCheckoutStore: typeof import("./state.ts").useCheckoutStore;
let discountsModule: typeof import("./cart-discounts.ts");
let panelSessionKey: typeof import("../../panel/session-storage.ts").panelSessionKey;
let setPanelConfig: typeof import("../../panel/config.ts").setPanelConfig;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  BitsnapCheckout = (await import("./BitsnapCart.tsx")).default;
  ({ Bitsnap } = await import("./methods.ts"));
  ({ useCheckoutStore } = await import("./state.ts"));
  discountsModule = await import("./cart-discounts.ts");
  ({ panelSessionKey } = await import("../../panel/session-storage.ts"));
  ({ setPanelConfig } = await import("../../panel/config.ts"));
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
/** A pay-what-you-want product with a suggested 25,00 zł. */
const tip = { ...product, id: "tip", name: "Tip", variants: undefined, priceType: "pay_what_you_want" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const SERVICE = "/api/rpc/public.v1.LoyaltyCustomerService/";

type Call = { body: Record<string, unknown>; headers: Record<string, string> };
let discountCalls: Call[] = [];
let exchangeCalls: Call[] = [];
let discountAnswer: () => Response | Promise<Response>;
let exchangeAnswer: () => Response | Promise<Response>;
let products: unknown[] = [];
const roots: Array<{ unmount: () => void }> = [];

/** What the server answers when it does not price the cart (anonymous buyer, no customer discounts). */
const unpriced = (extra: Record<string, unknown> = {}) => ({
  currency: "",
  itemsSubtotalMinor: "0",
  productsAfterDiscountsMinor: "0",
  ...extra,
});

/** A Response the test sends when it chooses. */
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { promise, resolve };
}

/** A cart of 2 × 25,00 zł (5000 minor units). */
const context = (extra: Record<string, unknown> = {}) => ({
  currency: "PLN",
  itemsSubtotalMinor: "5000",
  productsAfterDiscountsMinor: "5000",
  ...extra,
});
const customerWins = context({
  authenticated: true,
  customerDiscountsAvailable: true,
  discountOutcome: {
    applied: [{ kind: "customer", minor: "500", id: "r1", bp: 1000 }],
    struck: [{ kind: "club", minor: "300", id: "c1", name: "VIP" }],
    customerWon: true,
  },
  productsAfterDiscountsMinor: "4500",
});
const clubWins = context({
  authenticated: true,
  customerDiscountsAvailable: true,
  discountOutcome: {
    applied: [{ kind: "club", minor: "800", id: "c1", name: "VIP" }],
    struck: [{ kind: "customer", minor: "500", id: "r1", bp: 1000 }],
  },
  productsAfterDiscountsMinor: "4200",
});

const originalError = console.error;
const originalWarn = console.warn;
beforeEach(() => {
  resetTracker();
  discountsModule.forgetDiscountSessions();
  setPanelConfig({ host: undefined });
  page.win.localStorage.clear();
  page.win.sessionStorage.clear();
  products = [product];
  page.win.localStorage.setItem("checkout", JSON.stringify({ products: [] }));
  useCheckoutStore.setState({ isCartVisible: false, numberOfProductsInCart: 0, notice: undefined });
  discountCalls = [];
  exchangeCalls = [];
  discountAnswer = () => json(unpriced());
  exchangeAnswer = () => json({ sessionToken: "loyalty-token", expiresAt: String(Math.floor(Date.now() / 1000) + 3600), email: "a@b.pl" });
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    const call = () => ({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    });
    if (url.endsWith(`${SERVICE}GetCartDiscountContext`)) {
      discountCalls.push(call());
      return discountAnswer();
    }
    if (url.endsWith(`${SERVICE}ExchangePanelSession`)) {
      exchangeCalls.push(call());
      return exchangeAnswer();
    }
    if (url.includes("/public-commerce/products")) return json({ success: true, result: products });
    if (url.includes("/public-commerce/countries")) return json([{ name: "Polska", code: "PL" }]);
    if (url.includes("/public-commerce/payment-methods")) return json({ success: true, choice: null });
    if (init?.method === "POST" && url.endsWith("/e")) return new Response(null, { status: 202 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  console.error = () => {};
  console.warn = () => {};
});

afterEach(async () => {
  discountsModule.setCartDiscountDeadlineForTests();
  console.error = originalError;
  console.warn = originalWarn;
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  resetTracker();
});

const wait = (ms: number) => React.act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const settle = () => wait(30);
const doc = () => page.win.document;
const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/ | /g, " ") ?? null;
const $ = (selector: string) => doc().querySelector(selector);
const total = () => text($('[data-bitsnap-checkout-slot="totalValue"]'));
const note = () => text($('[data-bitsnap-checkout-slot="summaryNote"]'));
const wallets = () => $("[data-bitsnap-checkout-wallets]");
const signIn = (host = "https://bitsnap.pl") => {
  page.win.localStorage.setItem(panelSessionKey(TEST_KEY, host), "panel-access-token");
};
const appliedAmount = () => text($('[data-bitsnap-checkout-discount="applied"]')?.lastElementChild);
const struckAmount = () => text($('[data-bitsnap-checkout-discount="struck"] s'));

/**
 * Records every express-button area React mounted or unmounted from now on,
 * even one that was there for a single commit.
 */
function watchWallets() {
  let seen = 0;
  const has = (node: Node) =>
    node.nodeType === 1 &&
    ((node as Element).matches("[data-bitsnap-checkout-wallets]") ||
      (node as Element).querySelector("[data-bitsnap-checkout-wallets]") != null);
  const check = (records: MutationRecord[]) => {
    for (const record of records) {
      for (const node of [...record.addedNodes, ...record.removedNodes]) if (has(node)) seen++;
    }
  };
  const observer = new page.win.MutationObserver(check);
  observer.observe(doc().body, { childList: true, subtree: true });
  return () => {
    check(observer.takeRecords());
    observer.disconnect();
    return seen;
  };
}

async function openCart(props: Partial<React.ComponentProps<typeof BitsnapCheckout>> = {}) {
  const container = doc().createElement("div");
  doc().body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(<BitsnapCheckout projectID={TEST_KEY} locale="pl-PL" analytics={false} {...props} />);
  });
  await React.act(async () => void (await Bitsnap.addProductToCart("var1", 2)));
  await React.act(async () => Bitsnap.showCart());
  await settle();
  await settle();
}

/**
 * The footer of 1.35.1: no discount block, the old note and the cart total.
 * `held`: the express buttons are held back all the same.
 */
function assertOldFooter(message: string, { held = false } = {}) {
  assert.equal($('[data-bitsnap-checkout-slot="discounts"]') == null, true, `${message}: no discount block`);
  assert.equal(total(), "50,00 zł", `${message}: the cart total`);
  assert.equal(note(), "Rabaty, dostawa i podatki w następnym kroku", `${message}: the old note`);
  assert.equal($('[data-bitsnap-checkout-notice="customer-discount-sign-in"]') == null, true, `${message}: no hint`);
  assert.equal($('[data-bitsnap-checkout-notice="customer-discount-at-checkout"]') == null, true, `${message}: no note`);
  if (held) {
    assert.equal(wallets() == null, true, `${message}: the server said the customer discount applies`);
  } else {
    assert.ok(wallets(), `${message}: the express buttons stay`);
  }
}

describe("cart discounts: the answer", () => {
  it("parses int64 strings and drops malformed answers", () => {
    const parsed = discountsModule.parseCartDiscountContext(customerWins);
    assert.deepEqual(parsed, {
      currency: "PLN",
      itemsSubtotalMinor: 5000,
      authenticated: true,
      customerDiscountsAvailable: true,
      outcome: {
        applied: [{ kind: "customer", minor: 500, bp: 1000 }],
        struck: [{ kind: "club", minor: 300, name: "VIP" }],
        customerWon: true,
      },
      productsAfterDiscountsMinor: 4500,
    });
    // Absent proto3 defaults: false booleans, no outcome, a 0 int64.
    assert.deepEqual(discountsModule.parseCartDiscountContext({ currency: "PLN", itemsSubtotalMinor: "0" }), {
      currency: "PLN",
      itemsSubtotalMinor: 0,
      authenticated: false,
      customerDiscountsAvailable: false,
      productsAfterDiscountsMinor: 0,
    });
    // An empty message is every default: an unpriced answer.
    assert.deepEqual(discountsModule.parseCartDiscountContext({}), {
      currency: "",
      itemsSubtotalMinor: 0,
      authenticated: false,
      customerDiscountsAvailable: false,
      productsAfterDiscountsMinor: 0,
    });
    for (const bad of [
      null,
      "x",
      { currency: 5 },
      { currency: "PLN", itemsSubtotalMinor: "12.5", productsAfterDiscountsMinor: "1" },
      { currency: "PLN", itemsSubtotalMinor: "99999999999999999999", productsAfterDiscountsMinor: "1" },
      context({ discountOutcome: { applied: "nope" } }),
      context({ discountOutcome: { applied: [{ kind: "club", minor: "x" }] } }),
      context({ discountOutcome: { applied: [{ minor: "1" }] } }),
    ]) {
      assert.equal(discountsModule.parseCartDiscountContext(bad), undefined, JSON.stringify(bad));
    }
  });

  it("skips a line of a kind it does not know and keeps the rest of the answer", () => {
    const parsed = discountsModule.parseCartDiscountContext(
      context({
        discountOutcome: {
          applied: [
            { kind: "points", minor: "100" },
            { kind: "customer", minor: "500", bp: 1000 },
          ],
          struck: [{ kind: "gift-card", minor: "200" }],
          customerWon: true,
        },
        productsAfterDiscountsMinor: "4500",
      }),
    );
    assert.deepEqual(parsed?.outcome, {
      applied: [{ kind: "customer", minor: 500, bp: 1000 }],
      struck: [],
      customerWon: true,
    });
  });

  it("builds the request body with the cart's ids and quantities", () => {
    assert.deepEqual(
      discountsModule.cartDiscountRequestBody(
        "p1",
        [{ productId: "var1", quantity: 2 }, { productId: "prod2", quantity: 1 }],
        "tok",
        "pl-PL",
      ),
      {
        projectId: "p1",
        environment: "PRODUCTION",
        items: [{ productId: "var1", quantity: 2 }, { productId: "prod2", quantity: 1 }],
        sessionToken: "tok",
        locale: "pl-PL",
      },
    );
    assert.deepEqual(discountsModule.cartDiscountRequestBody("p1", [], undefined, undefined), {
      projectId: "p1",
      environment: "PRODUCTION",
      items: [],
    });
  });

  it("shows nothing for an answer about another cart or currency", () => {
    const parsed = discountsModule.parseCartDiscountContext(customerWins)!;
    const cart = { currency: "PLN", total: 5000, totalComplete: true, pending: false };
    assert.ok(discountsModule.cartDiscountsView(parsed, cart)?.outcome);
    assert.equal(discountsModule.cartDiscountsView(parsed, { ...cart, currency: "EUR" }), null);
    assert.equal(discountsModule.cartDiscountsView(parsed, { ...cart, total: 7500 }), null);
    assert.equal(discountsModule.cartDiscountsView(parsed, { ...cart, totalComplete: false }), null);
    // An answer for the previous lines keeps its labels while the new one loads.
    assert.equal(discountsModule.cartDiscountsView(parsed, { ...cart, total: 7500, pending: true })?.pending, true);
    assert.equal(discountsModule.cartDiscountsView(null, cart), null);
  });

  it("takes an unpriced answer: no outcome, no currency, no subtotal check", () => {
    const anonymous = discountsModule.parseCartDiscountContext(
      unpriced({ authenticated: false, customerDiscountsAvailable: true }),
    );
    assert.deepEqual(anonymous, {
      currency: "",
      itemsSubtotalMinor: 0,
      authenticated: false,
      customerDiscountsAvailable: true,
      productsAfterDiscountsMinor: 0,
    });
    const cart = { currency: "PLN", total: 5000, totalComplete: true, pending: false };
    assert.deepEqual(discountsModule.cartDiscountsView(anonymous, cart), {
      totalAfterDiscounts: 5000,
      signInHint: true,
      pending: false,
    });
    assert.equal(
      discountsModule.cartDiscountsView(discountsModule.parseCartDiscountContext(unpriced()), cart),
      null,
      "nothing to show without customer discounts",
    );
    // An outcome is priced: without a currency the answer is malformed.
    assert.equal(discountsModule.parseCartDiscountContext({ ...customerWins, currency: "" }), undefined);
  });

  it("sends a pay-what-you-want amount as an int64 string and the coupon", () => {
    assert.deepEqual(
      discountsModule.cartDiscountRequestBody(
        "p1",
        [{ productId: "tip", quantity: 1, amount: 1500 }],
        undefined,
        undefined,
        "LATO",
      ),
      {
        projectId: "p1",
        environment: "PRODUCTION",
        items: [{ productId: "tip", quantity: 1, amount: "1500" }],
        couponCode: "LATO",
      },
    );
  });
});

describe("cart discounts: the panel session", () => {
  const request = (panelSession?: { token: string; host: string }) => ({
    host: "https://bitsnap.pl",
    projectID: TEST_KEY,
    items: [{ productId: "var1", quantity: 2 }],
    ...(panelSession != null ? { panelSession } : {}),
  });
  const session = { token: "panel-access-token", host: "https://bitsnap.pl" };

  it("finds only a token stored under the cart's host", () => {
    signIn("https://panel.example");
    setPanelConfig({ host: "https://panel.example" });
    assert.equal(discountsModule.findPanelSession(TEST_KEY, "https://bitsnap.pl"), undefined);
    signIn();
    assert.deepEqual(discountsModule.findPanelSession(TEST_KEY, "https://bitsnap.pl"), session);
  });

  it("never sends a token of another host", async () => {
    discountAnswer = () => json(customerWins);
    await discountsModule.fetchCartDiscountContext(
      request({ token: "panel-access-token", host: "https://panel.example" }),
    );
    assert.equal(exchangeCalls.length, 0);
    assert.equal(discountCalls.length, 1);
    assert.equal("sessionToken" in discountCalls[0].body, false);
  });

  it("exchanges once for two requests across a reload, and again after it expires", async () => {
    discountAnswer = () => json(customerWins);
    await discountsModule.fetchCartDiscountContext(request(session));
    discountsModule.forgetDiscountSessions(); // the next page of the shop
    await discountsModule.fetchCartDiscountContext(request(session));
    assert.equal(exchangeCalls.length, 1, "the next page reuses the exchanged session");
    assert.deepEqual(
      discountCalls.map((call) => call.body.sessionToken),
      ["loyalty-token", "loyalty-token"],
    );
    const keys = Object.keys(page.win.sessionStorage);
    assert.equal(keys.length, 1);
    assert.equal(keys[0], discountsModule.loyaltySessionKey("https://bitsnap.pl", TEST_KEY, "panel-access-token"));
    assert.equal(keys[0].includes("panel-access-token"), false, "the key holds a fingerprint, not the token");

    const realNow = Date.now;
    Date.now = () => realNow() + 3_600_000;
    try {
      await discountsModule.fetchCartDiscountContext(request(session));
      assert.equal(exchangeCalls.length, 2, "an expired session is exchanged again (memory)");
      discountsModule.forgetDiscountSessions();
      Date.now = () => realNow() + 2 * 3_600_000;
      await discountsModule.fetchCartDiscountContext(request(session));
      assert.equal(exchangeCalls.length, 3, "an expired session is exchanged again (stored)");
    } finally {
      Date.now = realNow;
    }
  });

  it("keeps no failed exchange for the next page", async () => {
    exchangeAnswer = () => json({ code: "unauthenticated" }, 401);
    await discountsModule.fetchCartDiscountContext(request(session));
    assert.equal(Object.keys(page.win.sessionStorage).length, 0);
  });
});

describe("cart discounts in the drawer", () => {
  it("asks anonymously without a panel session, with the cart lines as JSON", async () => {
    await openCart();
    assert.equal(exchangeCalls.length, 0, "no session to exchange");
    assert.equal(discountCalls.length, 1);
    assert.deepEqual(discountCalls[0].body, {
      projectId: TEST_KEY,
      environment: "PRODUCTION",
      items: [{ productId: "var1", quantity: 2 }],
      locale: "pl-PL",
    });
    assert.equal(discountCalls[0].headers["content-type"], "application/json");
    assert.equal(discountCalls[0].headers["connect-protocol-version"], "1");
    assertOldFooter("nothing to show");
  });

  it("customer discount wins: applied line, struck club with its reason, total after discounts, no express buttons", async () => {
    signIn();
    discountAnswer = () => json(customerWins);
    await openCart();

    assert.equal(exchangeCalls.length, 1);
    assert.deepEqual(exchangeCalls[0].body, {
      projectId: TEST_KEY,
      accessToken: "panel-access-token",
      environment: "PRODUCTION",
    });
    assert.equal(discountCalls.length, 1, "never asked anonymously first");
    assert.equal(discountCalls[0].body.sessionToken, "loyalty-token");

    const applied = $('[data-bitsnap-checkout-discount="applied"]');
    assert.equal(applied?.getAttribute("data-bitsnap-checkout-discount-kind"), "customer");
    assert.equal(text(applied?.firstElementChild), "Rabat dla Ciebie −10%");
    assert.equal(text(applied?.lastElementChild), "−5,00 zł");

    const struck = $('[data-bitsnap-checkout-discount="struck"]');
    assert.equal(struck?.getAttribute("data-bitsnap-checkout-discount-kind"), "club");
    assert.equal(text(struck?.firstElementChild), "Rabat klubowy · VIP");
    assert.equal(text(struck?.querySelector("s")), "−3,00 zł", "the amount is struck through");
    assert.equal(
      text(struck?.querySelector('[data-bitsnap-checkout-part="sr"]')),
      " (nie naliczono)",
      "a screen reader hears that it does not apply",
    );
    assert.equal(
      text($('[data-bitsnap-checkout-notice="discount-struck-reason"]')),
      "Nie łączy się — wybraliśmy korzystniejszy rabat",
    );

    assert.equal(total(), "45,00 zł", "the products after discounts");
    assert.equal(note(), "Dostawa i podatki w następnym kroku");
    assert.equal(wallets() == null, true, "the express path would charge without the customer discount");
    assert.equal(
      text($('[data-bitsnap-checkout-notice="customer-discount-at-checkout"]')),
      "Rabat dla Ciebie naliczymy w kasie.",
    );
    assert.ok($('[data-bitsnap-checkout-slot="checkoutButton"]'), "checkout stays");
  });

  it("club discount wins: the customer discount is struck, the express buttons stay", async () => {
    signIn();
    discountAnswer = () => json(clubWins);
    await openCart({ locale: "en-US" });

    const applied = $('[data-bitsnap-checkout-discount="applied"]');
    assert.equal(applied?.getAttribute("data-bitsnap-checkout-discount-kind"), "club");
    assert.equal(text(applied?.firstElementChild), "Club discount · VIP");
    const struck = $('[data-bitsnap-checkout-discount="struck"]');
    assert.equal(struck?.getAttribute("data-bitsnap-checkout-discount-kind"), "customer");
    assert.equal(text(struck?.firstElementChild), "Your discount −10%");
    assert.equal(text(struck?.querySelector('[data-bitsnap-checkout-part="sr"]')), " (not applied)");
    assert.equal(
      text($('[data-bitsnap-checkout-notice="discount-struck-reason"]')),
      "Doesn't combine — we picked the better discount",
    );
    assert.ok(total()?.includes("42.00"), `the products after discounts: ${total()}`);
    assert.ok(wallets(), "express buttons stay when the customer discount does not apply");
    assert.equal($('[data-bitsnap-checkout-notice="customer-discount-at-checkout"]') == null, true);
  });

  it("an anonymous buyer in a shop with customer discounts sees a short hint, nothing else changes", async () => {
    discountAnswer = () => json(unpriced({ authenticated: false, customerDiscountsAvailable: true }));
    await openCart();
    assert.equal(
      text($('[data-bitsnap-checkout-notice="customer-discount-sign-in"]')),
      "Masz rabat stałego klienta? Zalogujesz się w kasie.",
    );
    assert.equal($('[data-bitsnap-checkout-slot="discounts"]') == null, true);
    assert.equal(total(), "50,00 zł");
    assert.equal(note(), "Rabaty, dostawa i podatki w następnym kroku");
    assert.ok(wallets());
  });

  it("asks anonymously when the panel session cannot be exchanged", async () => {
    signIn();
    exchangeAnswer = () => json({ code: "unauthenticated" }, 401);
    discountAnswer = () => json(unpriced({ authenticated: false, customerDiscountsAvailable: true }));
    await openCart();
    assert.equal(exchangeCalls.length, 1);
    assert.equal(discountCalls.length, 1);
    assert.equal("sessionToken" in discountCalls[0].body, false);
    assert.ok($('[data-bitsnap-checkout-notice="customer-discount-sign-in"]'));
  });

  it("sends the cart's coupon", async () => {
    page.win.localStorage.setItem("checkout", JSON.stringify({ products: [], couponCode: "LATO" }));
    await openCart();
    assert.equal(discountCalls.length, 1);
    assert.equal(discountCalls[0].body.couponCode, "LATO");
  });

  it("sends a pay-what-you-want line with the amount /buy sends", async () => {
    products = [product, tip];
    await openCart();
    await React.act(async () => void (await Bitsnap.addProductToCart("tip", 1, undefined, { amount: 1500 })));
    await wait(400);
    assert.deepEqual(discountCalls.at(-1)?.body.items, [
      { productId: "var1", quantity: 2 },
      { productId: "tip", quantity: 1, amount: "1500" },
    ]);
  });

  it("ignores a token stored under another host", async () => {
    setPanelConfig({ host: "https://panel.example" });
    signIn("https://panel.example");
    await openCart();
    assert.equal(exchangeCalls.length, 0);
    assert.equal("sessionToken" in discountCalls[0].body, false);
  });

  it("while a new quantity is asked, the amounts show \u2026 and the old answer never shows as current", async () => {
    signIn();
    discountAnswer = () => json(clubWins);
    await openCart();
    assert.equal(appliedAmount(), "−8,00 zł");
    assert.equal(total(), "42,00 zł");

    const next = deferred();
    discountAnswer = () => next.promise;
    const plus = doc().querySelectorAll<HTMLButtonElement>('[data-bitsnap-checkout-slot="quantityButton"]')[1];
    await React.act(async () => plus.click());
    for (const ms of [0, 400]) {
      await wait(ms);
      assert.equal(total(), "…", `${ms} ms: the total waits`);
      assert.equal(appliedAmount(), "…", `${ms} ms: the applied amount waits`);
      assert.equal(struckAmount(), "…", `${ms} ms: the struck amount waits`);
      assert.equal(
        $('[data-bitsnap-checkout-discount="applied"]')?.getAttribute("data-bitsnap-checkout-discount-kind"),
        "club",
        "the labels stay",
      );
    }
    assert.deepEqual(discountCalls.at(-1)?.body.items, [{ productId: "var1", quantity: 3 }]);

    next.resolve(
      json(
        context({
          authenticated: true,
          customerDiscountsAvailable: true,
          itemsSubtotalMinor: "7500",
          discountOutcome: {
            applied: [{ kind: "club", minor: "1200", name: "VIP" }],
            struck: [{ kind: "customer", minor: "750", bp: 1000 }],
          },
          productsAfterDiscountsMinor: "6300",
        }),
      ),
    );
    await settle();
    assert.equal(appliedAmount(), "−12,00 zł");
    assert.equal(struckAmount(), "−7,50 zł");
    assert.equal(total(), "63,00 zł");
  });

  it("a signed-in buyer's express buttons never mount while the first answer of a reopening is out", async () => {
    signIn();
    discountAnswer = () => json(customerWins);
    await openCart();
    assert.equal(wallets() == null, true);
    await React.act(async () => Bitsnap.hideCart());
    await settle();

    const stop = watchWallets();
    await React.act(async () => Bitsnap.showCart());
    await settle();
    await settle();
    assert.equal(stop(), 0, "no express buttons in any commit");
    assert.equal(wallets() == null, true);
  });

  it("a reopened drawer with another cart holds the express buttons from its first commit until its own answer", async () => {
    signIn();
    discountAnswer = () => json(clubWins);
    await openCart();
    assert.ok(wallets(), "the club discount wins: express buttons show");
    await React.act(async () => Bitsnap.hideCart());
    await settle();

    const next = deferred();
    discountAnswer = () => next.promise;
    await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
    const stop = watchWallets();
    await React.act(async () => Bitsnap.showCart());
    await wait(400);
    assert.equal(wallets() == null, true, "held while this opening's answer is out");
    assert.equal($('[data-bitsnap-checkout-slot="discounts"]') == null, true, "the previous lines do not show");

    next.resolve(
      json(
        context({
          authenticated: true,
          customerDiscountsAvailable: true,
          itemsSubtotalMinor: "7500",
          discountOutcome: {
            applied: [{ kind: "customer", minor: "750", bp: 1000 }],
            struck: [{ kind: "club", minor: "450", name: "VIP" }],
            customerWon: true,
          },
          productsAfterDiscountsMinor: "6750",
        }),
      ),
    );
    await settle();
    assert.equal(total(), "67,50 zł");
    assert.equal(wallets() == null, true);
    assert.equal(stop(), 0, "no express buttons in any commit");
  });

  for (const [name, answer] of [
    ["a 404 of an older server", () => new Response("{}", { status: 404 })],
    ["unimplemented", () => json({ code: "unimplemented", message: "" }, 501)],
    ["an unknown product", () => json({ code: "invalid_argument", message: "unknown product" }, 400)],
    ["a network error", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["bad JSON", () => new Response("<html>", { status: 200, headers: { "Content-Type": "application/json" } })],
    ["a malformed answer", () => json({ currency: "PLN", itemsSubtotalMinor: "x" })],
  ] as const) {
    it(`keeps the footer as before on ${name}`, async () => {
      signIn();
      discountAnswer = answer;
      await openCart();
      assert.equal(discountCalls.length, 1, "asked once, not retried");
      assertOldFooter(name);
    });
  }

  // The amounts are not this cart's, so the footer shows the cart's own; the
  // server still said the customer discount applies, and the express path
  // would charge without it.
  for (const [name, answer] of [
    ["another currency", () => json({ ...customerWins, currency: "EUR" })],
    ["a subtotal that is not the cart's", () => json({ ...customerWins, itemsSubtotalMinor: "7000" })],
  ] as const) {
    it(`keeps the footer's amounts but holds the express buttons on ${name} where the customer discount wins`, async () => {
      signIn();
      discountAnswer = answer;
      await openCart();
      assert.equal(discountCalls.length, 1, "asked once, not retried");
      assertOldFooter(name, { held: true });
    });
  }

  it("keeps the express buttons on a subtotal that is not the cart's where the club wins", async () => {
    signIn();
    discountAnswer = () => json({ ...clubWins, itemsSubtotalMinor: "7000" });
    await openCart();
    assertOldFooter("club wins, another subtotal");
  });

  /** Never answers, and ignores the abort signal: only the deadline ends the wait. */
  const silent = () => new Promise<Response>(() => {});

  for (const [name, stall] of [
    ["the session exchange", "exchange"],
    ["GetCartDiscountContext", "context"],
  ] as const) {
    it(`shows the express buttons once the deadline passes when ${name} never answers`, async () => {
      discountsModule.setCartDiscountDeadlineForTests(300);
      signIn();
      if (stall === "exchange") exchangeAnswer = silent;
      else discountAnswer = silent;
      const stop = watchWallets();
      await openCart();
      assert.equal(wallets() == null, true, "held while the answer is out");
      await wait(400);
      assert.ok(wallets(), "the deadline is a failure: the express buttons show");
      assert.equal(stop(), 1, "mounted once, never shown and hidden before");
      assertOldFooter(`${name} timed out`);
    });
  }

  it("one deadline for the exchange and the call together", async () => {
    discountsModule.setCartDiscountDeadlineForTests(300);
    signIn();
    // Each step alone is within the deadline, both together are not.
    const late = (body: () => Response) => () =>
      new Promise<Response>((resolve) => setTimeout(() => resolve(body()), 200));
    const exchange = exchangeAnswer;
    exchangeAnswer = late(exchange);
    discountAnswer = late(() => json(customerWins));
    await openCart();
    await wait(400);
    assert.ok(wallets(), "the deadline passed mid-call: a failure");
    assert.equal($('[data-bitsnap-checkout-slot="discounts"]') == null, true, "the late answer is not shown");
  });

  it("closing the drawer mid-request and reopening it does not leave the express buttons hidden", async () => {
    discountsModule.setCartDiscountDeadlineForTests(300);
    signIn();
    discountAnswer = silent;
    await openCart();
    assert.equal(wallets() == null, true);
    await React.act(async () => Bitsnap.hideCart());
    await settle();
    await React.act(async () => Bitsnap.showCart());
    await settle();
    assert.equal(wallets() == null, true, "still held: the same request is out");
    await wait(400);
    assert.ok(wallets(), "the deadline passed: the express buttons show");
    assertOldFooter("reopened after a timeout");
  });
});

process.on("exit", teardownReactPage);
