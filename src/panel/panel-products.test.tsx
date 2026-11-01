import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { create, toBinary, type DescMessage, type MessageInitShape } from "@bufbuild/protobuf";
import { setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  FailureMessage,
  UserPanelGetProductsResponseSchema,
  UserProductType,
} from "../gen/proto/public/v1/public_api_pb";
import {
  GetModelFileDownloadUrlResponseSchema,
  ListModelFilesResponseSchema,
  ModelFileState,
} from "../gen/proto/public/v1/model_delivery_pb";
import { setPanelConfig } from "./config.ts";

const page = setupReactPage("https://shop.example.test/panel");

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let PanelProvider: typeof import("./PanelProvider.tsx").PanelProvider;
let PanelProductGrid: typeof import("./components/PanelProductGrid.tsx").default;
let decidePanelProducts: typeof import("./components/PanelProductGrid.tsx").decidePanelProducts;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ PanelProvider } = await import("./PanelProvider.tsx"));
  const grid = await import("./components/PanelProductGrid.tsx");
  PanelProductGrid = grid.default;
  decidePanelProducts = grid.decidePanelProducts;
});

const SESSION_KEY = `bitsnap-panel-session:${encodeURIComponent("https://bitsnap.pl")}:${encodeURIComponent(TEST_KEY)}`;

function proto<T extends DescMessage>(schema: T, init: MessageInitShape<T>) {
  return new Response(toBinary(schema, create(schema, init)) as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/proto" },
  });
}

type Handler = (url: string) => Response | Promise<Response>;
let products: Handler;
let modelFiles: Handler;
let downloads: Handler;
const requests: string[] = [];
const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;
const originalWarn = console.warn;

const productList = (count: number) =>
  proto(UserPanelGetProductsResponseSchema, {
    result: {
      case: "success",
      value: {
        products: Array.from({ length: count }, (_, index) => ({
          accessId: `acc-${index}`,
          productName: `Ebook ${index}`,
          productType: UserProductType.FILE,
        })),
      },
    },
  });
const purchased = (state: ModelFileState) =>
  proto(ListModelFilesResponseSchema, {
    result: {
      case: "success",
      value: {
        models: [
          {
            orderId: "ord1",
            lineId: "prodv2_x_default",
            productName: "Figurka",
            state,
            files: [{ index: 0, fileName: "figurka.glb", fileSize: 2_000_000n, format: "glb" }],
            licence: { name: "Licencja osobista", url: "https://shop.example.test/licencja" },
            seller: { name: "Sklep", email: "sklep@example.test" },
          },
        ],
      },
    },
  });

beforeEach(() => {
  setPanelConfig({ projectID: TEST_KEY, host: undefined });
  page.win.localStorage.clear();
  page.win.localStorage.setItem(SESSION_KEY, "panel-token");
  requests.length = 0;
  products = () => productList(1);
  modelFiles = () => new Response(null, { status: 404 });
  downloads = () =>
    proto(GetModelFileDownloadUrlResponseSchema, {
      result: { case: "success", value: { url: "https://s3.example.test/signed", fileName: "figurka.glb" } },
    });
  globalThis.fetch = (async (input: string | Request) => {
    const url = typeof input === "string" ? input : input.url;
    requests.push(url);
    if (url.endsWith("/UserPanelGetProducts")) return products(url);
    if (url.endsWith("/ListModelFiles")) return modelFiles(url);
    if (url.endsWith("/GetModelFileDownloadUrl")) return downloads(url);
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  console.error = () => {};
  console.warn = () => {};
});

afterEach(async () => {
  console.error = originalError;
  console.warn = originalWarn;
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
});

const settle = (ms = 60) => React.act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function mountGrid(options: { product?: string; setParams?: (params: import("./types").PanelSearchParamsType) => void; openCourse?: (id: string) => void } = {}) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () =>
    root.render(
      <PanelProvider analytics={false}>
        <PanelProductGrid
          projectID={TEST_KEY}
          accessToken="panel-token"
          loginURL="/panel/login"
          styles={{}}
          activeScreen="products"
          params={{ state: "products", product: options.product }}
          setParams={options.setParams ?? (() => {})}
          openCourse={options.openCourse ?? (() => {})}
        />
      </PanelProvider>,
    ),
  );
  await settle();
  await settle();
  return container;
}

