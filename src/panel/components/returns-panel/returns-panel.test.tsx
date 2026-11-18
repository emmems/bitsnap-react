import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { create, toBinary, type DescMessage, type MessageInitShape } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  ExchangePanelSessionResponseSchema,
  ListMyReturnsResponseSchema,
  ListReturnOrdersResponseSchema,
} from "../../../gen/proto/public/v1/returns_pb";
import { setLocale } from "../../../components/checkout/locale";
import { setPanelConfig } from "../../config.ts";

const page = setupReactPage("https://shop.example.test/panel");

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let PanelProvider: typeof import("../../PanelProvider.tsx").PanelProvider;
let PanelReturns: typeof import("../PanelReturns.tsx").default;
let ReturnsTabs: typeof import("./ReturnsTabs.tsx").ReturnsTabs;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ PanelProvider } = await import("../../PanelProvider.tsx"));
  PanelReturns = (await import("../PanelReturns.tsx")).default;
  ({ ReturnsTabs } = await import("./ReturnsTabs.tsx"));
});

function proto<T extends DescMessage>(schema: T, init: MessageInitShape<T>) {
  return new Response(toBinary(schema, create(schema, init)) as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/proto" },
  });
}

const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;
let returnOrders: MessageInitShape<typeof ListReturnOrdersResponseSchema>["orders"];

beforeEach(() => {
  setLocale("pl");
  setPanelConfig({ projectID: TEST_KEY, host: undefined });
  returnOrders = [];
  globalThis.fetch = (async (input: string | Request) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.endsWith("/ExchangePanelSession")) {
      return proto(ExchangePanelSessionResponseSchema, {
        sessionToken: "returns-session",
        expiresAt: timestampFromDate(new Date(Date.now() + 3600_000)),
      });
    }
    if (url.endsWith("/ListReturnOrders")) {
      return proto(ListReturnOrdersResponseSchema, {
        orders: returnOrders,
        nextPageToken: "",
        total: returnOrders?.length ?? 0,
      });
    }
    if (url.endsWith("/ListMyReturns")) {
      return proto(ListMyReturnsResponseSchema, { returns: [], nextPageToken: "", total: 0 });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  console.error = () => {};
});

afterEach(async () => {
  console.error = originalError;
  setLocale(undefined);
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  page.win.sessionStorage.clear();
});

const settle = (ms = 60) => React.act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function mount(element: React.ReactElement) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => root.render(<PanelProvider analytics={false}>{element}</PanelProvider>));
  for (let i = 0; i < 4; i++) await settle();
  return container;
}

type Params = { state?: string; orderId?: string; returnId?: string; returnsTab?: "mine" };

function Harness({ initial = {}, seen, openOrders }: { initial?: Params; seen: Params[]; openOrders?: () => void }) {
  const [params, setParams] = React.useState<Params>({ state: "returns", ...initial });
  return (
    <PanelReturns
      projectID={TEST_KEY}
      accessToken="panel-token"
      loginURL="/panel/login"
      screen="returns"
      params={params}
      setParams={(next) => {
        seen.push(next);
        setParams((prev) => ({ ...prev, ...next }));
      }}
      setActiveScreen={() => {}}
      openOrders={openOrders}
    />
  );
}

describe("ReturnsTabs", () => {
  it("is a tab list with a roving tabindex and arrow keys", async () => {
    const changes: string[] = [];
    function Tabs() {
      const [value, setValue] = React.useState<"orders" | "mine">("orders");
      return (
        <ReturnsTabs
          value={value}
          onChange={(tab) => {
            changes.push(tab);
            setValue(tab);
          }}
          label="Widok zwrotów"
          idBase="t"
          labels={{ orders: "Do zwrotu", mine: "Moje zwroty" }}
        />
      );
    }
    const container = await mount(<Tabs />);
    const list = container.querySelector("[role=tablist]")!;
    assert.equal(list.getAttribute("aria-label"), "Widok zwrotów");
    const tabs = [...list.querySelectorAll<HTMLButtonElement>("[role=tab]")];
    assert.deepEqual(tabs.map((t) => [t.getAttribute("aria-selected"), t.tabIndex]), [["true", 0], ["false", -1]]);
    assert.equal(tabs[0].getAttribute("aria-controls"), "t-panel-orders");
    await React.act(async () => {
      tabs[0].focus();
      tabs[0].dispatchEvent(new page.win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    assert.deepEqual(changes, ["mine"]);
    assert.equal(page.win.document.activeElement, tabs[1]);
    assert.deepEqual(tabs.map((t) => t.tabIndex), [-1, 0]);
    await React.act(async () => {
      tabs[1].dispatchEvent(new page.win.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    assert.deepEqual(changes, ["mine", "orders"]);
  });
});

describe("panel Returns screen", () => {
  it("shows an honest empty state with a way to the orders", async () => {
    let opened = 0;
    const container = await mount(<Harness seen={[]} openOrders={() => opened++} />);
    assert.equal(container.querySelector("h1")?.textContent, "Zwroty");
    assert.match(container.textContent ?? "", /Nie ma tu jeszcze nic do zwrotu/);
    assert.match(container.textContent ?? "", /Zwrot można zgłosić w terminie i na zasadach ustalonych przez sprzedawcę\./);
    assert.doesNotMatch(container.textContent ?? "", /Brak zamówień, które można zwrócić/);
    const tabpanel = container.querySelector("[role=tabpanel]")!;
    assert.equal(
      page.win.document.getElementById(tabpanel.getAttribute("aria-labelledby")!)?.textContent,
      "Do zwrotu",
    );
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "Zobacz zamówienia")!;
    await React.act(async () => button.click());
    assert.equal(opened, 1);
  });

  it("lists orders with the steps, and opens one", async () => {
    returnOrders = [
      {
        canonicalOrderId: "stripe:order-1234",
        displayReference: "1234",
        gateway: "stripe",
        purchasedAt: timestampFromDate(new Date("2025-11-02T10:00:00Z")),
        totalMinor: 4900n,
        currency: "PLN",
        returnableLineCount: 2,
      },
    ];
    const seen: Params[] = [];
    const container = await mount(<Harness seen={seen} />);
    assert.match(container.textContent ?? "", /Jak to działa/);
    assert.match(container.textContent ?? "", /Zamówienie 1234/);
    assert.match(container.textContent ?? "", /2 produkty do zwrotu/);
    const row = [...container.querySelectorAll("button")].find((b) => /Zamówienie 1234/.test(b.textContent ?? ""))!;
    await React.act(async () => row.click());
    assert.equal(seen.at(-1)?.orderId, "stripe:order-1234");
  });

  it("keeps the \"Moje zwroty\" tab in the URL params", async () => {
    const seen: Params[] = [];
    const container = await mount(<Harness seen={seen} />);
    const mine = [...container.querySelectorAll<HTMLButtonElement>("[role=tab]")][1];
    await React.act(async () => mine.click());
    await settle();
    assert.equal(seen.at(-1)?.returnsTab, "mine");
    assert.match(container.textContent ?? "", /Nie masz jeszcze żadnych zgłoszeń zwrotu/);
    assert.match(container.textContent ?? "", /Gdy zgłosisz zwrot, zobaczysz tu jego status/);

    const reloaded = await mount(<Harness seen={[]} initial={{ returnsTab: "mine" }} />);
    assert.equal(
      [...reloaded.querySelectorAll("[role=tab]")].find((t) => t.getAttribute("aria-selected") === "true")?.textContent,
      "Moje zwroty",
    );
  });
});
