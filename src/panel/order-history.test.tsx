import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { create, fromBinary, toBinary, type MessageInitShape } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  FailureMessage,
  GetOrderHistoryRequestSchema,
  GetOrderHistoryResponseSchema,
} from "../gen/proto/public/v1/public_api_pb";
import { setLocale } from "../components/checkout/locale";
import { setPanelConfig } from "./config.ts";
import {
  formatRelativeTime,
  orderHistoryLine,
  type OrderHistoryEntryInput,
} from "./order-history/lines.ts";

const page = setupReactPage("https://shop.example.test/panel");

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let PanelProvider: typeof import("./PanelProvider.tsx").PanelProvider;
let OrderHistory: typeof import("./order-history/OrderHistory.tsx").OrderHistory;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ PanelProvider } = await import("./PanelProvider.tsx"));
  ({ OrderHistory } = await import("./order-history/OrderHistory.tsx"));
});

const SESSION_KEY = `bitsnap-panel-session:${encodeURIComponent("https://bitsnap.pl")}:${encodeURIComponent(TEST_KEY)}`;

const line = (kind: string, params: Record<string, string> = {}, linkUrl = "", locale = "pl-PL") =>
  orderHistoryLine({ kind, params, linkUrl } satisfies OrderHistoryEntryInput, locale);

describe("order history sentences", () => {
  const cases: Array<[string, Record<string, string>, string, string]> = [
    ["order.paid", { provider: "stripe" }, "Zamówienie opłacone przez Stripe", "Order paid with Stripe"],
    ["order.status_changed", { from: "paid", to: "sent" }, "Zamówienie wysłane", "Order shipped"],
    ["order.tracking_set", { number: "PL123", carrier: "InPost" }, "Numer przesyłki: PL123 (InPost)", "Tracking number: PL123 (InPost)"],
    ["email.sent", { template: "access", email: "jan@example.test" }, "Wysłano e-mail z dostępem na jan@example.test", "Access e-mail sent to jan@example.test"],
    ["access.granted", { product: "Kurs React" }, "Przyznano dostęp: Kurs React", "Access granted: Kurs React"],
    ["invoice.issued", { number: "FV/1/2026", provider: "fakturownia" }, "Wystawiono fakturę FV/1/2026", "Invoice FV/1/2026 issued"],
    ["refund.succeeded", { amount: "12.50 PLN" }, "Zwrócono 12,50 zł", "Refunded PLN 12.50"],
    ["return.requested", {}, "Zgłoszono zwrot", "Return requested"],
    ["return.status_changed", { from: "submitted", to: "approved" }, "Status zwrotu: Zaakceptowany", "Return status: Approved"],
  ];
  for (const [kind, params, pl, en] of cases) {
    it(`${kind} in Polish and English`, () => {
      assert.equal(line(kind, params)?.text.replace(/ /g, " "), pl);
      assert.equal(line(kind, params, "", "en-US")?.text.replace(/ /g, " "), en);
    });
  }

  it("leaves out the brackets when the carrier is empty", () => {
    assert.equal(line("order.tracking_set", { number: "PL123", carrier: "" })?.text, "Numer przesyłki: PL123");
    assert.equal(line("order.tracking_set", { number: "PL123", carrier: " " }, "", "en")?.text, "Tracking number: PL123");
    assert.equal(line("order.tracking_set", { number: "", carrier: "DPD" }), null);
  });

  it("skips unknown kinds", () => {
    assert.equal(line("order.teleported", { to: "moon" }), null);
    assert.equal(line("note.internal", { text: "secret" }), null);
    assert.equal(line("", {}), null);
  });

  it("never shows raw keys, undefined or empty values", () => {
    const bare: Array<[string, Record<string, string>, string]> = [
      ["order.paid", {}, "Zamówienie opłacone"],
      ["order.paid", { provider: "someNewGateway" }, "Zamówienie opłacone"],
      ["order.status_changed", { from: "paid", to: "teleported" }, "Zmieniono status zamówienia"],
      ["order.status_changed", { from: "unpaid", to: "paid" }, "Status zamówienia: Opłacone"],
      ["email.sent", { template: "access" }, "Wysłano e-mail z dostępem"],
      ["email.sent", { template: "receipt", email: "a@b.c" }, "Wysłano e-mail na a@b.c"],
      ["access.granted", {}, "Przyznano dostęp"],
      ["invoice.issued", {}, "Wystawiono fakturę"],
      ["refund.succeeded", {}, "Zwrócono pieniądze"],
      ["refund.succeeded", { amount: "about 5" }, "Zwrócono about 5"],
      ["return.status_changed", { to: "shipped_to_mars" }, "Zmieniono status zwrotu"],
    ];
    for (const [kind, params, expected] of bare) {
      const text = line(kind, params)?.text ?? "";
      assert.equal(text, expected, `${kind} ${JSON.stringify(params)}`);
      assert.doesNotMatch(text, /undefined|\{|\}|\(\s*\)|\.\w+_/);
    }
  });

  it("links only an https invoice", () => {
    assert.deepEqual(line("invoice.issued", { number: "F1" }, "https://inv.example.test/f1.pdf")?.link, {
      url: "https://inv.example.test/f1.pdf",
      label: "Pobierz fakturę",
    });
    assert.equal(line("invoice.issued", { number: "F1" }, "javascript:alert(1)")?.link, undefined);
    assert.equal(line("invoice.issued", { number: "F1" }, "http://inv.example.test/f1.pdf")?.link, undefined);
  });

  it("formats relative dates", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    assert.equal(formatRelativeTime(new Date("2026-11-02T12:00:00Z"), "en-US", now), "3 days ago");
    assert.equal(formatRelativeTime(new Date("2026-11-05T11:00:00Z"), "pl-PL", now), "1 godzinę temu");
    assert.equal(formatRelativeTime(new Date("2026-11-05T11:59:50Z"), "en-US", now), "now");
  });
});