const signedIn = () => page.win.localStorage.getItem(SESSION_KEY) === "panel-token";

describe("panel products screen", () => {
  it("keeps the buyer signed in on an empty list and shows an empty state", async () => {
    products = () => productList(0);
    const container = await mountGrid();
    assert.ok(container.querySelector('[data-testid="panel-empty"]'), container.innerHTML);
    assert.ok(signedIn(), "an empty list must not sign the buyer out");
  });

  it("keeps the buyer signed in when the list fails for another reason", async () => {
    products = () =>
      proto(UserPanelGetProductsResponseSchema, { result: { case: "failure", value: FailureMessage.UNKNOWN } });
    const container = await mountGrid();
    assert.ok(container.querySelector('[data-testid="panel-error"]'));
    assert.ok(signedIn());
  });

  it("signs the buyer out when the session expired", async () => {
    products = () =>
      proto(UserPanelGetProductsResponseSchema, { result: { case: "failure", value: FailureMessage.UNAUTHORIZED } });
    await mountGrid();
    assert.equal(page.win.localStorage.getItem(SESSION_KEY), null);
  });

  it("shows only the 3D files to a buyer without access products", async () => {
    products = () => productList(0);
    modelFiles = () => purchased(ModelFileState.AVAILABLE);
    const container = await mountGrid();
    const section = container.querySelector('[data-testid="model-files"]');
    assert.ok(section, container.innerHTML);
    assert.equal(container.querySelector('[data-testid="panel-empty"]'), null);
    assert.match(section!.textContent ?? "", /Figurka/);
    const licence = section!.querySelector('a[href="https://shop.example.test/licencja"]');
    assert.equal(licence?.textContent, "Licencja osobista");
    assert.ok(signedIn());
    assert.ok(requests.some((url) => url.endsWith("/public.v1.ModelDeliveryService/ListModelFiles")));
  });

  it("asks for a signed URL only when the buyer clicks download", async () => {
    modelFiles = () => purchased(ModelFileState.AVAILABLE);
    const container = await mountGrid();
    assert.ok(container.querySelector('[data-testid="model-files"]'), "files join the product list");
    assert.equal(requests.filter((url) => url.endsWith("/GetModelFileDownloadUrl")).length, 0);
    const assigned: string[] = [];
    const location = page.win.location as unknown as { assign: (url: string) => void };
    const original = location.assign;
    try {
      Object.defineProperty(page.win.location, "assign", { value: (url: string) => assigned.push(url), configurable: true });
    } catch {
      // jsdom locations may refuse redefining; the request count still proves it.
    }
    await React.act(async () => container.querySelector<HTMLButtonElement>("[data-model-download]")!.click());
    await settle();
    assert.equal(requests.filter((url) => url.endsWith("/GetModelFileDownloadUrl")).length, 1);
    if (assigned.length > 0) assert.deepEqual(assigned, ["https://s3.example.test/signed"]);
    void original;
  });

  it("shows the 'seller removed the file' state without a download button", async () => {
    modelFiles = () => purchased(ModelFileState.REMOVED);
    const container = await mountGrid();
    assert.match(container.querySelector("[data-model-removed]")?.textContent ?? "", /Sprzedawca usunął ten plik/);
    assert.equal(container.querySelector("[data-model-download]"), null);
    assert.ok(container.querySelector('a[href="mailto:sklep@example.test"]'));
  });

  it("hides the 3D files section on an older server (404)", async () => {
    const container = await mountGrid();
    assert.equal(container.querySelector('[data-testid="model-files"]'), null);
    assert.match(container.textContent ?? "", /Ebook 0/);
  });
});

