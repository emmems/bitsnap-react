import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import type { InPostWidgetInitOptions, InPostPayWidgetInstance } from "@/src/express/inpost-widget";

const page = setupReactPage("https://shop.example.test/products/shirt");

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let InPostPayButton: typeof import("./InPostPayButton").default;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  InPostPayButton = (await import("./InPostPayButton.tsx")).default;
});

beforeEach(async () => {
  const { clearDeliveryQuoteCache } = await import("@/src/express/delivery-quote");
  clearDeliveryQuoteCache();
});

const roots: Array<{ unmount: () => void }> = [];

afterEach(async () => {
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  page.win.localStorage.clear();
  delete (page.win as unknown as Record<string, unknown>).InPostPayWidget;
  delete (page.win as unknown as Record<string, unknown>).__INPOST_PAY_WIDGET__;
  delete (page.win as unknown as Record<string, unknown>).__bitsnapInpostOwner;
  delete (page.win as unknown as Record<string, unknown>).__cart_is_listening;
});

const settle = async (ms = 40) => {
  await React.act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));
};

const PRODUCTS = [
  {
    id: "var-1",
    ownerID: "o",
    name: "Shirt",
    description: null,
    price: 2500,
    currency: "PLN",
    metadata: {},
    image_url: null,
    isDeliverable: false,
    variants: [],
  },
];

type MockWidget = {
  init: (options: InPostWidgetInitOptions) => InPostPayWidgetInstance;
  options: InPostWidgetInitOptions | undefined;
  inits: number;
  rerenders: number;
};

function installWidget(): MockWidget {
  const mock: MockWidget = {
    options: undefined,
    inits: 0,
    rerenders: 0,
    init(options) {
      mock.options = options;
      mock.inits += 1;
      const instance = {
        refresh: () => {},
        rerender: () => {
          mock.rerenders += 1;
        },
      };
      (page.win as unknown as Record<string, unknown>).__INPOST_PAY_WIDGET__ = instance;
      return instance;
    },
  };
  (page.win as unknown as Record<string, unknown>).InPostPayWidget = {
    init: mock.init,
  };
  return mock;
}

async function installMocks(args: {
  availabilityStatus?: number;
  snapshot?: () => unknown;
  inpostStart?: unknown;
  inpostStatus?: unknown;
  deliveryMethods?: import("./test-support").MockDeliveryMethod[];
  deliveryQuoteUnavailable?: boolean;
} = {}) {
  const { installExpressMocks, snapshotOf } = await import("./test-support");
  return installExpressMocks({
    availabilityStatus: args.availabilityStatus,
    products: PRODUCTS,
    ...(args.deliveryMethods != null
      ? { deliveryMethods: args.deliveryMethods }
      : {}),
    ...(args.deliveryQuoteUnavailable === true
      ? { deliveryQuoteUnavailable: true }
      : {}),
    ...(args.inpostStatus !== undefined ? { inpostStatus: args.inpostStatus } : {}),
    snapshot:
      args.snapshot ??
      (() => snapshotOf({ items: [{ id: "var-1", quantity: 1 }] })),
    ...(args.inpostStart !== undefined ? { inpostStart: args.inpostStart } : {}),
  });
}

async function mount(props: Partial<React.ComponentProps<typeof InPostPayButton>> = {}) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(
      <InPostPayButton projectID={TEST_KEY} locale="pl-PL" analytics={false} {...props} />,
    );
  });
  await settle();
  return container;
}

