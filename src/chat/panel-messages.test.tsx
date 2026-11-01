import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { create, toBinary } from "@bufbuild/protobuf";
import { setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  UserPanelGetProductsResponseSchema,
  UserProductSchema,
  UserProductType,
  type UserProduct,
} from "../gen/proto/public/v1/public_api_pb";

const page = setupReactPage("https://shop.example.test/panel");

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let PanelMessages: typeof import("./PanelMessages.tsx").default;
let chatProjects: typeof import("./PanelMessages.tsx").chatProjects;
let chatProjectIds: typeof import("./PanelMessages.tsx").chatProjectIds;
let hasPanelChat: typeof import("../panel/chat-visibility.ts").hasPanelChat;
let Header: typeof import("../panel/components/PanelProductHeader.tsx").default;
let PanelProvider: typeof import("../panel/PanelProvider.tsx").PanelProvider;
let PanelProductGrid: typeof import("../panel/components/PanelProductGrid.tsx").default;
let setPanelConfig: typeof import("../panel/config.ts").setPanelConfig;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ default: PanelMessages, chatProjects, chatProjectIds } = await import("./PanelMessages.tsx"));
  ({ hasPanelChat } = await import("../panel/chat-visibility.ts"));
  ({ default: Header } = await import("../panel/components/PanelProductHeader.tsx"));
  ({ PanelProvider } = await import("../panel/PanelProvider.tsx"));
  ({ default: PanelProductGrid } = await import("../panel/components/PanelProductGrid.tsx"));
  ({ setPanelConfig } = await import("../panel/config.ts"));
});

const product = (init: Partial<UserProduct>): UserProduct =>
  create(UserProductSchema, { projectId: "18", projectName: "Sklep", ...init });

const chatProduct = product({
  productId: "prodv2_pack",
  productName: "Konsultacja 30 min",
  productType: UserProductType.CHAT,
});
const communityProduct = product({
  productId: "prodv2_club",
  productName: "Klub twórców",
  productType: UserProductType.COMMUNITY,
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Seen = { method: string; url: string; body?: unknown; headers: Record<string, string> };
let seen: Seen[] = [];
let handler: (request: Seen) => Response = () => json(404, { error: "not_found" });
const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;

beforeEach(() => {
  seen = [];
  console.error = () => {};
  globalThis.fetch = (async (input: string | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const request: Seen = {
      method: init.method ?? "GET",
      url,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    };
    seen.push(request);
    return handler(request);
  }) as typeof fetch;
});

afterEach(async () => {
  console.error = originalError;
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
});

const settle = (ms = 30) => React.act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function mount(element: React.ReactElement) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => root.render(element));
  await settle();
  await settle();
  return container;
}

const meAnswer = {
  email: "buyer@example.test",
  threads: [
    {
      id: "t1",
      kind: "pack",
      title: "creator@example.test",
      unread: 2,
      replies_total: 5,
      replies_used: 4,
      replies_left: 1,
      expires_at: "2026-12-01T12:00:00Z",
      composer_locked: false,
      product_id: "prodv2_pack",
      response_hours: 24,
      muted: false,
      last_message: { id: "m1", thread_id: "t1", author_email: "creator@example.test", body: "Do zobaczenia jutro", created_at: "2026-11-01T09:00:00Z" },
    },
  ],
  entitlements: {
    packs: [{ product_id: "prodv2_new", name: "Konsultacja 60 min", replies_left_hint: 3, expires_at: null }],
    channels: [{ product_id: "prodv2_club", channel_id: "c1" }, { product_id: "prodv2_later" }],
  },
  channels: [
    { id: "c1", name: "Klub twórców", topic: "Materiały co tydzień", welcome: "", who_can_post: "creator", product_id: "prodv2_club", role: "member", member_count: 7 },
  ],
};

