import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { create, fromBinary, toBinary, type DescMessage, type MessageInitShape } from "@bufbuild/protobuf";
import { setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  FailureMessage,
  UserPanelGetProductsRequestSchema,
  UserPanelGetProductsResponseSchema,
  UserProductSchema,
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
let productsOfShop: typeof import("./components/PanelProductGrid.tsx").productsOfShop;
let allPurchasesURL: typeof import("./components/PanelProductGrid.tsx").allPurchasesURL;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ PanelProvider } = await import("./PanelProvider.tsx"));
  const grid = await import("./components/PanelProductGrid.tsx");
  PanelProductGrid = grid.default;
  decidePanelProducts = grid.decidePanelProducts;
  productsOfShop = grid.productsOfShop;
  allPurchasesURL = grid.allPurchasesURL;
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
/** Extra RPC answers by method name (`UserPanelGetTicketDetails`, ...). */
let rpc: Record<string, Handler> = {};
let modelFiles: Handler;
let downloads: Handler;
const requests: string[] = [];
const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;
const originalWarn = console.warn;

const productList = (count: number, projectId?: string) =>
  proto(UserPanelGetProductsResponseSchema, {
    result: {
      case: "success",
      value: {
        products: Array.from({ length: count }, (_, index) => ({
          ...(projectId != null ? { projectId } : {}),
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
  rpc = {};
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
    const method = url.split("/").pop() ?? "";
    if (rpc[method]) return rpc[method](url);
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

async function mountGrid(options: {
  projectID?: string;
  product?: string;
  shop?: string;
  setParams?: (
    params: import("./types").PanelSearchParamsType,
    setOptions?: import("./hooks/useUrlSearchParams").SetUrlSearchParamsOptions,
  ) => void;
  openCourse?: (id: string) => void;
} = {}) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () =>
    root.render(
      <PanelProvider analytics={false}>
        <PanelProductGrid
          projectID={options.projectID ?? TEST_KEY}
          accessToken="panel-token"
          loginURL="/panel/login"
          activeScreen="products"
          params={{ state: "products", product: options.product, shop: options.shop }}
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

// The server answers with the buyer's purchases from every shop; a shop's
// panel lists its own, and its empty state points to the all-shops panel.
describe("shop scope of the products screen", () => {
  const link = (container: HTMLElement) =>
    container.querySelector<HTMLAnchorElement>("[data-all-purchases-link]");
  const button = (container: HTMLElement) =>
    container.querySelector<HTMLAnchorElement>("[data-all-purchases-button]");

  it("keeps only this shop's products and the ones without a shop id", () => {
    const list = [
      { projectId: TEST_KEY, accessId: "mine" },
      { projectId: "other-shop", accessId: "theirs" },
      { projectId: "", accessId: "unknown" },
    ] as never[];
    const ids = (shop: string) =>
      productsOfShop(list, shop).map((p: { accessId: string }) => p.accessId);
    assert.deepEqual(ids(TEST_KEY), ["mine", "unknown"]);
    assert.deepEqual(ids(""), ["mine", "theirs", "unknown"]);
  });

  it("links bitsnap.pl's panel, or a local dev server's, never a seller's own API host", () => {
    assert.equal(allPurchasesURL(undefined), "https://bitsnap.pl/panel");
    assert.equal(allPurchasesURL(""), "https://bitsnap.pl/panel");
    assert.equal(allPurchasesURL("https://bitsnap.pl/"), "https://bitsnap.pl/panel");
    assert.equal(allPurchasesURL("http://localhost:4321"), "http://localhost:4321/panel");
    // The README's API name and a seller's own domain serve no panel page.
    assert.equal(allPurchasesURL("https://api.bitsnap.pl"), "https://bitsnap.pl/panel");
    assert.equal(allPurchasesURL("https://sklep.example.test"), "https://bitsnap.pl/panel");
    assert.equal(allPurchasesURL("not a url"), "https://bitsnap.pl/panel");
  });

  it("shows the empty state with a link and a button when everything is from another shop", async () => {
    products = () => productList(2, "other-shop");
    const container = await mountGrid();
    assert.ok(container.querySelector('[data-testid="panel-empty"]'), container.innerHTML);
    assert.equal(link(container)?.getAttribute("href"), "https://bitsnap.pl/panel");
    assert.equal(link(container)?.textContent, "bitsnap.pl/panel");
    assert.equal(button(container)?.getAttribute("href"), "https://bitsnap.pl/panel");
    assert.equal(button(container)?.tagName, "A");
    assert.ok(!container.textContent?.includes("Ebook 0"), "another shop's product must not be listed");
    assert.ok(signedIn(), "an empty shop must not sign the buyer out");
  });

  it("lists this shop's products next to another shop's", async () => {
    products = () =>
      proto(UserPanelGetProductsResponseSchema, {
        result: {
          case: "success",
          value: {
            products: [
              { projectId: TEST_KEY, accessId: "a", productName: "Mine", productType: UserProductType.FILE },
              { projectId: "other-shop", accessId: "b", productName: "Theirs", productType: UserProductType.FILE },
            ],
          },
        },
      });
    const container = await mountGrid();
    assert.ok(container.textContent?.includes("Mine"), container.innerHTML);
    assert.ok(!container.textContent?.includes("Theirs"));
    assert.equal(link(container), null);
  });

  it("shows the empty state, not an error, to a buyer with no purchases anywhere", async () => {
    // The server answers PRDUCTS_NOT_FOUND, not an empty list, in that case.
    products = () =>
      proto(UserPanelGetProductsResponseSchema, { result: { case: "failure", value: FailureMessage.PRDUCTS_NOT_FOUND } });
    const container = await mountGrid();
    assert.ok(container.querySelector('[data-testid="panel-empty"]'), container.innerHTML);
    assert.equal(container.querySelector('[data-testid="panel-error"]'), null);
    assert.equal(button(container)?.getAttribute("href"), "https://bitsnap.pl/panel");
    assert.ok(signedIn());
  });

  it("names the e-mail the panel looked for", async () => {
    page.win.localStorage.setItem(
      `bitsnap-panel-email:${encodeURIComponent("https://bitsnap.pl")}:${encodeURIComponent(TEST_KEY)}`,
      "ann@example.com",
    );
    products = () => productList(0);
    const container = await mountGrid();
    assert.match(container.textContent ?? "", /ann@example\.com/);
  });

  it("still lists this shop's 3D files when every access product is another shop's", async () => {
    products = () => productList(2, "other-shop");
    modelFiles = () => purchased(ModelFileState.AVAILABLE);
    const container = await mountGrid();
    assert.ok(container.querySelector('[data-testid="model-files"]'), container.innerHTML);
    assert.equal(container.querySelector('[data-testid="panel-empty"]'), null);
    assert.ok(!container.textContent?.includes("Ebook 0"));
  });

  it("opens the grid, not the details, for a link to another shop's product", async () => {
    products = () => productList(1, "other-shop");
    const container = await mountGrid({ product: "acc-0" });
    assert.ok(container.querySelector('[data-testid="panel-empty"]'), container.innerHTML);
    assert.ok(!container.textContent?.includes("Ebook 0"));
  });

  it("shows no link on the all-shops panel itself", async () => {
    products = () => productList(0);
    const container = await mountGrid({ projectID: "" });
    assert.ok(container.querySelector('[data-testid="panel-empty"]'), container.innerHTML);
    assert.equal(link(container), null);
    assert.equal(button(container), null);
    assert.ok(!container.textContent?.includes("w tym sklepie"));
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
    const container = await mountPanelView(<Header activeScreen="orders" setActiveScreen={screen => selected.push(screen)} setParams={() => {}} logout={() => {}} />);
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
    // One page: the end hint shows only after "Pokaż więcej" reaches the end.
    assert.doesNotMatch(container.textContent ?? "", /To już wszystkie Twoje zamówienia/);
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
    assert.doesNotMatch(container.textContent ?? "", /Nie masz jeszcze zamówień/);
    await React.act(async () => container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    await settle();
    assert.equal(attempts, 2);
    assert.match(container.textContent ?? "", /Nie masz jeszcze zamówień/);
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
    assert.equal(selected[0].product, "file-acc-0");
  });

  it("shows the description in a card as plain text, no <p> or links inside the button (R7)", async () => {
    products = () => proto(UserPanelGetProductsResponseSchema, { result: { case: "success", value: { products: [
      { accessId: "d1", productName: "Opisany", productType: UserProductType.FILE, productDescription: '<p>Zobacz <a href="https://a.test">stronę</a></p><p>Drugi</p>' },
    ] } } });
    const container = await mountGrid();
    const card = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Opisany"))!;
    assert.equal(card.querySelector("p, a, div"), null);
    assert.match(card.textContent ?? "", /Zobacz stronę/);
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

  it("keeps an audiobook and a course with the same access id apart", async () => {
    const { resolvePanelProduct, panelProductKey } = await import("./components/PanelProductGrid");
    const { UserProductSchema } = await import("../gen/proto/public/v1/public_api_pb");
    const course = create(UserProductSchema, { accessId: "bv", productId: "c", productName: "Lessons", productType: UserProductType.COURSE });
    const audio = create(UserProductSchema, { accessId: "bv", productId: "a", productName: "Book", productType: UserProductType.AUDIO });
    assert.equal(panelProductKey(audio), "audio-bv");
    assert.equal(panelProductKey(course), "course-bv");
    assert.equal(resolvePanelProduct(panelProductKey(audio), [course, audio]), audio);
    assert.equal(resolvePanelProduct(panelProductKey(course), [audio, course]), course);
  });

  it("opens the audiobook, not a course sharing its access id", async () => {
    products = () => proto(UserPanelGetProductsResponseSchema, { result: { case: "success", value: { products: [
      { accessId: "bv", productName: "Lessons", productType: UserProductType.COURSE },
      { accessId: "bv", productName: "Book", productType: UserProductType.AUDIO },
    ] } } });
    const opened: string[] = [];
    const container = await mountGrid({ openCourse: id => opened.push(id) });
    const audio = Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("Book"))!;
    await React.act(async () => audio.click());
    assert.deepEqual(opened, []);
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

describe("product detail pages (option A)", () => {
  const library = (items: Array<Record<string, unknown>>) => () =>
    proto(UserPanelGetProductsResponseSchema, { result: { case: "success", value: { products: items as never } } });

  async function files(urls: string[] | "error", productName = "Skarb Kibica 2025 Ebook") {
    const { UserPanelGetFileDetailsResponseSchema } = await import("../gen/proto/public/v1/public_api_pb");
    products = library([{ accessId: "f1", productId: "p1", productName, productImageUrl: "https://img.test/cover.png", productType: UserProductType.FILE, productDescription: "" }]);
    rpc.UserPanelGetFileDetails = () =>
      urls === "error"
        ? new Response(null, { status: 503 })
        : proto(UserPanelGetFileDetailsResponseSchema, { result: { case: "success", value: { projectId: "x", files: urls } } });
    return mountGrid({ product: "file-f1" });
  }

  it("shows one file under the product name with a format badge and a brand download", async () => {
    const container = await files(["https://files.test/skarb/f1-medium-compression.pdf?sig=1"]);
    const shell = container.querySelector("[data-product-shell]")!;
    assert.ok(shell, container.innerHTML);
    assert.equal(container.querySelector("main"), null, "no second <main> landmark");
    assert.equal(shell.querySelectorAll("h2").length, 1, "one title");
    assert.equal(shell.querySelector("img")?.getAttribute("alt"), "");
    const download = container.querySelector<HTMLAnchorElement>("a[download]")!;
    assert.equal(download.textContent, "Pobierz PDF");
    assert.match(download.className, /bg-\(--panel-accent-now\)/);
    assert.match(container.textContent ?? "", /Kupione/);
    assert.match(container.textContent ?? "", /f1-medium-compression\.pdf/);
    assert.ok([...container.querySelectorAll("a")].some((a) => a.textContent === "Otwórz"));
    // No description: no "O produkcie" block and no empty grey bar.
    assert.doesNotMatch(container.textContent ?? "", /O produkcie/);
  });

  it("shows a file error with help text and retries", async () => {
    const container = await files("error");
    const alert = container.querySelector('[role="alert"]')!;
    assert.match(alert.textContent ?? "", /Nie udało się wczytać plików.*napisz do sprzedawcy/);
    const { UserPanelGetFileDetailsResponseSchema } = await import("../gen/proto/public/v1/public_api_pb");
    rpc.UserPanelGetFileDetails = () =>
      proto(UserPanelGetFileDetailsResponseSchema, { result: { case: "success", value: { projectId: "x", files: [] } } });
    await React.act(async () => alert.querySelector("button")!.click());
    await settle();
    assert.match(container.textContent ?? "", /Do tego produktu nie dodano jeszcze plików/);
  });

  it("names several files by file name and marks collisions", async () => {
    const { fileRows, fileFormat } = await import("./components/products/files/naming");
    const rows = fileRows(
      ["https://f.test/a/book.pdf", "https://f.test/b/book.pdf", "https://f.test/c/", "https://f.test/maps.zip"],
      "Book",
      "Plik",
    );
    assert.deepEqual(rows.map((row) => row.title), ["book.pdf (1)", "book.pdf (2)", "Plik 3", "maps.zip"]);
    assert.deepEqual(rows.map((row) => row.format), ["PDF", "PDF", undefined, "ZIP"]);
    assert.equal(fileFormat("https://f.test/download.php?id=1"), undefined);
    assert.equal(fileRows(["https://f.test/x.epub"], "", "Plik")[0].title, "x.epub");
  });

  async function ticket(result: Record<string, unknown> | "error", options: { description?: string } = {}) {
    const { UserPanelGetTicketDetailsResponseSchema } = await import("../gen/proto/public/v1/public_api_pb");
    products = library([{ accessId: "t1", productId: "pt", productName: "GROOVEOUT", productType: UserProductType.TICKET, productDescription: options.description ?? "" }]);
    rpc.UserPanelGetTicketDetails = () =>
      result === "error"
        ? new Response(null, { status: 503 })
        : proto(UserPanelGetTicketDetailsResponseSchema, { result: result as never });
    return mountGrid({ product: "ticket-t1" });
  }
  const QR = "data:image/png;base64,iVBORw0KGgo=";

  it("calls the ticket RPC and shows the QR on a white tile with wallet links", async () => {
    const container = await ticket(
      { case: "success", value: { projectId: "x", ticketUrl: QR, productName: "GROOVEOUT", productImageUrl: "", appleWalletUrl: "https://wallet.test/a.pkpass", googleWalletUrl: "javascript:alert(1)" } },
      { description: "Start 22:30" },
    );
    assert.ok(requests.some((url) => url.endsWith("/UserPanelGetTicketDetails")));
    const qr = container.querySelector<HTMLImageElement>("[data-ticket-pass] img")!;
    assert.equal(qr.alt, "Kod QR biletu: GROOVEOUT");
    assert.match(qr.parentElement!.className, /bg-white/);
    const links = [...container.querySelectorAll<HTMLAnchorElement>("[data-ticket-pass] a")];
    const apple = links.find((link) => link.textContent === "Dodaj do Apple Wallet")!;
    assert.equal(apple.href, "https://wallet.test/a.pkpass");
    assert.equal(apple.rel, "noopener noreferrer");
    assert.equal(links.find((link) => link.textContent === "Dodaj do Google Wallet"), undefined, "non-https wallet link hidden");
    assert.ok(links.find((link) => link.textContent === "Zapisz bilet"));
    assert.match(container.textContent ?? "", /Informacje od organizatora/);
    assert.doesNotMatch(container.textContent ?? "", /Twój zakupiony bilet/);
  });

  it("explains a ticket that is not on this account", async () => {
    const container = await ticket({ case: "failure", value: FailureMessage.TICKET_NOT_FOUND });
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Nie znaleźliśmy tego biletu.*ten sam e-mail/);
  });

  it("keeps the last QR code when the connection is gone", async () => {
    const { writeCachedQr, clearQrCache } = await import("./components/products/ticket/qr-cache");
    clearQrCache();
    writeCachedQr("t1", QR);
    const nav = globalThis.navigator as Navigator & { onLine?: boolean };
    const own = Object.getOwnPropertyDescriptor(nav, "onLine");
    Object.defineProperty(nav, "onLine", { configurable: true, get: () => false });
    let container: HTMLElement;
    try {
      container = await ticket("error");
    } finally {
      if (own) Object.defineProperty(nav, "onLine", own);
      else delete nav.onLine;
    }
    assert.match(container.textContent ?? "", /Brak połączenia – pokazujemy zapisany kod/);
    assert.equal(container.querySelector<HTMLImageElement>("[data-ticket-pass] img")?.getAttribute("src"), QR);
    clearQrCache();
    page.win.sessionStorage.clear();
  });

  it("says 'saved code' without blaming the connection while the browser is online (R4)", async () => {
    const { writeCachedQr, clearQrCache } = await import("./components/products/ticket/qr-cache");
    clearQrCache();
    writeCachedQr("t1", QR);
    const container = await ticket("error");
    assert.match(container.textContent ?? "", /Nie udało się odświeżyć biletu – pokazujemy zapisany kod/);
    assert.doesNotMatch(container.textContent ?? "", /Brak połączenia/);
    const save = [...container.querySelectorAll<HTMLAnchorElement>("[data-ticket-pass] a")].find((a) => a.textContent === "Zapisz bilet")!;
    assert.equal(save.getAttribute("href"), QR, "saved data: QR is a valid download");
    clearQrCache();
  });

  it("clears every saved QR code and stub from memory and sessionStorage (logout)", async () => {
    const { writeCachedQr, readCachedQr, clearQrCache } = await import("./components/products/ticket/qr-cache");
    writeCachedQr("t1", QR);
    writeCachedQr("t2", QR);
    writeCachedQr("t1:stub", QR);
    page.win.sessionStorage.setItem("other-key", "keep");
    clearQrCache();
    assert.equal(readCachedQr("t1"), undefined);
    assert.equal(readCachedQr("t2"), undefined);
    assert.equal(readCachedQr("t1:stub"), undefined, "stub entries go too");
    assert.equal(page.win.sessionStorage.getItem("bitsnap-panel-ticket-qr:t1"), null);
    assert.equal(page.win.sessionStorage.getItem("bitsnap-panel-ticket-qr:t1:stub"), null);
    assert.equal(page.win.sessionStorage.getItem("other-key"), "keep");
    page.win.sessionStorage.clear();
  });

  it("shows the QR from its URL when saving it offline fails (no CORS) (R2, R3)", async () => {
    const { clearQrCache, readCachedQr } = await import("./components/products/ticket/qr-cache");
    clearQrCache();
    page.win.sessionStorage.clear();
    const url = "https://qr.example.test/api/qr-gen?token=t1";
    let qrFetches = 0;
    rpc["qr-gen?token=t1"] = () => {
      qrFetches++;
      throw new TypeError("Failed to fetch");
    };
    const container = await ticket({ case: "success", value: { projectId: "x", ticketUrl: url, productName: "GROOVEOUT", productImageUrl: "" } });
    const qr = container.querySelector<HTMLImageElement>("[data-ticket-pass] img")!;
    assert.equal(qr.getAttribute("src"), url);
    // The image loads before any effect could reset its state.
    await React.act(async () => void qr.dispatchEvent(new page.win.Event("load")));
    await settle();
    assert.equal(qrFetches, 1);
    assert.equal(readCachedQr("t1"), undefined, "nothing saved");
    assert.equal(container.querySelector('[role="alert"]'), null, "no error UI");
    assert.equal(container.querySelector('[data-ticket-pass] [role="status"]'), null, "no skeleton over the QR");
    assert.doesNotMatch(qr.className, /opacity-0/);
    const save = [...container.querySelectorAll<HTMLAnchorElement>("[data-ticket-pass] a")].find((a) => a.textContent === "Zapisz bilet")!;
    assert.equal(save.getAttribute("href"), `${url}&layout=stub`, "older server: stub from the tile URL");
    assert.equal(save.getAttribute("download"), "grooveout-bilet.png");
    assert.ok(requests.includes(`${url}&layout=stub`), "stub fetched best-effort after the tile");
    assert.equal(readCachedQr("t1:stub"), undefined, "no stub saved without CORS");
  });

  it("shows the event date as the stub's heading, and no date line when it is unset", async () => {
    const { clearQrCache } = await import("./components/products/ticket/qr-cache");
    clearQrCache();
    const withDate = await ticket({
      case: "success",
      value: { projectId: "x", ticketUrl: QR, productName: "GROOVEOUT", productImageUrl: "", eventStartDate: BigInt(Date.UTC(2026, 11, 12, 18, 0) / 1000) },
    });
    const date = withDate.querySelector("[data-ticket-pass] h3 time[data-ticket-date]");
    assert.equal(date?.textContent, "12 grudnia 2026, 19:00");
    assert.equal(date?.getAttribute("datetime"), "2026-12-12T18:00:00.000Z");
    assert.ok(withDate.querySelector("[data-ticket-perforation][aria-hidden='true']"), "decorative tear line");
    assert.equal(withDate.querySelector("[data-ticket-pass]")?.getAttribute("aria-label"), "Twój bilet");
    assert.doesNotMatch(withDate.querySelector("[data-ticket-pass]")?.textContent ?? "", /Twój bilet/, "no eyebrow");
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    page.win.document.body.innerHTML = "";

    const noDate = await ticket({ case: "success", value: { projectId: "x", ticketUrl: QR, productName: "GROOVEOUT", productImageUrl: "" } });
    assert.ok(noDate.querySelector("[data-ticket-pass] img"));
    assert.equal(noDate.querySelector("[data-ticket-pass] time"), null);
    assert.equal(noDate.querySelector("[data-ticket-pass] h3"), null);
    assert.equal(noDate.querySelector("[data-ticket-perforation]"), null);
  });

  it("saves the stub from ticketStubUrl and keeps it for offline use", async () => {
    const { clearQrCache, readCachedQr, writeCachedQr } = await import("./components/products/ticket/qr-cache");
    clearQrCache();
    page.win.sessionStorage.clear();
    const tile = "https://qr.example.test/api/qr-gen?token=t1";
    const stub = "https://qr.example.test/api/qr-gen?token=t1&layout=stub&v=2";
    const container = await ticket({ case: "success", value: { projectId: "x", ticketUrl: tile, ticketStubUrl: stub, productName: "GROOVEOUT", productImageUrl: "" } });
    const save = () => [...container.querySelectorAll<HTMLAnchorElement>("[data-ticket-pass] a")].find((a) => a.textContent === "Zapisz bilet")!;
    assert.equal(save().getAttribute("href"), stub);
    const qr = container.querySelector<HTMLImageElement>("[data-ticket-pass] img")!;
    await React.act(async () => void qr.dispatchEvent(new page.win.Event("load")));
    await settle();
    assert.ok(requests.includes(stub), "stub fetched after the tile loads");

    // A stub saved earlier (data: URL) wins over the live URL, even offline.
    const STUB = "data:image/png;base64,c3R1Yg==";
    writeCachedQr("t1", QR);
    writeCachedQr("t1:stub", STUB);
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    page.win.document.body.innerHTML = "";
    const offline = await ticket("error");
    assert.equal(offline.querySelector<HTMLImageElement>("[data-ticket-pass] img")?.getAttribute("src"), QR);
    const offlineSave = [...offline.querySelectorAll<HTMLAnchorElement>("[data-ticket-pass] a")].find((a) => a.textContent === "Zapisz bilet")!;
    assert.equal(offlineSave.getAttribute("href"), STUB);
    assert.equal(page.win.sessionStorage.getItem("bitsnap-panel-ticket-qr:t1:stub"), STUB);
    clearQrCache();
    assert.equal(readCachedQr("t1:stub"), undefined);
    page.win.sessionStorage.clear();
  });

  it("keeps a stub that arrives late out of the next ticket", async () => {
    const { clearQrCache, readCachedQr } = await import("./components/products/ticket/qr-cache");
    const { TicketPass } = await import("./components/products/ticket/TicketPass");
    const { getProductTexts } = await import("./components/products/texts");
    const { UserPanelGetTicketDetailsResponseSchema } = await import("../gen/proto/public/v1/public_api_pb");
    clearQrCache();
    page.win.sessionStorage.clear();
    const tile = "https://qr.example.test/api/qr-gen?token=t";
    const stub = "https://qr.example.test/api/qr-gen?token=t&layout=stub";
    rpc.UserPanelGetTicketDetails = () =>
      proto(UserPanelGetTicketDetailsResponseSchema, {
        result: { case: "success", value: { projectId: "x", ticketUrl: tile, ticketStubUrl: stub, productName: "GROOVEOUT", productImageUrl: "" } },
      });
    // The first ticket's stub answers only after the buyer opened the second.
    let answerStub!: () => void;
    rpc["qr-gen?token=t&layout=stub"] = () =>
      new Promise<Response>((resolve) => {
        answerStub = () => resolve(new Response(new Blob(["x"], { type: "image/jpeg" })));
      });
    const OLD = "data:image/jpeg;base64,b2xk";
    const OriginalReader = globalThis.FileReader;
    globalThis.FileReader = class {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.result = OLD;
        this.onload?.();
      }
    } as unknown as typeof FileReader;
    try {
      const container = page.win.document.createElement("div");
      page.win.document.body.appendChild(container);
      const root = createRoot(container);
      roots.push(root);
      // Same instance for both tickets (no key), the worst case.
      const render = (accessId: string) =>
        React.act(async () =>
          root.render(
            <PanelProvider analytics={false}>
              <TicketPass accessId={accessId} accessToken="panel-token" productName="GROOVEOUT" texts={getProductTexts("pl-PL")} onSave={() => {}} />
            </PanelProvider>,
          ),
        );
      await render("t1");
      await settle();
      const qr = container.querySelector<HTMLImageElement>("[data-ticket-pass] img")!;
      await React.act(async () => void qr.dispatchEvent(new page.win.Event("load")));
      await settle();
      await render("t2");
      await settle();
      answerStub();
      await settle();
      assert.equal(readCachedQr("t1:stub"), OLD, "cached under its own ticket");
      assert.equal(readCachedQr("t2:stub"), undefined);
      const save = [...container.querySelectorAll<HTMLAnchorElement>("[data-ticket-pass] a")].find((a) => a.textContent === "Zapisz bilet")!;
      assert.equal(save.getAttribute("href"), stub, "the second ticket saves its own stub");
    } finally {
      globalThis.FileReader = OriginalReader;
      clearQrCache();
      page.win.sessionStorage.clear();
    }
  });

  it("names the saved file after the cached image type", async () => {
    const { clearQrCache, writeCachedQr } = await import("./components/products/ticket/qr-cache");
    clearQrCache();
    writeCachedQr("t1", QR);
    writeCachedQr("t1:stub", "data:image/webp;base64,c3R1Yg==");
    const container = await ticket("error");
    const save = [...container.querySelectorAll<HTMLAnchorElement>("[data-ticket-pass] a")].find((a) => a.textContent === "Zapisz bilet")!;
    assert.equal(save.getAttribute("download"), "grooveout-bilet.webp");
    clearQrCache();
    page.win.sessionStorage.clear();
  });

  it("drops non-https QR and file links (R5)", async () => {
    const { safeQrHref } = await import("./components/products/ticket/qr-cache");
    assert.equal(safeQrHref(QR), QR);
    assert.equal(safeQrHref("https://qr.test/a"), "https://qr.test/a");
    assert.equal(safeQrHref("javascript:alert(1)"), undefined);
    assert.equal(safeQrHref("data:text/html,<script>alert(1)</script>"), undefined);
    assert.equal(safeQrHref("data:image/svg+xml;base64,PHN2Zz4="), undefined);
    const container = await files(["javascript:alert(1)", "https://files.test/a/book.pdf", "https://files.test/a/book.pdf"]);
    const hrefs = [...container.querySelectorAll<HTMLAnchorElement>("a[download]")].map((a) => a.getAttribute("href"));
    assert.deepEqual(hrefs, ["https://files.test/a/book.pdf", "https://files.test/a/book.pdf"], "duplicate URLs both render (R6)");
  });

  it("shows a load error with retry when the ticket call fails and nothing is saved", async () => {
    const { clearQrCache } = await import("./components/products/ticket/qr-cache");
    clearQrCache();
    page.win.sessionStorage.clear();
    const container = await ticket("error");
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Nie udało się wczytać biletu/);
  });

  it("accepts wallet links only over https", async () => {
    const { safeWalletUrl } = await import("./components/products/ticket/qr-cache");
    assert.equal(safeWalletUrl("https://pay.google.com/gp/v/save/x"), "https://pay.google.com/gp/v/save/x");
    assert.equal(safeWalletUrl("http://wallet.test/a"), undefined);
    assert.equal(safeWalletUrl("javascript:alert(1)"), undefined);
    assert.equal(safeWalletUrl("not a url"), undefined);
    assert.equal(safeWalletUrl(undefined), undefined);
  });

  it("counts audiobook chapters that have no URL (A3)", async () => {
    const { mergeChapters } = await import("./components/products/audiobook/AudiobookDetails");
    const merged = mergeChapters(
      { chapters: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }] as never },
      [
        { chapterId: "a", publicUrl: "https://s.test/a.m3u8", duration: 10 },
        { chapterId: "c", publicUrl: "https://s.test/c.m3u8" },
      ] as never,
    );
    assert.deepEqual(merged.chapters.map((chapter) => chapter.id), ["a", "c"]);
    assert.deepEqual(merged.missing, ["b"]);
  });

  it("shows an audiobook load error with retry instead of 'pick a chapter' (A2)", async () => {
    products = library([{ accessId: "a1", productId: "pa", productName: "Book", productType: UserProductType.AUDIO, productDescription: "" }]);
    rpc.UserPanelGetAudiobookDetails = () => new Response(null, { status: 503 });
    rpc.UserPanelGetAudiobookDetailsDownloadURLs = () => new Response(null, { status: 503 });
    const container = await mountGrid({ product: "audio-a1" });
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Nie udało się wczytać audiobooka/);
    assert.doesNotMatch(container.textContent ?? "", /Wybierz rozdział/);
  });
});

describe("global library shop pills and shared products query (C7, C7a)", () => {
  const twoShopProducts = () =>
    proto(UserPanelGetProductsResponseSchema, {
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
              productName: "Kurs Beta",
              productType: UserProductType.COURSE,
            },
          ],
        },
      },
    });

  it("shows ShopPills on the global panel with 2+ shops, filters without refetching, and replaces history on click", async () => {
    products = twoShopProducts;
    const calls: Array<{ params: import("./types").PanelSearchParamsType; options?: { replace?: boolean } }> = [];
    const unfiltered = await mountGrid({
      projectID: "",
      setParams: (params, options) => calls.push({ params, options }),
    });
    assert.equal(unfiltered.querySelector("[data-shop-pills-count]")?.textContent, "2 produkty");
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    page.win.document.body.innerHTML = "";
    requests.length = 0;

    const container = await mountGrid({
      projectID: "",
      shop: "shopA",
      setParams: (params, options) => calls.push({ params, options }),
    });
    const group = container.querySelector('[role="group"][aria-label="Filtr sklepu"]');
    assert.ok(group, "shop pills shown on global panel");
    assert.equal(container.querySelector("[data-shop-pills-count]")?.textContent, "1 produkt");
    assert.ok(container.textContent?.includes("Ebook Alfa"));
    assert.ok(!container.textContent?.includes("Kurs Beta"));
    assert.equal(requests.filter((u) => u.endsWith("/UserPanelGetProducts")).length, 1);

    const betaPill = [...group!.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent?.includes("Sklep Beta"),
    )!;
    await React.act(async () => betaPill.click());
    assert.equal(calls[0]?.params.shop, "shopB");
    assert.equal(calls[0]?.params.state, "products");
    assert.equal(calls[0]?.options?.replace, true);
  });

  it("writes activeScreen instead of stale params.state when clicking a shop pill", async () => {
    const { ProductsComponent } = await import("./components/PanelProductGrid.tsx");
    const calls: Array<{ params: import("./types").PanelSearchParamsType; options?: { replace?: boolean } }> = [];
    const container = await mountPanelView(
      <ProductsComponent
        projectID=""
        accessToken="panel-token"
        products={[
          create(UserProductSchema, {
            projectId: "shopA",
            projectName: "Sklep Alfa",
            accessId: "a1",
            productName: "Ebook Alfa",
            productType: UserProductType.FILE,
          }),
          create(UserProductSchema, {
            projectId: "shopB",
            projectName: "Sklep Beta",
            accessId: "b1",
            productName: "Kurs Beta",
            productType: UserProductType.COURSE,
          }),
        ]}
        activeScreen="products"
        params={{ state: "returns" }}
        setParams={(params, options) => calls.push({ params, options })}
        openCourse={() => {}}
      />,
    );
    const alfaPill = [...container.querySelectorAll<HTMLButtonElement>('[role="group"] button')].find((b) =>
      b.textContent?.includes("Sklep Alfa"),
    )!;
    await React.act(async () => alfaPill.click());
    assert.deepEqual(calls, [{ params: { state: "products", shop: "shopA" }, options: { replace: true } }]);
  });

  it("formats productsCount plural forms in pl and en", async () => {
    const { getProductTexts } = await import("./components/products/texts");
    const pl = getProductTexts("pl");
    assert.equal(pl.productsCount(0), "0 produktów");
    assert.equal(pl.productsCount(1), "1 produkt");
    assert.equal(pl.productsCount(2), "2 produkty");
    assert.equal(pl.productsCount(5), "5 produktów");
    assert.equal(pl.productsCount(12), "12 produktów");
    assert.equal(pl.productsCount(22), "22 produkty");

    const en = getProductTexts("en");
    assert.equal(en.productsCount(0), "0 products");
    assert.equal(en.productsCount(1), "1 product");
    assert.equal(en.productsCount(2), "2 products");
  });

  it("never renders ShopPills on a shop panel", async () => {
    products = twoShopProducts;
    const container = await mountGrid({ projectID: "shopA", shop: "shopA" });
    assert.equal(container.querySelector("[data-shop-pills]"), null);
    assert.ok(container.textContent?.includes("Ebook Alfa"));
    assert.ok(!container.textContent?.includes("Kurs Beta"));
  });

  it("resolves deep-linked products and courses from the unfiltered list even while filtered to another shop", async () => {
    products = twoShopProducts;
    const openedCourses: string[] = [];
    await mountGrid({
      projectID: "",
      shop: "shopA",
      product: "course-b1",
      openCourse: (id) => openedCourses.push(id),
    });
    assert.deepEqual(openedCourses, ["b1"]);
  });

  it("renders a compact filter empty state with 'Pokaż wszystkie' instead of PanelProductsEmpty", async () => {
    const { ProductsComponent } = await import("./components/PanelProductGrid.tsx");
    const cleared: Array<{ shop?: string; replace?: boolean }> = [];
    const container = await mountPanelView(
      <ProductsComponent
        projectID=""
        accessToken="panel-token"
        products={[
          create(UserProductSchema, {
            projectId: "shopA",
            projectName: "Sklep Alfa",
            accessId: "a1",
            productName: "Ebook Alfa",
            productType: UserProductType.FILE,
          }),
        ]}
        shops={[
          { projectId: "shopA", name: "Sklep Alfa", count: 1 },
          { projectId: "shopEmpty", name: "Sklep Pusty", count: 0 },
        ]}
        activeScreen="products"
        params={{ state: "products", shop: "shopEmpty" }}
        setParams={(next, opts) => cleared.push({ shop: next.shop, replace: opts?.replace })}
        openCourse={() => {}}
      />,
    );
    assert.equal(container.querySelector('[data-testid="panel-empty"]'), null);
    assert.match(container.textContent ?? "", /Brak produktów w tym sklepie/);
    const showAll = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Pokaż wszystkie",
    )!;
    assert.ok(showAll);
    await React.act(async () => showAll.click());
    assert.deepEqual(cleared, [{ shop: undefined, replace: true }]);
  });

  it("PanelProductGrid and usePanelChat share one query key and send identical projectId", async () => {
    const { usePanelChat } = await import("./chat-visibility.ts");
    const seenProjectIds: string[] = [];
    globalThis.fetch = (async (input: string | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/UserPanelGetProducts")) {
        const req = fromBinary(
          UserPanelGetProductsRequestSchema,
          new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer()),
        );
        seenProjectIds.push(req.projectId);
        return twoShopProducts();
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;

    function BothCallers({ projectID }: { projectID: string }) {
      usePanelChat("panel-token", projectID);
      return (
        <PanelProductGrid
          projectID={projectID}
          accessToken="panel-token"
          loginURL="/panel/login"
          activeScreen="products"
          params={{ state: "products" }}
          setParams={() => {}}
          openCourse={() => {}}
        />
      );
    }

    await mountPanelView(<BothCallers projectID="shopA" />);
    assert.deepEqual(seenProjectIds, ["shopA"], "single fetch shared by both callers");

    seenProjectIds.length = 0;
    await mountPanelView(<BothCallers projectID="" />);
    assert.deepEqual(seenProjectIds, [""], "single fetch shared by both callers on global panel");
  });
});
