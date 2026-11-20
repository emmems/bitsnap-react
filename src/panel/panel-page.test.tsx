import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import {
  create,
  fromBinary,
  toBinary,
  type DescMessage,
  type MessageInitShape,
} from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  GetOrderHistoryRequestSchema,
  GetOrderHistoryResponseSchema,
  GetOrdersRequestSchema,
  GetOrdersResponseSchema,
  GetPublicOrderDetailsRequestSchema,
  GetPublicOrderDetailsResponseSchema,
  UserPanelGetProductsResponseSchema,
  UserProductType,
} from "../gen/proto/public/v1/public_api_pb";
import { setPanelConfig } from "./config.ts";
import { dropEmptyOrderId } from "./components/PanelPage.tsx";
import { useUrlSearchParams } from "./hooks/useUrlSearchParams.ts";

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
let detail: (request: { email?: string; accessToken?: string }) =>
  | Response
  | MessageInitShape<typeof GetPublicOrderDetailsResponseSchema>;
let ordersAnswer: (request: { projectId: string }) => MessageInitShape<typeof GetOrdersResponseSchema>;
let productsAnswer: () => MessageInitShape<typeof UserPanelGetProductsResponseSchema>;
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
const detailRequests: Array<{
  projectId: string;
  orderId: string;
  accessToken: string;
  email?: string;
}> = [];
const historyRequests: Array<{ projectId: string; orderId: string }> = [];
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
  historyRequests.length = 0;
  detail = () => ({ result: { case: "order", value: baseOrder } });
  ordersAnswer = () => ({ orders: [], totalCount: 0 });
  productsAnswer = () => ({ result: { case: "success", value: { products: [] } } });
  globalThis.fetch = (async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.endsWith("/GetOrders")) {
      const request = fromBinary(
        GetOrdersRequestSchema,
        new Uint8Array(init?.body as ArrayBuffer),
      );
      return proto(GetOrdersResponseSchema, ordersAnswer(request));
    }
    if (url.endsWith("/UserPanelGetProducts")) {
      return proto(UserPanelGetProductsResponseSchema, productsAnswer());
    }
    if (url.endsWith("/GetOrderHistory")) {
      const request = fromBinary(
        GetOrderHistoryRequestSchema,
        new Uint8Array(init?.body as ArrayBuffer),
      );
      historyRequests.push({
        projectId: request.projectId,
        orderId: request.orderId,
      });
      return proto(GetOrderHistoryResponseSchema, {
        result: { case: "success", value: { entries: [], nextPageToken: "" } },
      });
    }
    if (url.endsWith("/GetPublicOrderDetails")) {
      const request = fromBinary(
        GetPublicOrderDetailsRequestSchema,
        new Uint8Array(init?.body as ArrayBuffer),
      );
      detailRequests.push({
        projectId: request.projectId,
        orderId: request.orderId,
        accessToken: request.accessToken ?? "",
        ...(request.email ? { email: request.email } : {}),
      });
      const answer = detail(request);
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
    assert.equal(
      dropEmptyOrderId(`?state=${q("order-details")}&orderId=${q("")}&orderProject=${q("shopB")}`),
      `?state=${q("orders")}`,
    );
    assert.equal(dropEmptyOrderId(`?orderProject=${q("shopB")}`), "");
  });

  it("leaves a real id and other screens alone", () => {
    assert.equal(dropEmptyOrderId(`?state=${q("order-details")}&orderId=${q("ord_1")}`), null);
    assert.equal(
      dropEmptyOrderId(`?state=${q("order-details")}&orderId=${q("ord_1")}&orderProject=${q("shopB")}`),
      null,
    );
    assert.equal(dropEmptyOrderId(`?state=${q("products")}`), null);
    assert.equal(dropEmptyOrderId(""), null);
  });
});