type HistoryInit = MessageInitShape<typeof GetOrderHistoryResponseSchema>;
let history: (pageToken: string) => HistoryInit | Response;
const historyRequests: Array<{ pageToken: string; orderId: string; accessToken: string }> = [];
const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;

const entry = (id: string, kind: string, params: Record<string, string>, linkUrl = "") => ({
  id,
  kind,
  params,
  linkUrl,
  summaryKey: `lines.${kind}`,
  occurredAt: timestampFromDate(new Date(Date.now() - 2 * 86400_000)),
});

beforeEach(() => {
  setLocale("pl");
  setPanelConfig({ projectID: TEST_KEY, host: undefined });
  page.win.localStorage.setItem(SESSION_KEY, "panel-token");
  historyRequests.length = 0;
  history = () => ({ result: { case: "success", value: { entries: [], nextPageToken: "" } } });
  globalThis.fetch = (async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.endsWith("/public_api.v1.PublicApiService/GetOrderHistory")) {
      return new Response(null, { status: 404 });
    }
    const body = new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer());
    const req = fromBinary(GetOrderHistoryRequestSchema, body);
    historyRequests.push({ pageToken: req.pageToken, orderId: req.orderId, accessToken: req.accessToken });
    const answer = history(req.pageToken);
    if (answer instanceof Response) return answer;
    return new Response(toBinary(GetOrderHistoryResponseSchema, create(GetOrderHistoryResponseSchema, answer)) as BodyInit, {
      status: 200,
      headers: { "Content-Type": "application/proto" },
    });
  }) as typeof fetch;
  console.error = () => {};
});

afterEach(async () => {
  console.error = originalError;
  setLocale(undefined);
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  page.win.localStorage.clear();
});

const settle = (ms = 60) => React.act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function mount(orderId = "ord_1") {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () =>
    root.render(
      <PanelProvider analytics={false}>
        <OrderHistory orderId={orderId} />
      </PanelProvider>,
    ),
  );
  await settle();
  await settle();
  return container;
}