describe("panel Wiadomości screen", () => {
  it("lists threads, channels and chats ready to start from GET /v1/me", async () => {
    handler = (request) => (request.url === "https://chat.test/v1/me" ? json(200, meAnswer) : json(404, { error: "not_found" }));
    const selected: unknown[] = [];
    const container = await mount(
      <PanelMessages
        accessToken="panel-token"
        products={[chatProduct, communityProduct]}
        chatApiUrl="https://chat.test"
        selection={{}}
        onSelect={(s) => void selected.push(s)}
        locale="pl"
      />,
    );
    const me = seen.find((r) => r.url.endsWith("/v1/me"));
    assert.equal(me?.headers.Authorization, "Bearer panel-token");
    assert.equal(me?.headers["X-Bitsnap-Project"], "18");

    const row = container.querySelector('[data-thread-id="t1"]')!;
    assert.match(row.textContent!, /Konsultacja 30 min/, "named after the panel product");
    assert.match(row.textContent!, /Do zobaczenia jutro/);
    assert.match(row.textContent!, /Została 1 odpowiedź/);
    assert.match(row.textContent!, /Ważny do 1\.12\.2026/);
    assert.match(row.textContent!, /Odpowiedź w ciągu 24 h/);
    assert.equal(row.querySelector('[aria-label="Nieprzeczytane: 2"]')?.textContent, "2");

    assert.match(container.querySelector('[data-channel-id="c1"]')!.textContent!, /Klub twórców/);
    assert.match(container.textContent!, /Do rozpoczęcia/);
    assert.match(container.textContent!, /Konsultacja 60 min/);
    assert.match(container.textContent!, /Twórca jeszcze nie otworzył tego kanału/);

    await React.act(async () => (row as HTMLElement).click());
    assert.deepEqual(selected, [{ chatProject: "18", thread: "t1" }]);
  });

  it("opens a pack thread with POST /v1/threads and selects it", async () => {
    handler = (request) => {
      if (request.url.endsWith("/v1/me")) return json(200, meAnswer);
      if (request.method === "POST" && request.url.endsWith("/v1/threads")) return json(201, { id: "t2", kind: "pack" });
      return json(404, { error: "not_found" });
    };
    const selected: unknown[] = [];
    const container = await mount(
      <PanelMessages accessToken="panel-token" products={[chatProduct]} chatApiUrl="https://chat.test" selection={{}} onSelect={(s) => void selected.push(s)} locale="pl" />,
    );
    const start = [...container.querySelectorAll("button")].find((b) => b.textContent === "Rozpocznij rozmowę")!;
    await React.act(async () => start.click());
    await settle();
    assert.deepEqual(seen.find((r) => r.method === "POST")?.body, { product_id: "prodv2_new" });
    assert.deepEqual(selected, [{ chatProject: "18", thread: "t2" }]);
  });

  it("shows the empty state", async () => {
    handler = () => json(200, { email: "b@x.pl", threads: [], entitlements: { packs: [], channels: [] }, channels: [] });
    const container = await mount(
      <PanelMessages accessToken="t" products={[chatProduct]} selection={{}} onSelect={() => {}} locale="en" />,
    );
    assert.equal(seen[0].url, "https://chat.bitsnap.pl/v1/me", "the default chat URL");
    assert.match(container.querySelector("[data-testid=chat-inbox-empty]")!.textContent!, /No conversations yet/);
  });

  it("shows the error with a retry", async () => {
    handler = () => json(503, { error: "unavailable" });
    const container = await mount(
      <PanelMessages accessToken="t" products={[chatProduct]} selection={{}} onSelect={() => {}} locale="pl" />,
    );
    assert.ok(container.querySelector("[data-testid=chat-inbox-error]"));
    handler = () => json(200, { email: "b@x.pl", threads: [], entitlements: { packs: [], channels: [] }, channels: [] });
    const retry = [...container.querySelectorAll("button")].find((b) => b.textContent === "Spróbuj ponownie")!;
    await React.act(async () => retry.click());
    await settle();
    assert.ok(container.querySelector("[data-testid=chat-inbox-empty]"));
  });

  it("opens the selected thread next to the list", async () => {
    handler = (request) => {
      if (request.url.endsWith("/v1/me")) return json(200, meAnswer);
      if (request.url.includes("/v1/threads/t1/messages")) return json(200, { messages: [], has_more: false });
      return json(503, { error: "unavailable" });
    };
    const container = await mount(
      <PanelMessages accessToken="t" products={[chatProduct]} chatApiUrl="https://chat.test" selection={{ chatProject: "18", thread: "t1" }} onSelect={() => {}} locale="pl" />,
    );
    await settle();
    const conversation = container.querySelector("[data-bitsnap-chat=thread]");
    assert.ok(conversation, "the conversation is shown");
    assert.match(conversation!.textContent!, /Konsultacja 30 min/);
  });
});