describe("decidePanelProducts", () => {
  const files = (count: number) =>
    ({ status: "ready", models: Array.from({ length: count }) }) as never;
  it("signs out only on an expired session", () => {
    assert.equal(decidePanelProducts({ products: { status: "failure", unauthorized: true }, modelFiles: { status: "loading" } }).kind, "signed-out");
    assert.equal(decidePanelProducts({ products: { status: "failure", unauthorized: false }, modelFiles: { status: "hidden" } }).kind, "error");
    assert.equal(decidePanelProducts({ products: { status: "error" }, modelFiles: { status: "unauthorized" } }).kind, "signed-out");
    assert.equal(decidePanelProducts({ products: { status: "ok", count: 0 }, modelFiles: { status: "hidden" } }).kind, "empty");
    assert.equal(decidePanelProducts({ products: { status: "ok", count: 0 }, modelFiles: files(2) }).kind, "list");
    assert.equal(decidePanelProducts({ products: { status: "ok", count: 0 }, modelFiles: { status: "loading" } }).kind, "loading");
    assert.equal(decidePanelProducts({ products: { status: "ok", count: 3 }, modelFiles: { status: "loading" } }).kind, "list");
  });
});

// Navigation and account quick wins share this panel DOM harness.
async function mountPanelView(view: React.ReactNode) {
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { TransportProvider } = await import("@connectrpc/connect-query");
  const { getRpcTransport } = await import("../rpc-provider");
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await React.act(async () => root.render(
    <TransportProvider transport={getRpcTransport("https://bitsnap.pl")}>
      <QueryClientProvider client={client}>{view}</QueryClientProvider>
    </TransportProvider>,
  ));
  await settle();
  return container;
}

describe("panel navigation and orders quick wins", () => {
  it("renders four shared navigation items with lucide icons and an active page", async () => {
    const Header = (await import("./components/PanelProductHeader")).default;
    const selected: string[] = [];
    const container = await mountPanelView(<Header activeScreen="orders" setActiveScreen={screen => selected.push(screen)} setParams={() => {}} styles={{}} logout={() => {}} />);
    const nav = container.querySelector("nav")!;
    const buttons = Array.from(nav.querySelectorAll("button"));
    assert.deepEqual(buttons.map(button => button.textContent), ["Biblioteka", "Zamówienia", "Zwroty", "Konto"]);
    assert.equal(nav.querySelectorAll("svg.lucide").length, 4);
    assert.equal(nav.querySelector("img"), null);
    assert.equal(nav.querySelector('[aria-current="page"]')?.textContent, "Zamówienia");
    await React.act(async () => buttons[0].click());
    assert.deepEqual(selected, ["products"]);
  });

  it("formats order currency in pl-PL and shows translated status and end hint", async () => {
    const { setLocale } = await import("../components/checkout/locale");
    setLocale("pl-PL");
    const { GetOrdersResponseSchema } = await import("../gen/proto/public/v1/public_api_pb");
    globalThis.fetch = (async () => proto(GetOrdersResponseSchema, { orders: [{ id: "ord1", totalAmount: 4900, currency: "pln", status: "paid" }], totalCount: 1 })) as typeof fetch;
    const Orders = (await import("./components/PanelOrderHistory")).default;
    const container = await mountPanelView(<Orders projectID={TEST_KEY} accessToken="token" openOrderDetails={() => {}} />);
    assert.match(container.textContent ?? "", /49,00\s*zł/);
    assert.match(container.textContent ?? "", /Opłacone/);
    assert.match(container.textContent ?? "", /To już wszystkie Twoje zamówienia/);
  });

  it("shows an order failure and retries successfully instead of claiming there are no orders", async () => {
    const { GetOrdersResponseSchema } = await import("../gen/proto/public/v1/public_api_pb");
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts++;
      return attempts === 1 ? new Response(null, { status: 503 }) : proto(GetOrdersResponseSchema, { orders: [], totalCount: 0 });
    }) as typeof fetch;
    const Orders = (await import("./components/PanelOrderHistory")).default;
    const container = await mountPanelView(<Orders projectID={TEST_KEY} accessToken="token" openOrderDetails={() => {}} />);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Nie udało się pobrać zamówień/);
    assert.doesNotMatch(container.textContent ?? "", /Brak zamówień/);
    await React.act(async () => container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    await settle();
    assert.equal(attempts, 2);
    assert.match(container.textContent ?? "", /Brak zamówień/);
  });

  it("renders plans and notifications as unavailable without loading or unsaved controls", async () => {
    const Plans = (await import("./components/PanelPlans")).default;
    const Notifications = (await import("./components/PanelNotifications")).default;
    const container = await mountPanelView(<><Plans projectID={TEST_KEY} /><Notifications /></>);
    assert.doesNotMatch(container.textContent ?? "", /Ładowanie/);
    assert.match(container.textContent ?? "", /Plany nie są obecnie dostępne/);
    assert.equal(container.querySelector('[role="switch"]'), null);
  });
});

