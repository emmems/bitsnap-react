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
/** What GetPublicOrderDetails answers; a Response is sent as it is. */
let detail: () => Response | MessageInitShape<typeof GetPublicOrderDetailsResponseSchema>;
const baseOrder = {
  orderId: "c_TEY3",
  status: "paid",
  currency: "PLN",
  totalAmount: 2500n,
  isVerified: true,
  customerName: "Jan Kowalski",
  customerEmail: "jan@example.test",
  customerPhone: "+48 600 100 200",
  deliveryAddress: "ul. Długa 1, 00-001 Warszawa",
  deliveryMethod: "Kurier",
  items: [{ name: "Ebook", quantity: 1, price: 2500n, currency: "PLN" }],
  comments: [{ id: 1, message: "Dziękujemy!", authorType: "seller", authorName: "Sklep" }],
  commentCount: 1,
};
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
  detail = () => ({ result: { case: "order", value: baseOrder } });
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
      const answer = detail();
      return answer instanceof Response
        ? answer
        : proto(GetPublicOrderDetailsResponseSchema, answer);
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
    assert.equal(main?.querySelector("h1")?.textContent, "Zamówienia");
    assert.equal(detailRequests.length, 0);
  });

  it("opens an order with the buyer's session", async () => {
    await mountAt(`?state=${q("order-details")}&orderId=${q("ord_1")}`);
    assert.deepEqual(detailRequests[0], { orderId: "ord_1", accessToken: "panel-token" });
  });

  it("shows the order as a receipt for a logged-in buyer: no e-mail check, no comment form", async () => {
    const container = await mountAt(`?state=${q("order-details")}&orderId=${q("c_full_TEY3")}`);
    const main = container.querySelector("main")!;
    assert.equal(main.querySelector("h1")?.textContent, "Zamówienie c_TEY3");
    assert.match(main.textContent ?? "", /Razem/);
    assert.doesNotMatch(main.textContent ?? "", /Dostawa i rabaty|Potwierdź e-mail|Zweryfikuj/);
    assert.equal(main.querySelector("textarea"), null);
    // Address and phone stay behind "Pokaż dane".
    assert.doesNotMatch(main.textContent ?? "", /ul\. Długa/);
    const show = [...main.querySelectorAll("button")].find((b) => b.textContent === "Pokaż dane")!;
    await React.act(async () => show.click());
    assert.match(main.textContent ?? "", /ul\. Długa 1/);
    assert.match(main.textContent ?? "", /\+48 600 100 200/);
    // The comment thread is read-only, behind a disclosure.
    const comments = [...main.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")].find((b) => /Komentarze/.test(b.textContent ?? ""))!;
    await React.act(async () => comments.click());
    assert.match(main.textContent ?? "", /Dziękujemy!/);
  });

  it("separates a failed request (retry) from a missing order (way back)", async () => {
    detail = () => new Response(null, { status: 503 });
    let container = await mountAt(`?state=${q("order-details")}&orderId=${q("ord_1")}`);
    assert.match(container.querySelector("[role=alert]")?.textContent ?? "", /Nie udało się pobrać zamówienia/);
    detail = () => ({ result: { case: "order", value: baseOrder } });
    const retry = [...container.querySelectorAll("button")].find((b) => b.textContent === "Spróbuj ponownie")!;
    await React.act(async () => retry.click());
    await settle();
    assert.equal(container.querySelector("main h1")?.textContent, "Zamówienie c_TEY3");

    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    detail = () => ({ result: { case: "failure", value: 1 } });
    container = await mountAt(`?state=${q("order-details")}&orderId=${q("ord_2")}`);
    assert.match(container.textContent ?? "", /Nie możemy otworzyć tego zamówienia/);
    const back = [...container.querySelectorAll("button")].find((b) => b.textContent === "Wróć do zamówień")!;
    await React.act(async () => back.click());
    await settle();
    assert.equal(page.win.location.search, `?state=${q("orders")}`);
  });

  it("goes back to the list with the browser's back button", async () => {
    await mountAt(`?state=${q("orders")}`);
    page.win.history.pushState({}, "", `/panel?state=${q("order-details")}&orderId=${q("ord_1")}`);
    await React.act(async () => page.win.dispatchEvent(new page.win.PopStateEvent("popstate")));
    await settle();
    assert.equal(page.win.document.querySelector("main h1")?.textContent, "Zamówienie c_TEY3");
    page.win.history.pushState({}, "", `/panel?state=${q("orders")}`);
    await React.act(async () => page.win.dispatchEvent(new page.win.PopStateEvent("popstate")));
    await settle();
    assert.equal(page.win.document.querySelector("main h1")?.textContent, "Zamówienia");
  });
});

describe("PublicOrderPage", () => {
  it("explains an order without an id instead of rendering nothing", async () => {
    const PublicOrderPage = (await import("./components/PublicOrderPage.tsx")).default;
    const container = page.win.document.createElement("div");
    page.win.document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    let back = 0;
    await React.act(async () =>
      root.render(
        <PanelProvider analytics={false}>
          <PublicOrderPage variant="panel" onBack={() => back++} />
        </PanelProvider>,
      ),
    );
    await settle();
    assert.match(container.textContent ?? "", /To starsze zamówienie/);
    assert.equal(detailRequests.length, 0);
    await React.act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    assert.equal(back, 1);
  });

  it("is its own themed page when standalone, with no --button-* styles", async () => {
    const PublicOrderPage = (await import("./components/PublicOrderPage.tsx")).default;
    const container = page.win.document.createElement("div");
    page.win.document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    page.win.localStorage.clear();
    await React.act(async () =>
      root.render(
        <PanelProvider analytics={false}>
          <PublicOrderPage orderID="ord_9" />
        </PanelProvider>,
      ),
    );
    await settle();
    await settle();
    const boundary = container.querySelector<HTMLElement>("[data-bitsnap-panel]");
    assert.ok(boundary);
    assert.equal(boundary.style.getPropertyValue("--panel-accent"), "#dc2626");
    assert.equal(boundary.getAttribute("style")?.includes("--button-"), false);
    assert.equal(container.querySelector("h1")?.textContent, "Zamówienie c_TEY3");
    // No session: masked data can be confirmed with the order e-mail.
    assert.equal(detailRequests[0].accessToken, "");
  });
});

