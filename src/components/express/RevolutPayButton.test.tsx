import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import type {
  RevolutCheckoutNamespace,
  RevolutPayPaymentOptions,
} from "@/src/express/revolut-sdk";

const page = setupReactPage("https://shop.example.test/cart");

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let RevolutPayButton: typeof import("./RevolutPayButton").default;
let resetRevolutLoader: typeof import("@/src/express/revolut-sdk").resetRevolutLoader;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  RevolutPayButton = (await import("./RevolutPayButton.tsx")).default;
  ({ resetRevolutLoader } = await import("@/src/express/revolut-sdk"));
});

const roots: Array<{ unmount: () => void }> = [];

afterEach(async () => {
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  page.win.localStorage.clear();
  delete (page.win as unknown as Record<string, unknown>).RevolutCheckout;
  resetRevolutLoader();
});

const settle = async (ms = 40) => {
  await React.act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));
};

type Mounted = {
  target: HTMLElement | null;
  options: RevolutPayPaymentOptions;
};
type Listeners = {
  click?: () => void;
  payment?: (event: unknown) => void;
};

function installRevolutSdk(): {
  mounts: Mounted[];
  listeners: Listeners;
  paymentsCalls: Array<{ publicToken: string; mode?: string; locale?: string }>;
  destroyed: () => number;
} {
  const mounts: Mounted[] = [];
  const listeners: Listeners = {};
  const paymentsCalls: Array<{ publicToken: string; mode?: string; locale?: string }> = [];
  let destroyCount = 0;
  const namespace: RevolutCheckoutNamespace = {
    payments: async (options) => {
      paymentsCalls.push(options);
      return {
        revolutPay: {
          mount: (target, options) => {
            mounts.push({ target: target as HTMLElement | null, options });
          },
          on: ((
            event: "click" | "payment",
            callback: (payload?: unknown) => void,
          ) => {
            if (event === "click") listeners.click = callback;
            else listeners.payment = callback;
          }) as never,
          destroy: () => {
            destroyCount += 1;
          },
        },
        destroy: () => {
          destroyCount += 1;
        },
      };
    },
  };
  (page.win as unknown as Record<string, unknown>).RevolutCheckout = namespace;
  return { mounts, listeners, paymentsCalls, destroyed: () => destroyCount };
}

async function installMocks(args: {
  available?: boolean;
  start?: unknown;
  status?: unknown;
  cartWrite?: Parameters<typeof import("./test-support").installExpressMocks>[0]["cartWrite"];
  deliveryMethods?: import("./test-support").MockDeliveryMethod[];
  snapshot?: () => unknown;
}) {
  const { installExpressMocks, snapshotOf } = await import("./test-support");
  return installExpressMocks({
    availability: {
      revolutPay: {
        available: args.available ?? true,
        publicConfig: { publicKey: "pk_test", mode: "sandbox" },
      },
    },
    ...(args.deliveryMethods != null
      ? { deliveryMethods: args.deliveryMethods }
      : {}),
    snapshot:
      args.snapshot ??
      (() => snapshotOf({ items: [{ id: "p1", quantity: 1 }] })),
    ...(args.cartWrite != null ? { cartWrite: args.cartWrite } : {}),
    ...(args.start !== undefined
      ? { revolutStart: args.start }
      : {
          revolutStart: {
            success: true,
            provider: "revolutPay",
            redirectUrl: "https://shop.example.test/cart",
            providerOrderId: "order-1",
            cartRevision: 0,
            publicConfig: {
              publicKey: "pk_test",
              mode: "sandbox",
              orderToken: "token-1",
            },
          },
        }),
    ...(args.status !== undefined ? { revolutStatus: args.status } : {}),
  });
}

async function mount(props: Partial<React.ComponentProps<typeof RevolutPayButton>> = {}) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(
      <RevolutPayButton
        projectID={TEST_KEY}
        locale="pl-PL"
        analytics={false}
        confirmation={{ timeoutMs: 500, intervalMs: 1, sleep: async () => {}, now: () => 0 }}
        {...props}
      />,
    );
  });
  await settle();
  return container;
}