describe("library cards and product links", () => {
  it("uses a native focusable card button with product alt text and stable ID navigation", async () => {
    const selected: Array<import("./types").PanelSearchParamsType> = [];
    const container = await mountGrid({ setParams: params => selected.push(params) });
    const card = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("Ebook 0"))!;
    assert.ok(card);
    assert.equal(card.type, "button");
    assert.equal(card.tabIndex, 0);
    card.focus();
    assert.equal(page.win.document.activeElement, card);
    assert.match(card.className, /focus-visible:outline/);
    assert.equal(card.querySelector("button, a"), null);
    assert.equal(card.querySelector("img")?.alt, "Ebook 0");
    assert.match(card.textContent ?? "", /Pliki.*Pobierz pliki/);
    assert.match(card.parentElement!.className, /grid-cols-2/);
    // Native buttons supply Enter/Space activation in browsers; jsdom click invokes that same handler.
    await React.act(async () => card.click());
    assert.equal(selected[0].product, "acc-0");
  });

  it("accepts old protobuf JSON links and rejects malformed or unowned products", async () => {
    const { resolvePanelProduct } = await import("./components/PanelProductGrid");
    const { UserProductSchema } = await import("../gen/proto/public/v1/public_api_pb");
    const { toJsonString } = await import("@bufbuild/protobuf");
    const product = create(UserProductSchema, { accessId: "owned", productId: "prod", productName: "Book" });
    assert.equal(resolvePanelProduct("owned", [product]), product);
    assert.equal(resolvePanelProduct("prod", [product]), product);
    assert.equal(resolvePanelProduct(toJsonString(UserProductSchema, product), [product]), product);
    assert.equal(resolvePanelProduct("{invalid", [product]), undefined);
    assert.equal(resolvePanelProduct('{"accessId":"other"}', [product]), undefined);
  });

  it("labels each type and opens courses directly", async () => {
    products = () => proto(UserPanelGetProductsResponseSchema, { result: { case: "success", value: { products: [
      { accessId: "audio", productName: "Book", productType: UserProductType.AUDIO },
      { accessId: "course", productName: "Lessons", productType: UserProductType.COURSE },
      { accessId: "ticket", productName: "Event", productType: UserProductType.TICKET },
    ] } } });
    const opened: string[] = [];
    const container = await mountGrid({ openCourse: id => opened.push(id) });
    assert.match(container.textContent ?? "", /Audio.*Słuchaj/);
    assert.match(container.textContent ?? "", /Kurs.*Otwórz kurs/);
    assert.match(container.textContent ?? "", /Bilet.*Pokaż bilet/);
    const course = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("Lessons"))!;
    await React.act(async () => course.click());
    assert.deepEqual(opened, ["course"]);
  });

  it("derives filenames from URL paths without query credentials", async () => {
    const { downloadFileName } = await import("./components/PanelProductDetails");
    assert.equal(downloadFileName("https://files.test/My%20book.pdf?signature=private"), "My book.pdf");
  });
});
