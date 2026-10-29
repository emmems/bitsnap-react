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
  image_url: null,
  isDeliverable: false,
  variants: [{ id: "var1", name: "Blue", price: 2500, currency: "PLN" }],
};

/** What POST /payment-methods answers with. */
let paymentMethodsResponse: () => Response | Promise<Response>;
let buyUrl = "";
let paymentMethodsBodies: string[] = [];
let buyBodies: string[] = [];
const roots: Array<{ unmount: () => void }> = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const choiceOf = (methods: string[], manualAccountTypes: string[]) => () =>
  json({ success: true, choice: { methods, manualAccountTypes } });

const originalError = console.error;
const originalWarn = console.warn;
beforeEach(() => {
  resetTracker();
  page.win.localStorage.clear();
  page.win.localStorage.setItem("checkout", JSON.stringify({ products: [] }));
  useCheckoutStore.setState({ isCartVisible: false, numberOfProductsInCart: 0, notice: undefined });
  paymentMethodsBodies = [];
  buyBodies = [];
  buyUrl = "https://bitsnap.pl/payment/common/p/o";
  paymentMethodsResponse = () => json({ success: true, choice: null });
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/public-commerce/products")) return json({ success: true, result: [product] });
    if (url.includes("/public-commerce/countries")) return json([{ name: "Polska", code: "PL" }]);
    if (url.includes("/public-commerce/payment-methods")) {
      paymentMethodsBodies.push(String(init?.body));
      return paymentMethodsResponse();
    }
    if (url.includes("/public-commerce/buy")) {
      buyBodies.push(String(init?.body));
      return json({ url: buyUrl, sessionID: "s" });
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

const settle = () => React.act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const doc = () => page.win.document;
const fieldset = () => doc().querySelector<HTMLFieldSetElement>('[data-bitsnap-checkout-slot="paymentMethods"]');
const radios = () => [...doc().querySelectorAll<HTMLInputElement>('[data-bitsnap-checkout-slot="paymentMethodOption"] input[type="radio"]')];
const optionTitles = () =>
  [...doc().querySelectorAll('[data-bitsnap-checkout-slot="paymentMethodOption"] span.font-semibold')].map((el) => el.textContent);

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
}

async function clickCheckout() {
  const button = doc().querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="checkoutButton"]')!;
  await React.act(async () => button.click());
  await settle();
}

describe("payment method choice in the cart", () => {
  it("without a choice shows nothing and sends no paymentMethod; asks with the /buy body", async () => {
    await openCart();
    assert.equal(fieldset(), null);
    assert.equal(paymentMethodsBodies.length, 1);

    await clickCheckout();
    assert.equal(buyBodies.length, 1);
    const buy = JSON.parse(buyBodies[0]);
    assert.equal("paymentMethod" in buy, false);
    assert.deepEqual(JSON.parse(paymentMethodsBodies[0]), buy);
    assert.equal(paymentMethodsBodies.length, 1, "not asked again on click or re-render");
  });

  it("shows the methods in the seller's order, selects the first and sends it", async () => {
    paymentMethodsResponse = choiceOf(["manual", "online"], ["blik"]);
    await openCart();

    const group = fieldset()!;
    assert.ok(group, "the choice renders");
    const legend = doc().getElementById(group.getAttribute("aria-labelledby")!)!;
    assert.equal(legend.textContent, "Jak chcesz zapłacić?");
    assert.deepEqual(optionTitles(), ["BLIK – przelew na telefon", "Zapłać online"]);
    assert.deepEqual(radios().map((el) => [el.value, el.checked]), [["manual", true], ["online", false]]);
    assert.equal(new Set(radios().map((el) => el.name)).size, 1, "one radio group");
    assert.ok(group.textContent?.includes("cyfrowego kodu"), "BLIK note on the selected manual option");
    const describedBy = doc().getElementById(radios()[0].getAttribute("aria-describedby")!);
    assert.ok(describedBy?.textContent?.includes("po złożeniu zamówienia"));

    await clickCheckout();
    assert.equal(JSON.parse(buyBodies[0]).paymentMethod, "manual");
  });

  it("sends the method the buyer picked", async () => {
    paymentMethodsResponse = choiceOf(["online", "manual"], ["bankTransfer"]);
    await openCart();
    assert.deepEqual(optionTitles(), ["Zapłać online", "Przelew bankowy"]);
    assert.equal(fieldset()!.textContent?.includes("cyfrowego kodu"), false, "no BLIK note without BLIK");

    await React.act(async () => radios()[1].click());
    assert.deepEqual(radios().map((el) => el.checked), [false, true]);
    await clickCheckout();
    assert.equal(JSON.parse(buyBodies[0]).paymentMethod, "manual");
  });

  it("labels both account types and follows the locale and the texts overrides", async () => {
    paymentMethodsResponse = choiceOf(["online", "manual"], ["bankTransfer", "blik"]);
    await openCart();
    assert.deepEqual(optionTitles(), ["Zapłać online", "Przelew lub BLIK na telefon"]);
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    doc().body.innerHTML = "";

    await openCart({ locale: "en-US", texts: { paymentMethodOnline: "Card or BLIK code" } });
    assert.deepEqual(optionTitles(), ["Card or BLIK code", "Bank transfer or BLIK to a phone number"]);
  });

  for (const [name, response] of [
    ["a 500", () => json({ success: false }, 500)],
    ["a 404 of an old backend", () => new Response("{}", { status: 404 })],
    ["a network error", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["a malformed answer", () => json({ success: true, choice: { methods: ["online"] } })],
  ] as const) {
    it(`falls back to a plain /buy after ${name}`, async () => {
      paymentMethodsResponse = response;
      await openCart();
      assert.equal(fieldset(), null);
      await clickCheckout();
      assert.equal(buyBodies.length, 1);
      assert.equal("paymentMethod" in JSON.parse(buyBodies[0]), false);
    });
  }

  it("a click before the choice arrives shows the choice instead of buying", async () => {
    let answer!: (response: Response) => void;
    paymentMethodsResponse = () => new Promise<Response>((resolve) => (answer = resolve));
    await openCart();
    assert.equal(fieldset(), null);

    const button = doc().querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="checkoutButton"]')!;
    await React.act(async () => button.click());
    await React.act(async () => answer(choiceOf(["online", "manual"], ["blik"])()));
    await settle();
    assert.equal(buyBodies.length, 0, "nothing bought before the buyer saw the choice");
    assert.ok(fieldset(), "the choice is shown");

    await clickCheckout();
    assert.equal(JSON.parse(buyBodies[0]).paymentMethod, "online");
  });

  it("clears the cart and remembers no pending order for the manual payment page", async () => {
    paymentMethodsResponse = choiceOf(["online", "manual"], ["bankTransfer"]);
    buyUrl = "https://bitsnap.pl/payment/manualPayment/hashedP/ord_1";
    await openCart();
    await React.act(async () => radios()[1].click());
    await clickCheckout();
    assert.equal(JSON.parse(buyBodies[0]).paymentMethod, "manual");
    assert.deepEqual(JSON.parse(page.win.localStorage.getItem("checkout")!).products, []);
    assert.equal(page.win.localStorage.getItem("bitsnap-pending-order"), null);
  });
});

process.on("exit", teardownReactPage);