describe("useUrlSearchParams", () => {
  const initialParams = {
    state: "products" as string,
    shop: undefined as string | undefined,
    orderProject: undefined as string | undefined,
  };
  const rawKeys = ["shop", "orderProject"] as const;

  it("uses replaceState when {replace:true}, pushState by default, and preserves raw string keys on popstate", async () => {
    const pushCalls: string[] = [];
    const replaceCalls: string[] = [];
    const originalPush = page.win.history.pushState.bind(page.win.history);
    const originalReplace = page.win.history.replaceState.bind(page.win.history);
    page.win.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
      pushCalls.push(String(url ?? ""));
      originalPush(data, unused, url);
    };
    page.win.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
      replaceCalls.push(String(url ?? ""));
      originalReplace(data, unused, url);
    };

    try {
      let latest = initialParams;
      let update!: (
        next: Partial<typeof initialParams>,
        opts?: { replace?: boolean },
      ) => void;
      function Harness() {
        const [params, setParams] = useUrlSearchParams(initialParams, {
          rawStringKeys: rawKeys,
        });
        latest = params;
        update = setParams;
        return null;
      }

      const container = page.win.document.createElement("div");
      page.win.document.body.appendChild(container);
      const root = createRoot(container);
      roots.push(root);
      await React.act(async () => root.render(<Harness />));

      await React.act(async () => update({ shop: "shopA" }, { replace: true }));
      assert.equal(replaceCalls.length, 1);
      assert.equal(pushCalls.length, 0);
      assert.equal(latest.shop, "shopA");

      await React.act(async () => update({ state: "orders" }));
      assert.equal(pushCalls.length, 1);
      assert.equal(replaceCalls.length, 1);
      assert.equal(latest.state, "orders");

      originalReplace(null, "", "/panel?state=%22orders%22&shop=1e5&orderProject=1e5");
      await React.act(async () =>
        page.win.dispatchEvent(new page.win.PopStateEvent("popstate")),
      );
      assert.equal(latest.state, "orders");
      assert.equal(latest.shop, "1e5");
      assert.equal(typeof latest.shop, "string");
      assert.equal(latest.orderProject, "1e5");
      assert.equal(typeof latest.orderProject, "string");
    } finally {
      page.win.history.pushState = originalPush;
      page.win.history.replaceState = originalReplace;
    }
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
    assert.deepEqual(detailRequests[0], {
      projectId: TEST_KEY,
      orderId: "ord_1",
      accessToken: "panel-token",
    });
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
    const region = page.win.document.getElementById(show.getAttribute("aria-controls")!);
    assert.ok(region, "aria-controls points at an element before the click");
    assert.equal(show.getAttribute("aria-expanded"), "false");
    show.focus();
    await React.act(async () => show.click());
    assert.match(main.textContent ?? "", /ul\. Długa 1/);
    assert.match(main.textContent ?? "", /\+48 600 100 200/);
    // The same button toggles back, so focus never drops to <body>.
    assert.equal(show.isConnected, true);
    assert.equal(show.getAttribute("aria-expanded"), "true");
    assert.equal(show.textContent, "Ukryj dane");
    assert.equal(page.win.document.activeElement, show);
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

  it("offers the e-mail check when the session gives masked data, and sends the e-mail without it", async () => {
    const masked = { ...baseOrder, isVerified: false, customerPhone: "", deliveryAddress: "ul. D***" };
    detail = (request) =>
      request.email === "jan@example.test"
        ? { result: { case: "order", value: baseOrder } }
        : { result: { case: "order", value: masked } };
    const container = await mountAt(`?state=${q("order-details")}&orderId=${q("ord_1")}`);
    assert.equal(detailRequests[0].accessToken, "panel-token");
    const main = container.querySelector("main")!;
    const verify = [...main.querySelectorAll("button")].find((b) => b.textContent === "Potwierdź e-mail");
    assert.ok(verify, "verify button is shown for masked data with a session");
    await React.act(async () => verify.click());

    const input = main.querySelector<HTMLInputElement>("input[type=email]")!;
    const type = async (value: string) => {
      await React.act(async () => {
        const setter = Object.getOwnPropertyDescriptor(page.win.HTMLInputElement.prototype, "value")!.set!;
        setter.call(input, value);
        input.dispatchEvent(new page.win.Event("input", { bubbles: true }));
      });
    };
    const submit = () =>
      React.act(async () =>
        main.querySelector("form")!.dispatchEvent(new page.win.Event("submit", { bubbles: true, cancelable: true })),
      );

    // A wrong e-mail keeps the order on screen and explains inside the card.
    await type("zly@example.test");
    await submit();
    await settle();
    await settle();
    assert.deepEqual(detailRequests.at(-1), {
      projectId: TEST_KEY,
      orderId: "ord_1",
      accessToken: "",
      email: "zly@example.test",
    });
    assert.equal(main.querySelector("h1")?.textContent, "Zamówienie c_TEY3");
    assert.match(main.querySelector("[role=alert]")?.textContent ?? "", /nie pasuje do zamówienia/);
    assert.doesNotMatch(main.textContent ?? "", /Nie możemy otworzyć/);

    // The right one unmasks the data.
    await type("jan@example.test");
    await submit();
    await settle();
    await settle();
    assert.equal(main.querySelector("[role=alert]"), null);
    assert.doesNotMatch(main.textContent ?? "", /Potwierdź e-mail/);
    assert.match(main.textContent ?? "", /Pokaż dane/);
  });

  it("keeps the order when the e-mail check fails outright", async () => {
    const masked = { ...baseOrder, isVerified: false };
    detail = (request) =>
      request.email ? { result: { case: "failure", value: "Order not found" } } : { result: { case: "order", value: masked } };
    const container = await mountAt(`?state=${q("order-details")}&orderId=${q("ord_1")}`);
    const main = container.querySelector("main")!;
    await React.act(async () => [...main.querySelectorAll("button")].find((b) => b.textContent === "Potwierdź e-mail")!.click());
    const input = main.querySelector<HTMLInputElement>("input[type=email]")!;
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(page.win.HTMLInputElement.prototype, "value")!.set!.call(input, "x@example.test");
      input.dispatchEvent(new page.win.Event("input", { bubbles: true }));
    });
    await React.act(async () =>
      main.querySelector("form")!.dispatchEvent(new page.win.Event("submit", { bubbles: true, cancelable: true })),
    );
    await settle();
    await settle();
    assert.equal(main.querySelector("h1")?.textContent, "Zamówienie c_TEY3");
    assert.match(main.querySelector("[role=alert]")?.textContent ?? "", /nie pasuje/);
  });

  it("signs out on an expired session instead of offering a retry that keeps failing", async () => {
    setPanelConfig({
      projectID: TEST_KEY,
      host: undefined,
      loginURL: "#signed-out",
      theme: { colors: { brand: "#dc2626", brandDark: "#fca5a5" } },
    });
    detail = () =>
      new Response(JSON.stringify({ code: "unauthenticated", message: "session expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    const container = await mountAt(`?state=${q("order-details")}&orderId=${q("ord_1")}`);
    assert.equal(page.win.localStorage.getItem(SESSION_KEY), null);
    assert.equal(page.win.location.hash, "#signed-out");
    assert.doesNotMatch(container.textContent ?? "", /Spróbuj ponownie/);
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

  it("global panel: uses orderProject for order details and timeline, and keeps raw string values like 1e5", async () => {
    const globalSessionKey = `bitsnap-panel-session:${encodeURIComponent("https://bitsnap.pl")}:*`;
    setPanelConfig({ projectID: "", host: undefined });
    page.win.localStorage.clear();
    page.win.localStorage.setItem(globalSessionKey, "global-token");

    const container = await mountAt(`?state=${q("order-details")}&orderId=${q("ord_9")}&orderProject=1e5`);
    assert.equal(detailRequests[0]?.projectId, "1e5");
    assert.equal(detailRequests[0]?.orderId, "ord_9");
    assert.equal(detailRequests[0]?.accessToken, "global-token");
    assert.deepEqual(historyRequests[0], { projectId: "1e5", orderId: "ord_9" });

    // Going back clears both orderId and orderProject.
    const back = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Zamówienia"),
    )!;
    await React.act(async () => back.click());
    await settle();
    assert.equal(page.win.location.search.includes("orderProject"), false);
    assert.equal(page.win.location.search.includes("orderId"), false);
  });

  it("shop panel: ignores orderProject in the URL and uses the panel projectID", async () => {
    await mountAt(`?state=${q("order-details")}&orderId=${q("ord_1")}&orderProject=${q("otherShop")}`);
    assert.equal(detailRequests[0]?.projectId, TEST_KEY);
    assert.equal(historyRequests[0]?.projectId, TEST_KEY);
  });

  it("global panel: a 401 on an order with orderProject clears the * session, not the shop session", async () => {
    const host = encodeURIComponent("https://bitsnap.pl");
    const globalKey = `bitsnap-panel-session:${host}:*`;
    const shopKey = `bitsnap-panel-session:${host}:shopB`;
    setPanelConfig({ projectID: "", host: undefined, loginURL: "#global-out" });
    page.win.localStorage.clear();
    page.win.localStorage.setItem(globalKey, "global-token");
    page.win.localStorage.setItem(shopKey, "shop-token");
    detail = () =>
      new Response(JSON.stringify({ code: "unauthenticated", message: "expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    await mountAt(`?state=${q("order-details")}&orderId=${q("ord_1")}&orderProject=${q("shopB")}`);
    assert.equal(page.win.localStorage.getItem(globalKey), null);
    assert.equal(page.win.localStorage.getItem(shopKey), "shop-token");
    assert.equal(page.win.location.hash, "#global-out");
  });

  it("global panel: hides Returns in navigation and maps returns / return-details to products", async () => {
    const globalKey = `bitsnap-panel-session:${encodeURIComponent("https://bitsnap.pl")}:*`;
    setPanelConfig({ projectID: "", host: undefined });
    page.win.localStorage.clear();
    page.win.localStorage.setItem(globalKey, "global-token");

    const container = await mountAt(`?state=${q("returns")}`);
    const navButtons = [...container.querySelectorAll("nav button")].map((b) => b.textContent);
    assert.deepEqual(navButtons, ["Biblioteka", "Zamówienia", "Konto"]);
    assert.equal(container.querySelector("nav [aria-current=page]")?.textContent, "Biblioteka");
    assert.ok(container.querySelector('[data-testid="panel-empty"]'));

    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    page.win.document.body.innerHTML = "";

    const detailsContainer = await mountAt(`?state=${q("return-details")}&returnId=${q("ret_1")}`);
    assert.equal(detailsContainer.querySelector("nav [aria-current=page]")?.textContent, "Biblioteka");
    assert.ok(detailsContainer.querySelector('[data-testid="panel-empty"]'));
  });

  it("global panel: opening an order writes orderProject while keeping shop, and back clears orderProject while shop stays", async () => {
    const globalKey = `bitsnap-panel-session:${encodeURIComponent("https://bitsnap.pl")}:*`;
    setPanelConfig({ projectID: "", host: undefined });
    page.win.localStorage.clear();
    page.win.localStorage.setItem(globalKey, "global-token");

    const shops = [
      { projectId: "shopA", name: "Sklep Alfa", orderCount: 1 },
      { projectId: "shopB", name: "Sklep Beta", orderCount: 1 },
    ];
    ordersAnswer = (req) => ({
      orders: [
        {
          id: req.projectId === "shopB" ? "c_BETA0001" : "c_ALFA0001",
          status: "paid",
          totalAmount: 4900,
          currency: "pln",
          customerName: "Jan",
          createdAt: timestampFromDate(new Date("2025-11-05T10:00:00Z")),
          projectId: req.projectId === "shopB" ? "shopB" : "shopA",
        },
      ],
      totalCount: 1,
      shops: req.projectId === "" ? shops : [],
    });

    const container = await mountAt(`?state=${q("orders")}&shop=${q("shopB")}`);
    const row = container.querySelector<HTMLButtonElement>("[data-order-row=open]")!;
    assert.ok(row, "order row renders on filtered global orders");

    await React.act(async () => row.click());
    await settle();
    await settle();

    const openedParams = new URLSearchParams(page.win.location.search);
    assert.equal(openedParams.get("state"), JSON.stringify("order-details"));
    assert.equal(openedParams.get("orderId"), JSON.stringify("c_BETA0001"));
    assert.equal(openedParams.get("orderProject"), JSON.stringify("shopB"));
    assert.equal(openedParams.get("shop"), JSON.stringify("shopB"));
    assert.equal(detailRequests[0]?.projectId, "shopB");
    assert.equal(historyRequests[0]?.projectId, "shopB");

    const back = [...container.querySelector("main")!.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Zamówienia"),
    )!;
    assert.ok(back, "back button in order details");
    await React.act(async () => back.click());
    await settle();

    const backParams = new URLSearchParams(page.win.location.search);
    assert.equal(backParams.get("state"), JSON.stringify("orders"));
    assert.equal(backParams.has("orderId"), false);
    assert.equal(backParams.has("orderProject"), false);
    assert.equal(backParams.get("shop"), JSON.stringify("shopB"));
  });

  it("shop panel: opening an order from Orders omits orderProject from the URL", async () => {
    ordersAnswer = () => ({
      orders: [
        {
          id: "c_SHOP0001",
          status: "paid",
          totalAmount: 4900,
          currency: "pln",
          customerName: "Jan",
          createdAt: timestampFromDate(new Date("2025-11-05T10:00:00Z")),
          projectId: TEST_KEY,
        },
      ],
      totalCount: 1,
    });

    const container = await mountAt(`?state=${q("orders")}`);
    const row = container.querySelector<HTMLButtonElement>("[data-order-row=open]")!;
    assert.ok(row);
    await React.act(async () => row.click());
    await settle();
    await settle();

    const params = new URLSearchParams(page.win.location.search);
    assert.equal(params.get("state"), JSON.stringify("order-details"));
    assert.equal(params.get("orderId"), JSON.stringify("c_SHOP0001"));
    assert.equal(params.has("orderProject"), false);
  });

  it("global panel: shop filter survives navigate() between Library and Orders", async () => {
    const globalKey = `bitsnap-panel-session:${encodeURIComponent("https://bitsnap.pl")}:*`;
    setPanelConfig({ projectID: "", host: undefined });
    page.win.localStorage.clear();
    page.win.localStorage.setItem(globalKey, "global-token");

    productsAnswer = () => ({
      result: {
        case: "success",
        value: {
          products: [
            {
              projectId: "shopA",
              projectName: "Sklep Alfa",
              accessId: "a1",
              productName: "Ebook Alfa",
              productType: UserProductType.FILE,
            },
            {
              projectId: "shopB",
              projectName: "Sklep Beta",
              accessId: "b1",
              productName: "Ebook Beta",
              productType: UserProductType.FILE,
            },
          ],
        },
      },
    });
    ordersAnswer = (req) => ({
      orders: [
        {
          id: "c_ALFA0001",
          status: "paid",
          totalAmount: 4900,
          currency: "pln",
          customerName: "Jan",
          createdAt: timestampFromDate(new Date("2025-11-05T10:00:00Z")),
          projectId: "shopA",
        },
      ],
      totalCount: 1,
      shops:
        req.projectId === ""
          ? [
              { projectId: "shopA", name: "Sklep Alfa", orderCount: 1 },
              { projectId: "shopB", name: "Sklep Beta", orderCount: 1 },
            ]
          : [],
    });

    const container = await mountAt(`?state=${q("products")}&shop=${q("shopA")}`);
    const nav = container.querySelector("nav")!;
    const ordersBtn = [...nav.querySelectorAll("button")].find((b) => b.textContent === "Zamówienia")!;
    const libraryBtn = [...nav.querySelectorAll("button")].find((b) => b.textContent === "Biblioteka")!;

    const pressedPill = () =>
      container.querySelector('[role="group"] button[aria-pressed="true"]')?.textContent ?? "";
    assert.match(pressedPill(), /Sklep Alfa/);

    await React.act(async () => ordersBtn.click());
    await settle();
    await settle();
    assert.equal(new URLSearchParams(page.win.location.search).get("shop"), JSON.stringify("shopA"));
    assert.match(pressedPill(), /Sklep Alfa/);

    await React.act(async () => libraryBtn.click());
    await settle();
    await settle();
    assert.equal(new URLSearchParams(page.win.location.search).get("shop"), JSON.stringify("shopA"));
    assert.match(pressedPill(), /Sklep Alfa/);
  });

  it("global panel: popstate to returns or return-details maps to products", async () => {
    const globalKey = `bitsnap-panel-session:${encodeURIComponent("https://bitsnap.pl")}:*`;
    setPanelConfig({ projectID: "", host: undefined });
    page.win.localStorage.clear();
    page.win.localStorage.setItem(globalKey, "global-token");

    const container = await mountAt(`?state=${q("orders")}`);
    assert.equal(container.querySelector("nav [aria-current=page]")?.textContent, "Zamówienia");

    page.win.history.pushState({}, "", `/panel?state=${q("returns")}`);
    await React.act(async () => page.win.dispatchEvent(new page.win.PopStateEvent("popstate")));
    await settle();
    assert.equal(container.querySelector("nav [aria-current=page]")?.textContent, "Biblioteka");
    assert.ok(container.querySelector('[data-testid="panel-empty"]'));

    page.win.history.pushState({}, "", `/panel?state=${q("orders")}`);
    await React.act(async () => page.win.dispatchEvent(new page.win.PopStateEvent("popstate")));
    await settle();
    assert.equal(container.querySelector("nav [aria-current=page]")?.textContent, "Zamówienia");

    page.win.history.pushState({}, "", `/panel?state=${q("return-details")}&returnId=${q("ret_1")}`);
    await React.act(async () => page.win.dispatchEvent(new page.win.PopStateEvent("popstate")));
    await settle();
    assert.equal(container.querySelector("nav [aria-current=page]")?.textContent, "Biblioteka");
    assert.ok(container.querySelector('[data-testid="panel-empty"]'));
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

  it("standalone: drops a rejected session and falls back to the e-mail check", async () => {
    const PublicOrderPage = (await import("./components/PublicOrderPage.tsx")).default;
    detail = (request) =>
      request.accessToken
        ? new Response(JSON.stringify({ code: "unauthenticated", message: "session expired" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          })
        : { result: { case: "order", value: { ...baseOrder, isVerified: false } } };
    const container = page.win.document.createElement("div");
    page.win.document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    await React.act(async () =>
      root.render(
        <PanelProvider analytics={false}>
          <PublicOrderPage orderID="ord_9" accessToken="stale" />
        </PanelProvider>,
      ),
    );
    await settle();
    await settle();
    await settle();
    assert.equal(detailRequests[0].accessToken, "stale");
    assert.equal(detailRequests.at(-1)?.accessToken, "");
    assert.equal(container.querySelector("h1")?.textContent, "Zamówienie c_TEY3");
    assert.ok([...container.querySelectorAll("button")].some((b) => b.textContent === "Potwierdź e-mail"));
  });

  it("ignores orderProjectID whenever the panel has its own projectID", async () => {
    const PublicOrderPage = (await import("./components/PublicOrderPage.tsx")).default;
    const container = page.win.document.createElement("div");
    page.win.document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    await React.act(async () =>
      root.render(
        <PanelProvider analytics={false}>
          <PublicOrderPage variant="panel" orderID="ord_9" orderProjectID="otherShop" />
        </PanelProvider>,
      ),
    );
    await settle();
    await settle();
    assert.equal(detailRequests[0]?.projectId, TEST_KEY);
    assert.equal(historyRequests[0]?.projectId, TEST_KEY);
  });
});

