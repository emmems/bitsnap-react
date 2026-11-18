import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import {
  create,
  fromBinary,
  toBinary,
  type DescMessage,
  type MessageInitShape,
} from "@bufbuild/protobuf";
import { setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  GetOrdersResponseSchema,
  GetPublicOrderDetailsRequestSchema,
  GetPublicOrderDetailsResponseSchema,
} from "../gen/proto/public/v1/public_api_pb";
import { setPanelConfig } from "./config.ts";
import { dropEmptyOrderId } from "./components/PanelPage.tsx";

const page = setupReactPage("https://shop.example.test/panel");

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let PanelProvider: typeof import("./PanelProvider.tsx").PanelProvider;
let Panel: typeof import("./components/PanelPage.tsx").default;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ PanelProvider } = await import("./PanelProvider.tsx"));
  Panel = (await import("./components/PanelPage.tsx")).default;
});

const SESSION_KEY = `bitsnap-panel-session:${encodeURIComponent("https://bitsnap.pl")}:${encodeURIComponent(TEST_KEY)}`;

function proto<T extends DescMessage>(schema: T, init: MessageInitShape<T>) {
  return new Response(toBinary(schema, create(schema, init)) as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/proto" },
  });
}

const roots: Array<{ unmount: () => void }> = [];
const detailRequests: Array<{ orderId: string; accessToken: string }> = [];
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  setPanelConfig({
    projectID: TEST_KEY,
    host: undefined,
    theme: { colors: { brand: "#dc2626", brandDark: "#fca5a5" } },
  });
  page.win.localStorage.clear();
  page.win.localStorage.setItem(SESSION_KEY, "panel-token");
  detailRequests.length = 0;
  globalThis.fetch = (async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.endsWith("/GetOrders")) {
      return proto(GetOrdersResponseSchema, { orders: [], totalCount: 0 });
    }
    if (url.endsWith("/GetPublicOrderDetails")) {
      const request = fromBinary(
        GetPublicOrderDetailsRequestSchema,
        new Uint8Array(init?.body as ArrayBuffer),
      );
      detailRequests.push({
        orderId: request.orderId,
        accessToken: request.accessToken ?? "",
      });
      return proto(GetPublicOrderDetailsResponseSchema, {
        result: {
          case: "order",
          value: { orderId: "c_TEY3", status: "paid", currency: "PLN", totalAmount: 2500n },
        },
      });
    }
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  console.error = () => {};
  console.warn = () => {};
});

afterEach(async () => {
  console.error = originalError;
  console.warn = originalWarn;
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  page.win.history.replaceState(null, "", "/panel");
});

const settle = (ms = 60) =>
  React.act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function mountAt(search: string) {
  page.win.history.replaceState(null, "", `/panel${search}`);
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () =>
    root.render(
      <PanelProvider analytics={false}>
        <Panel analytics={false} />
      </PanelProvider>,
    ),
  );
  await settle();
  await settle();
  return container;
}

const q = (value: string) => encodeURIComponent(JSON.stringify(value));

describe("dropEmptyOrderId", () => {
  it("drops an empty id and turns order-details into the order list", () => {
    const next = dropEmptyOrderId(`?state=${q("order-details")}&orderId=${q("")}`);
    assert.equal(next, `?state=${q("orders")}`);
    assert.equal(dropEmptyOrderId(`?state=${q("order-details")}&orderId=`), `?state=${q("orders")}`);
    assert.equal(dropEmptyOrderId(`?state=${q("order-details")}`), `?state=${q("orders")}`);
    assert.equal(dropEmptyOrderId(`?orderId=${q("  ")}`), "");
  });

  it("leaves a real id and other screens alone", () => {
    assert.equal(dropEmptyOrderId(`?state=${q("order-details")}&orderId=${q("ord_1")}`), null);
    assert.equal(dropEmptyOrderId(`?state=${q("products")}`), null);
    assert.equal(dropEmptyOrderId(""), null);
  });
});

describe("Panel", () => {
  it("is a panel theme boundary with the brand mapping inline", async () => {
    const container = await mountAt("");
    const root = container.querySelector<HTMLElement>("[data-bitsnap-panel]");
    assert.ok(root, "panel root");
    assert.equal(root.dataset.bitsnapTheme, "inherit");
    assert.equal(root.classList.contains("dark"), false);
    assert.equal(root.style.getPropertyValue("--panel-accent"), "#dc2626");
    assert.equal(root.style.getPropertyValue("--panel-accent-dark"), "#fca5a5");
    assert.equal(root.style.getPropertyValue("--primary"), "var(--panel-accent-now)");
    assert.doesNotMatch(root.className, /font-inter|bg-beige-100/);
    assert.equal(root.style.getPropertyValue("--button-background-color"), "");
  });

  it("falls back to the order list for an order without an id", async () => {
    const container = await mountAt(`?state=${q("order-details")}&orderId=${q("")}`);
    assert.equal(page.win.location.search, `?state=${q("orders")}`);
    const main = container.querySelector("main");
    assert.ok(main?.textContent?.includes("Historia zamówień"), main?.textContent ?? "");
    assert.equal(detailRequests.length, 0);
  });

  it("opens an order with the buyer's session", async () => {
    await mountAt(`?state=${q("order-details")}&orderId=${q("ord_1")}`);
    assert.deepEqual(detailRequests[0], { orderId: "ord_1", accessToken: "panel-token" });
  });
});