describe("InPost Pay button", () => {
  it("renders no widget when the backend has no express support", async () => {
    await installMocks({ availabilityStatus: 501 });
    const widget = installWidget();
    const container = await mount({ productId: "var-1" });
    assert.equal(container.querySelector("inpost-izi-button"), null);
    assert.equal(widget.inits, 0);
  });

  it("re-asks availability when the global cart changes outside the button", async () => {
    const mocks = await installMocks();
    const widget = installWidget();
    const container = await mount({});
    assert.equal(container.querySelector("inpost-izi-button"), null);
    assert.equal(mocks.callsTo("/express/availability").length, 0);

    page.win.localStorage.setItem(
      "checkout",
      JSON.stringify({
        country: "PL",
        products: [{ id: "a", productID: "var-1", quantity: 1 }],
      }),
    );
    page.win.dispatchEvent(
      new page.win.StorageEvent("storage", { key: "checkout" }),
    );
    await settle();
    assert.ok(container.querySelector("inpost-izi-button") != null);
    assert.equal(mocks.callsTo("/express/availability").length, 1);
    assert.equal(widget.inits, 1);
  });

  it("renders the official element and binds a product on the first click", async () => {
    const mocks = await installMocks({
      inpostStart: {
        success: true,
        provider: "inpostPay",
        redirectUrl: "https://inpost.example/start",
        providerOrderId: "basket-1",
        cartRevision: 0,
        publicConfig: { basketBindingApiKey: "bk-1" },
      },
    });
    const widget = installWidget();
    const container = await mount({ productId: "var-1", quantity: 2 });

    const element = container.querySelector("inpost-izi-button");
    assert.ok(element != null);
    assert.equal(element!.getAttribute("binding_place"), "PRODUCT_CARD");
    assert.equal(element!.getAttribute("data-product-id"), "var-1");
    assert.equal(widget.options?.merchantClientId, "mc-1");
    assert.equal(widget.options?.language, "pl");

    let key: string | undefined;
    await React.act(async () => {
      key = await widget.options!.unboundWidgetClicked!("var-1");
    });
    assert.equal(key, "bk-1");

    const cartWrite = mocks.callsTo("/express/cart")[0];
    assert.deepEqual((cartWrite.body as { items: unknown[] }).items, [
      { id: "var-1", quantity: 2 },
    ]);
    const start = mocks.callsTo("/express/inpost/start")[0];
    const startHeaders = start.headers as Record<string, string>;
    assert.equal(startHeaders["x-bitsnap-cart-token"], "tok-1");
    const saved = page.win.localStorage.getItem("checkout");
    assert.match(saved ?? "", /var-1/);
  });

  it("adopts the InPost basket changes into the local cart", async () => {
    let snapshot = await import("./test-support").then((m) =>
      m.snapshotOf({ items: [{ id: "var-1", quantity: 1 }] }),
    );
    await installMocks({
      snapshot: () => snapshot,
      inpostStart: {
        success: true,
        provider: "inpostPay",
        redirectUrl: "https://inpost.example/start",
        providerOrderId: "basket-1",
        cartRevision: 0,
        publicConfig: { basketBindingApiKey: "bk-1" },
      },
    });
    const widget = installWidget();
    const changed: number[] = [];
    await mount({
      productId: "var-1",
      onBasketChanged: (value) => changed.push(value.lines[0]?.quantity ?? 0),
    });
    await React.act(async () => {
      await widget.options!.unboundWidgetClicked!("var-1");
    });

    snapshot = {
      ...snapshot,
      revision: 2,
      lines: [{ ...snapshot.lines[0], quantity: 3 }],
    };
    let handled = false;
    await React.act(async () => {
      handled = await widget.options!.handleBasketEvent!("basketProductChanged");
    });
    assert.equal(handled, true);
    assert.deepEqual(changed, [3]);
    const saved = JSON.parse(page.win.localStorage.getItem("checkout") ?? "{}");
    assert.equal(saved.products[0].quantity, 3);
  });

  it("removes only purchased lines when the server confirms the InPost order", async () => {
    let snapshot = await import("./test-support").then((m) =>
      m.snapshotOf({ items: [{ id: "var-1", quantity: 1 }] }),
    );
    await installMocks({
      snapshot: () => snapshot,
      inpostStatus: {
        success: true,
        provider: "inpostPay",
        status: "completed",
        orderId: "order-1",
      },
      inpostStart: {
        success: true,
        provider: "inpostPay",
        redirectUrl: "https://inpost.example/start",
        providerOrderId: "basket-1",
        cartRevision: 0,
        publicConfig: { basketBindingApiKey: "bk-1" },
      },
    });
    const widget = installWidget();
    const created: Array<{ providerOrderId?: string; status?: string }> = [];
    await mount({
      productId: "var-1",
      confirmation: {
        timeoutMs: 1,
        intervalMs: 1,
        sleep: async () => {},
        now: () => 0,
      },
      onOrderCreated: (info) => created.push(info),
    });
    await React.act(async () => {
      await widget.options!.unboundWidgetClicked!("var-1");
    });

    // A product added while the buyer was paying in the InPost app.
    page.win.localStorage.setItem(
      "checkout",
      JSON.stringify({
        country: "PL",
        products: [
          { id: "a", productID: "var-1", quantity: 1 },
          { id: "b", productID: "var-2", quantity: 2 },
        ],
      }),
    );

    let handled = false;
    await React.act(async () => {
      handled = await widget.options!.handleBasketEvent!("orderCreated");
    });
    await settle();
    assert.equal(handled, true);
    assert.deepEqual(created, [
      { providerOrderId: "basket-1", status: "completed" },
    ]);
    const saved = JSON.parse(page.win.localStorage.getItem("checkout") ?? "{}");
    assert.deepEqual(
      saved.products.map((line: { productID: string; quantity: number }) => [
        line.productID,
        line.quantity,
      ]),
      [["var-2", 2]],
    );
    const record = page.win.localStorage.getItem(
      `bitsnap-express-cart:${encodeURIComponent("https://bitsnap.pl")}:${encodeURIComponent(TEST_KEY)}`,
    );
    assert.equal(record, null, "the paid cart record is forgotten");
  });

  it("keeps the cart when the browser order event is not server-confirmed", async () => {
    await installMocks({
      inpostStatus: {
        success: true,
        provider: "inpostPay",
        status: "pending",
      },
      inpostStart: {
        success: true,
        provider: "inpostPay",
        redirectUrl: "https://inpost.example/start",
        providerOrderId: "basket-1",
        cartRevision: 0,
        publicConfig: { basketBindingApiKey: "bk-1" },
      },
    });
    const widget = installWidget();
    const created: Array<{ status?: string }> = [];
    const container = await mount({
      productId: "var-1",
      confirmation: {
        timeoutMs: 1,
        intervalMs: 1,
        sleep: async () => {},
        now: () => 0,
      },
      onOrderCreated: (info) => created.push(info),
    });
    await React.act(async () => {
      await widget.options!.unboundWidgetClicked!("var-1");
    });
    page.win.localStorage.setItem(
      "checkout",
      JSON.stringify({
        country: "PL",
        products: [{ id: "a", productID: "var-1", quantity: 1 }],
      }),
    );

    await React.act(async () => {
      await widget.options!.handleBasketEvent!("orderCreated");
    });
    await settle();
    // The browser event is a hint; an unpaid order never clears the cart or
    // claims "confirmed".
    const saved = JSON.parse(page.win.localStorage.getItem("checkout") ?? "{}");
    assert.equal(saved.products[0].quantity, 1);
    assert.deepEqual(created, [{ providerOrderId: "basket-1", status: "pending" }]);
    assert.equal(
      container
        .querySelector("[data-bitsnap-express-status]")
        ?.getAttribute("data-bitsnap-express-status"),
      "pending",
    );
  });

  it("keeps the cart when the server reports the InPost order cancelled", async () => {
    await installMocks({
      inpostStatus: {
        success: true,
        provider: "inpostPay",
        status: "cancelled",
      },
      inpostStart: {
        success: true,
        provider: "inpostPay",
        redirectUrl: "https://inpost.example/start",
        providerOrderId: "basket-1",
        cartRevision: 0,
        publicConfig: { basketBindingApiKey: "bk-1" },
      },
    });
    const widget = installWidget();
    await mount({
      productId: "var-1",
      confirmation: {
        timeoutMs: 1,
        intervalMs: 1,
        sleep: async () => {},
        now: () => 0,
      },
    });
    await React.act(async () => {
      await widget.options!.unboundWidgetClicked!("var-1");
    });
    page.win.localStorage.setItem(
      "checkout",
      JSON.stringify({
        country: "PL",
        products: [{ id: "a", productID: "var-1", quantity: 1 }],
      }),
    );
    await React.act(async () => {
      await widget.options!.handleBasketEvent!("orderCreated");
    });
    await settle();
    const saved = JSON.parse(page.win.localStorage.getItem("checkout") ?? "{}");
    assert.equal(saved.products[0].quantity, 1);
  });

  it("retains a pending order and recovers it after a remount", async () => {
    await installMocks({
      inpostStatus: { success: true, provider: "inpostPay", status: "pending" },
      inpostStart: {
        success: true,
        provider: "inpostPay",
        redirectUrl: "https://inpost.example/start",
        providerOrderId: "basket-1",
        cartRevision: 0,
        publicConfig: { basketBindingApiKey: "bk-1" },
      },
    });
    let widget = installWidget();
    await mount({
      productId: "var-1",
      confirmation: {
        timeoutMs: 1,
        intervalMs: 1,
        sleep: async () => {},
        now: () => 0,
      },
    });
    await React.act(async () => {
      await widget.options!.unboundWidgetClicked!("var-1");
    });
    page.win.localStorage.setItem(
      "checkout",
      JSON.stringify({
        country: "PL",
        products: [{ id: "a", productID: "var-1", quantity: 1 }],
      }),
    );
    await React.act(async () => {
      await widget.options!.handleBasketEvent!("orderCreated");
    });
    await settle();
    assert.equal(
      JSON.parse(page.win.localStorage.getItem("checkout") ?? "{}").products[0]
        .quantity,
      1,
    );

    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    page.win.document.body.innerHTML = "";

    // The next visit gets a server-confirmed answer and only then clears.
    await installMocks({
      inpostStatus: {
        success: true,
        provider: "inpostPay",
        status: "completed",
        orderId: "order-1",
      },
    });
    widget = installWidget();
    await mount({
      productId: "var-1",
      confirmation: {
        timeoutMs: 1,
        intervalMs: 1,
        sleep: async () => {},
        now: () => 0,
      },
    });
    await settle();

    const saved = JSON.parse(page.win.localStorage.getItem("checkout") ?? "{}");
    assert.deepEqual(saved.products ?? [], []);
  });

  it("sends the same delivery quote to availability and provider start", async () => {
    const { snapshotOf } = await import("./test-support");
    const mocks = await installMocks({
      deliveryMethods: [
        { id: "courier", amount: 1500, name: "Courier", minDays: 1, maxDays: 3 },
      ],
      snapshot: () =>
        snapshotOf({
          items: [{ id: "var-1", quantity: 1 }],
          deliveryMinor: 1500,
        }),
      inpostStart: {
        success: true,
        provider: "inpostPay",
        redirectUrl: "https://inpost.example/start",
        providerOrderId: "basket-1",
        cartRevision: 0,
        publicConfig: { basketBindingApiKey: "bk-1" },
      },
    });
    const widget = installWidget();
    await mount({ productId: "var-1" });
    await React.act(async () => {
      await widget.options!.unboundWidgetClicked!("var-1");
    });
    const availability = mocks.callsTo("/express/availability")[0];
    const cart = mocks.callsTo("/express/cart")[0];
    const availabilityBody = availability.body as {
      delivery?: unknown[];
      deliveryMethod?: string;
    };
    const cartBody = cart.body as {
      delivery?: unknown[];
      deliveryMethod?: string;
    };
    assert.deepEqual(availabilityBody.delivery, [
      { name: "courier", min: 1, max: 3, price: 15 },
    ]);
    assert.equal(availabilityBody.deliveryMethod, "courier");
    assert.deepEqual(cartBody.delivery, availabilityBody.delivery);
    assert.equal(cartBody.deliveryMethod, "courier");
  });

  it("does not mount when the delivery quote is unavailable", async () => {
    await installMocks({ deliveryQuoteUnavailable: true });
    const widget = installWidget();
    const container = await mount({ productId: "var-1" });
    assert.equal(container.querySelector("inpost-izi-button"), null);
    assert.equal(widget.inits, 0);
  });

  it("renders the thank-you element on a thank-you placement", async () => {
    await import("./test-support").then((m) =>
      m.installExpressMocks({
        products: PRODUCTS,
        snapshot: () => m.snapshotOf({ items: [{ id: "var-1", quantity: 1 }] }),
      }),
    );
    installWidget();
    const container = await mount({
      productId: "var-1",
      bindingPlace: "THANK_YOU_PAGE",
    });
    assert.ok(container.querySelector("inpost-thank-you") != null);
    assert.equal(container.querySelector("inpost-izi-button"), null);
  });

  it("reuses the page-wide widget on a remount instead of initialising twice", async () => {
    await installMocks();
    const widget = installWidget();
    await mount({ productId: "var-1" });
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    await mount({ productId: "var-1" });
    assert.equal(widget.inits, 1);
    assert.ok(widget.rerenders >= 2);
  });
});
