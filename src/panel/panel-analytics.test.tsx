import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { create, toBinary, type DescMessage, type MessageInitShape } from "@bufbuild/protobuf";
import { getTracker, resetTracker } from "@/src/analytics/core";
import { collector, findPII, setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  GetPublicOrderDetailsResponseSchema,
  UserPanelGetFileDetailsResponseSchema,
  UserPanelLoginResponseSchema,
  UserPanelLoginWithCodeResponseSchema,
  UserProductSchema,
  UserProductType,
} from "../gen/proto/public/v1/public_api_pb";
import { setPanelConfig } from "./config.ts";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let PanelProvider: typeof import("./PanelProvider.tsx").PanelProvider;
let PanelLogin: typeof import("./components/PanelLogin.tsx").PanelLogin;
let PublicOrderPage: typeof import("./components/PublicOrderPage.tsx").default;
let PanelProductDetails: typeof import("./components/PanelProductDetails.tsx").default;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ PanelProvider } = await import("./PanelProvider.tsx"));
  ({ PanelLogin } = await import("./components/PanelLogin.tsx"));
  PublicOrderPage = (await import("./components/PublicOrderPage.tsx")).default;
  PanelProductDetails = (await import("./components/PanelProductDetails.tsx")).default;
});

const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;
const originalWarn = console.warn;

function proto<T extends DescMessage>(schema: T, init: MessageInitShape<T>) {
  return new Response(toBinary(schema, create(schema, init)) as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/proto" },
  });
}

beforeEach(() => {
  resetTracker();
  setPanelConfig({ projectID: TEST_KEY, host: undefined });
  page.win.localStorage.clear();
  page.win.sessionStorage.clear();
  globalThis.fetch = (async (input: string) => {
    const url = String(input);
    if (url.endsWith("/UserPanelLogin")) {
      return proto(UserPanelLoginResponseSchema, { result: { case: "success", value: { retryIn: 30 } } });
    }
    if (url.endsWith("/UserPanelLoginWithCode")) {
      return proto(UserPanelLoginWithCodeResponseSchema, {
        result: { case: "accessToken", value: "panel-token" },
        email: "jane.doe@example.com",
      });
    }
    if (url.endsWith("/GetPublicOrderDetails")) {
      return proto(GetPublicOrderDetailsResponseSchema, {
        result: { case: "order", value: { orderId: "ord-42", status: "paid", currency: "PLN", totalAmount: 2500n } },
      });
    }
    if (url.endsWith("/UserPanelGetFileDetails")) {
      return proto(UserPanelGetFileDetailsResponseSchema, {
        result: { case: "success", value: { projectId: TEST_KEY, files: ["https://files.example.test/a.pdf"] } },
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
  resetTracker();
});

const settle = (ms = 40) => React.act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function mount(element: React.ReactElement) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => root.render(element));
  await settle();
  return container;
}

async function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(page.win.HTMLInputElement.prototype, "value")!.set!;
  await React.act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new page.win.Event("input", { bubbles: true }));
  });
}

const submit = (form: HTMLFormElement) =>
  React.act(async () => void form.dispatchEvent(new page.win.Event("submit", { bubbles: true, cancelable: true })));

describe("panel analytics", () => {
  it("reports a panel login once the code was accepted, without the email address", async () => {
    const seen = collector();
    const container = await mount(
      <PanelProvider analytics={{ onEvent: seen.onEvent }}>
        <PanelLogin />
      </PanelProvider>,
    );
    await type(container.querySelector<HTMLInputElement>('input[type="email"]')!, "jane.doe@example.com");
    await submit(container.querySelector("form")!);
    await settle();
    assert.equal(seen.named("panel_login").length, 0, "the email step is not a login yet");

    await type(container.querySelector<HTMLInputElement>("#verify-code")!, "123456");
    await submit(container.querySelector("form")!);
    await settle();
    const [login] = seen.named("panel_login");
    assert.ok(login, "panel_login was reported");
    assert.deepEqual(login.props, {});
    assert.equal(login.page_type, "panel");
    assert.deepEqual(findPII(seen.events), []);
    assert.ok(!JSON.stringify(seen.events).includes("123456"));
  });

  it("reports an order that was viewed, without the order id from the URL (it may be an access token)", async () => {
    const seen = collector();
    await mount(
      <PanelProvider analytics={{ onEvent: seen.onEvent }}>
        <PublicOrderPage orderID="ord-42" accessToken="panel-token" />
      </PanelProvider>,
    );
    const [viewed] = seen.named("panel_order_viewed");
    assert.ok(viewed, "panel_order_viewed was reported");
    assert.equal(viewed.order_ref, null);
    assert.deepEqual(viewed.props, {});
    assert.equal(seen.named("panel_order_viewed").length, 1);
  });

  it("reports a file download", async () => {
    const seen = collector();
    const product = create(UserProductSchema, {
      accessId: "access-1",
      productId: "prodHash1",
      productType: UserProductType.FILE,
    });
    const container = await mount(
      <PanelProvider analytics={{ onEvent: seen.onEvent }}>
        <PanelProductDetails
          accessToken="panel-token"
          product={product}
          styles={{}}
          reveal={() => {}}
          onOpenCourse={() => {}}
        />
      </PanelProvider>,
    );
    await React.act(async () => (container.querySelector('button[aria-label="Download Product"]') as HTMLElement).click());
    await settle();
    const link = container.querySelector<HTMLAnchorElement>("a[download]")!;
    link.addEventListener("click", (event) => event.preventDefault());
    await React.act(async () => link.click());
    const [download] = seen.named("panel_download");
    assert.ok(download, "panel_download was reported");
    assert.equal(download.product_id, "prodHash1");
    assert.ok(!JSON.stringify(seen.events).includes("a.pdf"), "download URLs are not sent");
  });

  it("sends nothing with analytics={false}", async () => {
    const seen = collector();
    await mount(
      <PanelProvider analytics={false}>
        <PublicOrderPage orderID="ord-42" accessToken="panel-token" analytics={{ onEvent: seen.onEvent }} />
        <PublicOrderPage orderID="ord-43" accessToken="panel-token" analytics={false} />
      </PanelProvider>,
    );
    // The page with its own setting reports; the provider's opt-out only covers what inherits it.
    assert.equal(seen.named("panel_order_viewed").length, 1);

    const inherited = collector();
    await mount(
      <PanelProvider analytics={false}>
        <PublicOrderPage orderID="ord-44" accessToken="panel-token" />
      </PanelProvider>,
    );
    assert.equal(inherited.events.length, 0);
    getTracker()?.flush();
    const wire = await page.events();
    assert.ok(wire.every((e) => e.order_ref !== "ord-43" && e.order_ref !== "ord-44"));
  });
});

process.on("exit", teardownReactPage);