describe("order history block", () => {
  it("lists the entries newest first with <time> and skips unknown kinds", async () => {
    history = () => ({
      result: {
        case: "success",
        value: {
          entries: [
            entry("e3", "invoice.issued", { number: "FV/7" }, "https://inv.example.test/fv7.pdf"),
            entry("e2", "future.kind", { x: "1" }),
            entry("e1", "order.paid", { provider: "payu" }),
          ],
          nextPageToken: "",
        },
      },
    });
    const container = await mount();
    assert.deepEqual(historyRequests[0], { pageToken: "", orderId: "ord_1", accessToken: "panel-token" });
    const section = container.querySelector("section[data-bitsnap-order-history]");
    assert.ok(section, container.innerHTML);
    assert.equal(section!.querySelector("h3")?.textContent, "Historia zamówienia");
    const items = [...section!.querySelectorAll("ol > li")];
    assert.equal(items.length, 2);
    assert.match(items[0].textContent ?? "", /Wystawiono fakturę FV\/7/);
    assert.equal(items[0].querySelector("a")?.getAttribute("href"), "https://inv.example.test/fv7.pdf");
    assert.match(items[1].textContent ?? "", /Zamówienie opłacone przez PayU/);
    const time = items[1].querySelector("time");
    assert.ok(time?.getAttribute("datetime"));
    assert.ok(time?.getAttribute("title"));
    assert.equal(time?.textContent, "przedwczoraj");
    assert.doesNotMatch(section!.textContent ?? "", /future|undefined/);
    assert.equal(section!.querySelector("button"), null, "no next page, no button");
  });

  it("loads the next page with \"Pokaż więcej\"", async () => {
    history = (token) =>
      token === ""
        ? {
            result: {
              case: "success",
              value: { entries: [entry("e3", "return.requested", {})], nextPageToken: "tok-2" },
            },
          }
        : {
            result: {
              case: "success",
              value: { entries: [entry("e1", "access.granted", { product: "Ebook" })], nextPageToken: "" },
            },
          };
    const container = await mount();
    const button = container.querySelector<HTMLButtonElement>("section button");
    assert.equal(button?.textContent, "Pokaż więcej");
    assert.equal(container.querySelectorAll("li").length, 1);
    await React.act(async () => button!.click());
    await settle();
    assert.deepEqual(historyRequests.map((r) => r.pageToken), ["", "tok-2"]);
    const items = [...container.querySelectorAll("li")].map((li) => li.textContent ?? "");
    assert.equal(items.length, 2);
    assert.match(items[1], /Przyznano dostęp: Ebook/);
    assert.equal(container.querySelector("section button"), null);
  });

  it("renders nothing for an order with no history", async () => {
    const container = await mount();
    assert.equal(historyRequests.length, 1);
    assert.equal(container.innerHTML, '<div class="bitsnap-react"></div>');
  });

  it("renders nothing on a failure answer", async () => {
    history = () => ({ result: { case: "failure", value: FailureMessage.ORDER_NOT_FOUND } });
    const container = await mount();
    assert.equal(container.innerHTML, '<div class="bitsnap-react"></div>');
  });

  it("renders nothing when an older server does not know the method", async () => {
    history = () =>
      new Response(JSON.stringify({ code: "unimplemented", message: "not implemented" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    const container = await mount();
    assert.equal(historyRequests.length, 1, "no retries");
    assert.equal(container.innerHTML, '<div class="bitsnap-react"></div>');
  });

  it("does not ask without a panel session", async () => {
    page.win.localStorage.clear();
    const container = await mount();
    assert.equal(historyRequests.length, 0);
    assert.equal(container.innerHTML, '<div class="bitsnap-react"></div>');
  });
});

describe("order list helpers", () => {
  let format: typeof import("./components/orders/format.ts");
  before(async () => {
    format = await import("./components/orders/format.ts");
  });

  it("shortens an order id like the server's getPublicOrderID", () => {
    assert.equal(format.shortOrderRef("c_7Hq3Zk9WmX"), "c_9WmX");
    assert.equal(format.shortOrderRef("c_TEY3"), "c_TEY3");
    assert.equal(format.shortOrderRef("ORDER12345"), "2345");
    assert.equal(format.shortOrderRef(" "), "");
  });

  it("uses Polish plural forms", () => {
    const forms = { one: "{count} zamówienie", few: "{count} zamówienia", many: "{count} zamówień" };
    assert.equal(format.pluralText("pl", 1, forms), "1 zamówienie");
    assert.equal(format.pluralText("pl", 3, forms), "3 zamówienia");
    assert.equal(format.pluralText("pl", 5, forms), "5 zamówień");
    assert.equal(format.pluralText("pl", 22, forms), "22 zamówienia");
  });

  it("groups consecutive orders by month and capitalises the month", () => {
    const dates = ["2026-11-14", "2026-11-02", "2026-09-01", undefined].map((d) => (d ? new Date(`${d}T12:00:00Z`) : undefined));
    const groups = format.groupByMonth(dates, (d) => d);
    assert.deepEqual(groups.map((g) => g.items.length), [2, 1, 1]);
    assert.equal(format.formatMonth(new Date("2024-03-02T12:00:00Z"), "pl-PL"), "Marzec 2024");
  });

  it("detects differing checkout names", () => {
    assert.equal(format.namesDiffer(["Jan", " Jan ", ""]), false);
    assert.equal(format.namesDiffer(["Jan", "Ola"]), true);
  });
});

describe("order list (option A)", () => {
  let Orders: typeof import("./components/PanelOrderHistory.tsx").default;
  let GetOrdersResponseSchema: typeof import("../gen/proto/public/v1/public_api_pb").GetOrdersResponseSchema;
  let GetOrdersRequestSchema: typeof import("../gen/proto/public/v1/public_api_pb").GetOrdersRequestSchema;
  before(async () => {
    Orders = (await import("./components/PanelOrderHistory.tsx")).default;
    ({ GetOrdersResponseSchema, GetOrdersRequestSchema } = await import("../gen/proto/public/v1/public_api_pb"));
  });

  type OrderInit = { id: string; status: string; totalAmount: number; currency: string; customerName: string; createdAt: ReturnType<typeof timestampFromDate> };
  const order = (id: string, date: string, name = "Piotr Michalik", status = "paid"): OrderInit => ({
    id,
    status,
    totalAmount: 8326,
    currency: "pln",
    customerName: name,
    createdAt: timestampFromDate(new Date(`${date}T10:00:00Z`)),
  });

  let pages: OrderInit[][];
  let offsets: number[];
  beforeEach(() => {
    offsets = [];
    globalThis.fetch = (async (_input: string | Request, init?: RequestInit) => {
      const req = fromBinary(GetOrdersRequestSchema, new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer()));
      offsets.push(req.offset);
      const all = pages.flat();
      const index = pages.findIndex((_, i) => pages.slice(0, i).flat().length === req.offset);
      const orders = index === -1 ? [] : pages[index];
      return new Response(toBinary(GetOrdersResponseSchema, create(GetOrdersResponseSchema, { orders, totalCount: all.length })) as BodyInit, {
        status: 200,
        headers: { "Content-Type": "application/proto" },
      });
    }) as typeof fetch;
  });

  async function mountOrders(opened: string[] = [], openLibrary?: () => void) {
    const container = page.win.document.createElement("div");
    page.win.document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    await React.act(async () =>
      root.render(
        <PanelProvider analytics={false}>
          <Orders projectID={TEST_KEY} accessToken="token" openOrderDetails={(id) => opened.push(id)} openLibrary={openLibrary} />
        </PanelProvider>,
      ),
    );
    await settle();
    await settle();
    return container;
  }

  it("groups by month, shows the short number, and keeps old orders static", async () => {
    pages = [[order("c_7Hq3Zk9WmX", "2025-11-02"), order("", "2024-03-02", "Piotr Krzesaj"), order("", "2024-03-02")]];
    const opened: string[] = [];
    const container = await mountOrders(opened);
    assert.equal(container.querySelector("h1")?.textContent, "Zamówienia");
    assert.match(container.textContent ?? "", /3 zamówienia/);
    assert.deepEqual([...container.querySelectorAll("h2")].map((h) => h.textContent), ["Listopad 2025", "Marzec 2024"]);

    const buttons = container.querySelectorAll<HTMLButtonElement>("[data-order-row=open]");
    assert.equal(buttons.length, 1);
    assert.match(buttons[0].textContent ?? "", /#c_9WmX/);
    await React.act(async () => buttons[0].click());
    assert.deepEqual(opened, ["c_7Hq3Zk9WmX"]);

    const legacy = [...container.querySelectorAll<HTMLElement>("[data-order-row=legacy]")];
    assert.equal(legacy.length, 2);
    for (const row of legacy) {
      assert.equal(row.tagName, "LI");
      assert.equal(row.querySelector("button"), null);
      const note = page.win.document.getElementById(row.getAttribute("aria-describedby")!);
      assert.equal(note?.textContent, "Szczegóły niedostępne dla starszych zamówień");
      assert.match(page.win.document.getElementById(row.getAttribute("aria-labelledby")!)?.textContent ?? "", /Zamówienie z 2 mar 2024/);
    }
    // Names differ between orders: each row says for whom.
    assert.match(container.textContent ?? "", /Dla: Piotr Krzesaj/);
    assert.equal(container.querySelectorAll("[data-status-variant=ok]").length, 3);
    assert.doesNotMatch(container.textContent ?? "", /To już wszystkie/);
  });

  it("hides the checkout name when every order has the same one", async () => {
    pages = [[order("c_AAAA1111", "2025-11-02"), order("c_BBBB2222", "2025-10-02")]];
    const container = await mountOrders();
    assert.doesNotMatch(container.textContent ?? "", /Dla:/);
  });

  it("loads more with \"Pokaż więcej\", keeps the loaded rows and announces the result", async () => {
    pages = [
      Array.from({ length: 20 }, (_, i) => order(`c_X${String(i).padStart(7, "0")}`, "2025-11-02")),
      [order("c_LAST0001", "2025-01-02")],
    ];
    const container = await mountOrders();
    const more = [...container.querySelectorAll("button")].find((b) => b.textContent === "Pokaż więcej");
    assert.ok(more);
    await React.act(async () => more!.click());
    await settle();
    await settle();
    assert.deepEqual(offsets, [0, 20]);
    assert.equal(container.querySelectorAll("[data-order-row=open]").length, 21);
    assert.equal([...container.querySelectorAll("button")].some((b) => b.textContent === "Pokaż więcej"), false);
    assert.match(container.querySelector("[aria-live=polite]")?.textContent ?? "", /Wczytano kolejne zamówienia: 1/);
    assert.match(container.textContent ?? "", /To już wszystkie Twoje zamówienia/);
  });

  it("shows a real empty state with a way to the library", async () => {
    pages = [[]];
    let library = 0;
    const container = await mountOrders([], () => library++);
    assert.match(container.textContent ?? "", /Nie masz jeszcze zamówień/);
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "Przejdź do biblioteki");
    await React.act(async () => button!.click());
    assert.equal(library, 1);
  });
});
