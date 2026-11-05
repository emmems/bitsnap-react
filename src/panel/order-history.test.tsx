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
