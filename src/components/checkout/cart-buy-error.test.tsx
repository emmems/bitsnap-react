import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { resetTracker } from "@/src/analytics/core";
import { setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let BitsnapCheckout: typeof import("./BitsnapCart.tsx").default;
let Bitsnap: typeof import("./methods.ts").Bitsnap;
let createCheckout: typeof import("./methods.ts").createCheckout;
let createPaymentURL: typeof import("./methods.ts").createPaymentURL;
let useCheckoutStore: typeof import("./state.ts").useCheckoutStore;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  BitsnapCheckout = (await import("./BitsnapCart.tsx")).default;
  ({ Bitsnap, createCheckout, createPaymentURL } = await import("./methods.ts"));
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

/** What POST /buy (and the payment link API) answers with. */
let buyResponse: () => Response;
const roots: Array<{ unmount: () => void }> = [];

const originalError = console.error;
const originalWarn = console.warn;
beforeEach(() => {
  resetTracker();
  page.win.localStorage.clear();
  page.win.localStorage.setItem("checkout", JSON.stringify({ products: [] }));
  useCheckoutStore.setState({ isCartVisible: false, numberOfProductsInCart: 0 });
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/public-commerce/products")) return json({ success: true, result: [product] });
    if (url.includes("/public-commerce/countries")) return json([{ name: "Polska", code: "PL" }]);
    if (url.includes("/public-commerce/buy") || url.includes("/api/payment/link/auto")) return buyResponse();
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

async function mount(props: Partial<React.ComponentProps<typeof BitsnapCheckout>> = {}) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(<BitsnapCheckout projectID={TEST_KEY} locale="pl-PL" analytics={false} {...props} />);
  });
}

const settle = () => React.act(async () => void (await new Promise((r) => setTimeout(r, 30))));

/** Adds a product, opens the cart, clicks "Następny krok" and returns the error text. */
async function failCheckout(props: Partial<React.ComponentProps<typeof BitsnapCheckout>> = {}) {
  await mount(props);
  await React.act(async () => void (await Bitsnap.addProductToCart("var1", 1)));
  await React.act(async () => Bitsnap.showCart());
  await settle();
  const button = page.win.document.querySelector<HTMLButtonElement>('[data-bitsnap-checkout-slot="checkoutButton"]')!;
  await React.act(async () => button.click());
  await settle();
  return page.win.document.querySelector('[data-bitsnap-checkout-slot="error"]')?.textContent;
}

const jsonError = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("cart error after clicking the checkout button", () => {
  it("shows the mapped text for a backend code, not the code", async () => {
    buyResponse = jsonError(400, { success: false, code: "no-payment-gateway", error: "Brak bramki" });
    assert.equal(
      await failCheckout(),
      "Ten sklep nie przyjmuje jeszcze płatności online. Spróbuj ponownie później lub skontaktuj się ze sprzedawcą.",
    );
  });

  it("follows the locale and the merchant overrides", async () => {
    buyResponse = jsonError(400, { success: false, code: "price-changed", error: "x" });
    assert.equal(await failCheckout({ locale: "en-US" }), "The product price has changed. Refresh the page.");
  });

  it("lets the merchant override a mapped text", async () => {
    buyResponse = jsonError(400, { success: false, code: "price-changed", error: "x" });
    assert.equal(await failCheckout({ texts: { priceChanged: "Zmiana ceny!" } }), "Zmiana ceny!");
  });

  it("shows the generic text for invalid-request, not the server message", async () => {
    buyResponse = jsonError(400, { success: false, code: "invalid-request", error: "Nieprawidłowe żądanie." });
    assert.equal(await failCheckout(), "Coś poszło nie tak. Spróbuj ponownie później.");
  });

  it("shows the server message of a 4xx code without its own text", async () => {
    buyResponse = jsonError(400, { success: false, code: "some-business-code", error: "Powód od sklepu." });
    assert.equal(await failCheckout(), "Powód od sklepu.");
  });

  it("maps product-not-found to the unavailable products text", async () => {
    buyResponse = jsonError(404, { success: false, code: "product-not-found", error: "Nie ma" });
    assert.equal(await failCheckout(), "Nie wszystkie produkty są dostępne w magazynie.");
  });

  it("shows the unavailable products text for itemIds", async () => {
    buyResponse = jsonError(400, { success: false, code: "product-not-available", error: "x", itemIds: ["prod1"] });
    assert.equal(await failCheckout(), "Nie wszystkie produkty są dostępne w magazynie.");
  });

  it("works against an old backend: no Content-Type and a plain error", async () => {
    buyResponse = () => new Response('{"error":"Failed to create payment session."}', { status: 500 });
    assert.equal(await failCheckout(), "Coś poszło nie tak. Spróbuj ponownie później.");
  });

  it("shows the generic text, not the exception, when the request throws", async () => {
    buyResponse = () => {
      throw new TypeError("Failed to fetch");
    };
    assert.equal(await failCheckout(), "Coś poszło nie tak. Spróbuj ponownie później.");
  });

  it("falls back to the generic text for an empty body or HTML", async () => {
    buyResponse = () => new Response(null, { status: 500 });
    assert.equal(await failCheckout(), "Coś poszło nie tak. Spróbuj ponownie później.");
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    page.win.document.body.innerHTML = "";
    buyResponse = () => new Response("<html>Bad gateway</html>", { status: 502 });
    const text = await failCheckout();
    assert.equal(text, "Coś poszło nie tak. Spróbuj ponownie później.");
    assert.ok(!text?.includes("internal-error"));
  });
});

describe("createPaymentURL and createCheckout errors", () => {
  it("createPaymentURL returns the code and the message", async () => {
    buyResponse = jsonError(400, { success: false, code: "mixed-recurring", error: "Mieszany koszyk" });
    assert.deepEqual(await createPaymentURL({ items: [{ id: "p", quantity: 1 }] } as never), {
      ERR: true,
      error: "mixed-recurring",
      type: "badInput",
      data: { message: "Mieszany koszyk" },
    });
  });

  it("createCheckout returns an Err for a failed response and keeps the success shape", async () => {
    page.win.document.body.innerHTML = `<script data-id="${TEST_KEY}" data-name="internal-cart"></script>`;
    buyResponse = jsonError(500, { success: false, code: "internal", error: "Ups" });
    assert.deepEqual(await createCheckout({ items: [{ id: "p", quantity: 1 }] } as never), {
      ERR: true,
      status: "error",
      error: "internal",
      type: "internal",
      data: { message: "Ups" },
    });
    buyResponse = jsonError(200, { url: "https://pay.example.test/x" });
    assert.deepEqual(await createCheckout({ items: [{ id: "p", quantity: 1 }] } as never), {
      status: "ok",
      redirectURL: "https://pay.example.test/x",
    });
  });
});

process.on("exit", teardownReactPage);