describe("panel chat visibility", () => {
  it("needs a CHAT or COMMUNITY product or a chat URL", () => {
    const file = product({ productType: UserProductType.FILE });
    assert.equal(hasPanelChat([file]), false);
    assert.equal(hasPanelChat([file, chatProduct]), true);
    assert.equal(hasPanelChat([communityProduct]), true);
    assert.equal(hasPanelChat([], "https://chat.bitsnap.pl"), true);
  });

  it("asks the projects of the chat products, else the panel project", () => {
    const other = product({ projectId: "21", productType: UserProductType.COMMUNITY });
    assert.deepEqual(chatProjects([chatProduct, other, product({ projectId: "99", productType: UserProductType.FILE })]), ["18", "21"]);
    assert.deepEqual(chatProjects([], "fallback"), ["fallback"]);
  });

  it("maps the public project id to the numeric chat id of the chat products", () => {
    const hashed = product({ projectId: "abc", chatProjectId: "18", productType: UserProductType.CHAT });
    const file = product({ projectId: "def", chatProjectId: "99", productType: UserProductType.FILE });
    const ids = chatProjectIds([hashed, file]);
    assert.equal(ids.get("abc"), "18");
    assert.equal(ids.has("def"), false);
  });

  it("shows Wiadomości in the panel navigation only when asked", async () => {
    setPanelConfig({ projectID: TEST_KEY });
    handler = () => json(404, {});
    const render = (showMessages: boolean) => (
      <PanelProvider analytics={false}>
        <Header activeScreen="products" setActiveScreen={() => {}} setParams={() => {}} styles={{}} logout={() => {}} showMessages={showMessages} />
      </PanelProvider>
    );
    const hidden = await mount(render(false));
    assert.ok(!hidden.textContent!.includes("Wiadomości"));
    const shown = await mount(render(true));
    assert.ok(shown.textContent!.includes("Wiadomości"));
  });

  it("opens Wiadomości from a CHAT product of the library", async () => {
    setPanelConfig({ projectID: TEST_KEY, host: undefined });
    handler = (request) =>
      request.url.endsWith("/UserPanelGetProducts")
        ? new Response(
            toBinary(
              UserPanelGetProductsResponseSchema,
              create(UserPanelGetProductsResponseSchema, {
                result: { case: "success", value: { products: [chatProduct], chatApiUrl: "https://chat.test" } },
              }),
            ) as BodyInit,
            { status: 200, headers: { "Content-Type": "application/proto" } },
          )
        : new Response(null, { status: 404 });
    let opened = 0;
    const container = await mount(
      <PanelProvider analytics={false}>
        <PanelProductGrid
          projectID={TEST_KEY}
          accessToken="panel-token"
          loginURL="/panel/login"
          styles={{}}
          activeScreen="products"
          params={{ state: "products" }}
          setParams={() => {}}
          openCourse={() => {}}
          openMessages={() => void opened++}
        />
      </PanelProvider>,
    );
    await settle(60);
    const card = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Konsultacja 30 min"));
    assert.ok(card, "the CHAT product is listed");
    assert.match(card!.textContent!, /Otwórz wiadomości/);
    await React.act(async () => (card as HTMLElement).click());
    assert.equal(opened, 1);
  });
});