function seedCart(items: Array<{ id: string; quantity: number }>) {
  page.win.localStorage.setItem(
    "checkout",
    JSON.stringify({
      country: "PL",
      products: items.map((item, index) => ({
        id: `${item.id}-${index}`,
        productID: item.id,
        quantity: item.quantity,
      })),
    }),
  );
}

function cartOf(): Array<[string, number]> {
  const parsed = JSON.parse(page.win.localStorage.getItem("checkout") ?? "{}");
  return (parsed.products ?? []).map(
    (line: { productID: string; quantity: number }) => [line.productID, line.quantity],
  );
}

describe("Revolut Pay button", () => {
  beforeEach(async () => {
    resetRevolutLoader();
    const { clearDeliveryQuoteCache } = await import(
      "@/src/express/delivery-quote"
    );
    clearDeliveryQuoteCache();
  });

  it("stays hidden when the provider is not available", async () => {
    const sdk = installRevolutSdk();
    await installMocks({ available: false });
    seedCart([{ id: "p1", quantity: 1 }]);
    const container = await mount();
    assert.equal(sdk.paymentsCalls.length, 0);
    assert.equal(container.querySelector("[data-bitsnap-express-status]"), null);
  });

  it("mounts the official button with the server-priced cart", async () => {
    const sdk = installRevolutSdk();
    const mocks = await installMocks({});
    seedCart([{ id: "p1", quantity: 1 }]);
    await mount();

    assert.deepEqual(sdk.paymentsCalls[0], {
      publicToken: "pk_test",
      mode: "sandbox",
      locale: "pl",
    });
    assert.equal(sdk.mounts.length, 1);
    assert.equal(sdk.mounts[0].options.currency, "PLN");
    assert.equal(sdk.mounts[0].options.totalAmount, 2500);
    assert.equal(typeof sdk.mounts[0].options.createOrder, "function");
    assert.equal(mocks.callsTo("/express/cart").length, 1);
  });

  it("creates the server order and returns the public token", async () => {
    const sdk = installRevolutSdk();
    const mocks = await installMocks({});
    seedCart([{ id: "p1", quantity: 1 }]);
    await mount();

    let created: { publicId: string } | undefined;
    await React.act(async () => {
      created = await sdk.mounts[0].options.createOrder();
    });
    assert.deepEqual(created, { publicId: "token-1" });
    const start = mocks.callsTo("/express/revolut/start")[0];
    assert.ok(start != null);
    const headers = start.headers as Record<string, string>;
    assert.equal(headers["x-bitsnap-cart-token"], "tok-1");
  });

  it("creates only one provider order for a double click", async () => {
    const sdk = installRevolutSdk();
    const mocks = await installMocks({});
    seedCart([{ id: "p1", quantity: 1 }]);
    await mount();

    await React.act(async () => {
      await Promise.all([
        sdk.mounts[0].options.createOrder(),
        sdk.mounts[0].options.createOrder(),
      ]);
    });
    assert.equal(mocks.callsTo("/express/revolut/start").length, 1);
  });

  it("removes only purchased lines after the server confirms the payment", async () => {
    const sdk = installRevolutSdk();
    await installMocks({
      status: {
        success: true,
        provider: "revolutPay",
        status: "completed",
        orderId: "order-1",
      },
    });
    const results: string[] = [];
    seedCart([{ id: "p1", quantity: 1 }]);
    const container = await mount({
      onPaymentResult: (outcome) => results.push(outcome.status),
    });
    await React.act(async () => {
      await sdk.mounts[0].options.createOrder();
    });

    // Added while the buyer was in the Revolut flow.
    seedCart([
      { id: "p1", quantity: 1 },
      { id: "p2", quantity: 2 },
    ]);
    await React.act(async () => {
      sdk.listeners.payment!({ type: "success", orderId: "token-1" });
    });
    await settle();

    assert.deepEqual(cartOf(), [["p2", 2]]);
    assert.deepEqual(results, ["completed"]);
    const status = container.querySelector("[data-bitsnap-express-status]");
    assert.equal(status?.getAttribute("data-bitsnap-express-status"), "confirmed");
    assert.match(status?.textContent ?? "", /Płatność potwierdzona/);
  });

  it("keeps the cart when the buyer cancels", async () => {
    const sdk = installRevolutSdk();
    await installMocks({});
    const results: string[] = [];
    seedCart([{ id: "p1", quantity: 2 }]);
    const container = await mount({
      onPaymentResult: (outcome) => results.push(outcome.status),
    });
    await React.act(async () => {
      await sdk.mounts[0].options.createOrder();
    });

    await React.act(async () => {
      sdk.listeners.payment!({ type: "cancel", dropOffState: "payment_summary" });
    });
    assert.deepEqual(cartOf(), [["p1", 2]]);
    assert.deepEqual(results, ["cancelled"]);
    assert.equal(
      container
        .querySelector("[data-bitsnap-express-status]")
        ?.getAttribute("data-bitsnap-express-status"),
      "cancelled",
    );
  });

  it("does not remove the cart when the browser reports success but the server does not", async () => {
    const sdk = installRevolutSdk();
    await installMocks({
      status: { success: true, provider: "revolutPay", status: "pending" },
    });
    seedCart([{ id: "p1", quantity: 1 }]);
    const container = await mount({
      confirmation: {
        timeoutMs: 1,
        intervalMs: 1,
        sleep: async () => {},
        now: () => 0,
      },
    });
    await React.act(async () => {
      await sdk.mounts[0].options.createOrder();
    });
    await React.act(async () => {
      sdk.listeners.payment!({ type: "success", orderId: "token-1" });
    });
    await settle();
    assert.deepEqual(cartOf(), [["p1", 1]]);
    assert.equal(
      container
        .querySelector("[data-bitsnap-express-status]")
        ?.getAttribute("data-bitsnap-express-status"),
      "pending",
    );
  });

  it("updates availability when the global cart changes outside the button", async () => {
    const sdk = installRevolutSdk();
    await installMocks({});
    await mount();
    assert.equal(sdk.paymentsCalls.length, 0);

    seedCart([{ id: "p1", quantity: 1 }]);
    page.win.dispatchEvent(
      new page.win.StorageEvent("storage", { key: "checkout" }),
    );
    await settle();
    assert.equal(sdk.mounts.length, 1);
    assert.equal(sdk.mounts[0].options.totalAmount, 2500);
  });

  it("stays hidden for a deliverable cart instead of mounting zero shipping", async () => {
    const sdk = installRevolutSdk();
    await installMocks({
      deliveryMethods: [{ id: "courier", amount: 1500, name: "Courier" }],
    });
    seedCart([{ id: "p1", quantity: 1 }]);
    const container = await mount();
    assert.equal(sdk.paymentsCalls.length, 0);
    assert.equal(container.querySelector("[data-bitsnap-express-status]"), null);
  });

  it("remounts with the new total instead of paying the stale SDK amount", async () => {
    const sdk = installRevolutSdk();
    const mocks = await installMocks({
      cartWrite: (body, snapshot) => {
        if (body.cartId == null) {
          return undefined;
        }
        // The server repriced the cart after the button mounted.
        return {
          status: 200,
          body: {
            success: true,
            snapshot: {
              ...snapshot,
              totalMinor: 4000,
              revision: snapshot.revision + 1,
            },
          },
        };
      },
    });
    seedCart([{ id: "p1", quantity: 1 }]);
    const container = await mount();
    assert.equal(sdk.mounts[0].options.totalAmount, 2500);

    await React.act(async () => {
      await assert.rejects(sdk.mounts[0].options.createOrder());
    });
    await settle();
    assert.equal(mocks.callsTo("/express/revolut/start").length, 0);
    assert.equal(sdk.mounts.length, 2, "the button was remounted");
    assert.equal(sdk.mounts[1].options.totalAmount, 4000);
    assert.equal(
      container
        .querySelector("[data-bitsnap-express-status]")
        ?.getAttribute("data-bitsnap-express-status"),
      "price-changed",
    );
  });

  it("destroys the SDK on unmount", async () => {
    const sdk = installRevolutSdk();
    await installMocks({});
    seedCart([{ id: "p1", quantity: 1 }]);
    await mount();
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    assert.ok(sdk.destroyed() >= 1);
  });
});
