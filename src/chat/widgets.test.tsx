import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { setupReactPage } from "@/src/analytics/react-testing";

const page = setupReactPage("https://shop.example.test/chat");

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let widgets: typeof import("./widgets.tsx");
let createChatClient: typeof import("./client.ts").createChatClient;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  widgets = await import("./widgets.tsx");
  ({ createChatClient } = await import("./client.ts"));
});

type Request = { method: string; path: string; body?: unknown; headers: Record<string, string> };
type Route = (request: Request) => Response | undefined;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const BUYER = "buyer@example.test";
const CREATOR = "creator@example.test";

const msg = (id: string, author: string, body: string, extra: Record<string, unknown> = {}) => ({
  id,
  thread_id: "t1",
  author_email: author,
  body,
  created_at: `2026-11-01T10:0${id.length % 10}:00Z`,
  pinned: false,
  ...extra,
});

const packThread = (extra: Record<string, unknown> = {}) => ({
  id: "t1",
  kind: "pack",
  title: CREATOR,
  unread: 0,
  replies_total: 5,
  replies_used: 2,
  replies_left: 3,
  expires_at: "2026-12-01T12:00:00Z",
  composer_locked: false,
  product_id: "prodv2_pack",
  response_hours: 48,
  muted: false,
  ...extra,
});

const me = (extra: Record<string, unknown> = {}) => ({
  email: BUYER,
  threads: [packThread()],
  entitlements: { packs: [], channels: [] },
  channels: [],
  ...extra,
});

let routes: Route[] = [];
let requests: Request[] = [];
const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;

function client() {
  return createChatClient({
    projectId: "18",
    token: "panel-token",
    baseUrl: "https://chat.test",
    fetch: (async (url: string, init: RequestInit = {}) => {
      const request: Request = {
        method: init.method ?? "GET",
        path: url.replace("https://chat.test", ""),
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
        headers: init.headers as Record<string, string>,
      };
      requests.push(request);
      for (const route of routes) {
        const response = route(request);
        if (response) return response;
      }
      if (request.path === "/v1/realtime/token") return json(503, { error: "unavailable" });
      if (request.path.endsWith("/receipts")) return json(200, { ignored: false });
      return json(404, { error: "not_found" });
    }) as unknown as typeof fetch,
  });
}

const on = (method: string, path: string | RegExp, respond: (request: Request) => Response): Route =>
  (request) =>
    request.method === method &&
    (typeof path === "string" ? request.path === path : path.test(request.path))
      ? respond(request)
      : undefined;

beforeEach(() => {
  routes = [];
  requests = [];
  console.error = () => {};
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

async function click(element: Element | null | undefined) {
  assert.ok(element, "element to click");
  await React.act(async () => (element as HTMLElement).click());
  await settle();
}

function byText(container: Element, selector: string, text: string) {
  return [...container.querySelectorAll(selector)].find((el) => el.textContent?.trim() === text);
}

async function type(container: Element, text: string) {
  const area = container.querySelector("textarea")!;
  const setter = Object.getOwnPropertyDescriptor(page.win.HTMLTextAreaElement.prototype, "value")!.set!;
  await React.act(async () => {
    setter.call(area, text);
    area.dispatchEvent(new page.win.Event("input", { bubbles: true }));
  });
}

const thread = (props: Partial<import("./widgets.tsx").ChatThreadProps> = {}) => (
  <widgets.ChatThread projectID="tstProj123" client={client()} productId="prodv2_pack" locale="pl" pollIntervalMs={60_000} {...props} />
);

describe("ChatThread", () => {
  it("shows the history, the pack state and the creator's promise", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me())),
      on("GET", /^\/v1\/threads\/t1\/messages/, () =>
        json(200, { messages: [msg("m2", CREATOR, "Dzień dobry"), msg("m1", BUYER, "Mam pytanie")], has_more: false }),
      ),
    );
    const container = await mount(thread({ title: "Konsultacja" }));
    assert.match(container.textContent!, /Konsultacja/);
    assert.match(container.textContent!, /Zostały 3 odpowiedzi/);
    assert.match(container.textContent!, /Odpowiedź w ciągu 48 h/);
    assert.match(container.textContent!, /Dzień dobry/);
    assert.equal(container.querySelector("[data-testid=chat-lock]"), null);
    assert.ok(requests.some((r) => r.path === "/v1/threads/t1/receipts"), "the creator's message is marked read");
    assert.ok(!requests.some((r) => r.path === "/v1/threads"), "an existing thread is not opened again");
  });

  it("opens the thread of a pack the buyer has not used yet and shows the empty state", async () => {
    routes.push(
      on("GET", "/v1/me", () =>
        json(200, me({ threads: [], entitlements: { packs: [{ product_id: "prodv2_pack", name: "Konsultacja", replies_left_hint: 5 }], channels: [] } })),
      ),
      on("POST", "/v1/threads", () => json(201, packThread({ replies_left: 5 }))),
      on("GET", /^\/v1\/threads\/t1\/messages/, () => json(200, { messages: [], has_more: false })),
    );
    const container = await mount(thread());
    const open = requests.find((r) => r.method === "POST" && r.path === "/v1/threads");
    assert.deepEqual(open?.body, { product_id: "prodv2_pack" });
    assert.ok(container.querySelector("[data-testid=chat-empty]"));
    assert.match(container.textContent!, /Napisz pierwszą wiadomość/);
    assert.match(container.textContent!, /przechowuje je przez 90 dni/);
  });

  it("shows the lock with Kup pakiet when no replies are left, and keeps the composer", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me({ threads: [packThread({ replies_left: 0, replies_used: 5 })] }))),
      on("GET", /^\/v1\/threads\/t1\/messages/, () => json(200, { messages: [msg("m1", BUYER, "Hej")], has_more: false })),
    );
    const bought: unknown[] = [];
    const container = await mount(thread({ onBuy: (request) => void bought.push(request) }));
    const lock = container.querySelector("[data-testid=chat-lock]");
    assert.equal(lock?.getAttribute("data-lock"), "replies");
    assert.match(lock!.textContent!, /Odpowiedzi w pakiecie się skończyły/);
    assert.ok(container.querySelector("textarea"), "the buyer may still write");
    await click(byText(container, "button", "Kup pakiet"));
    assert.deepEqual(bought, [{ productId: "prodv2_pack", reason: "replies", priceCents: undefined }]);
  });

  it("sells the given variant from the lock", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me({ threads: [packThread({ replies_left: 0 })] }))),
      on("GET", /^\/v1\/threads\/t1\/messages/, () => json(200, { messages: [], has_more: false })),
    );
    const bought: string[] = [];
    const container = await mount(thread({ buyProductId: "prodv2_pack_10", onBuy: (r) => void bought.push(r.productId) }));
    await click(byText(container, "button", "Kup pakiet"));
    assert.deepEqual(bought, ["prodv2_pack_10"]);
  });

  it("shows the buy error when the action fails", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me({ threads: [packThread({ replies_left: 0 })] }))),
      on("GET", /^\/v1\/threads\/t1\/messages/, () => json(200, { messages: [], has_more: false })),
    );
    const container = await mount(thread({ onBuy: async () => { throw new Error("cart"); } }));
    await click(byText(container, "button", "Kup pakiet"));
    assert.match(container.textContent!, /Nie udało się dodać do koszyka/);
  });

  it("locks the composer of an expired pack", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me({ threads: [packThread({ composer_locked: true, replies_left: 0 })] }))),
      on("GET", /^\/v1\/threads\/t1\/messages/, () => json(200, { messages: [msg("m1", CREATOR, "Pa")], has_more: false })),
    );
    const container = await mount(thread());
    assert.equal(container.querySelector("[data-testid=chat-lock]")?.getAttribute("data-lock"), "expired");
    assert.equal(container.querySelector("textarea"), null);
    assert.match(container.querySelector("[data-testid=chat-composer-blocked]")!.textContent!, /Pakiet wygasł/);
    assert.match(container.textContent!, /Wygasł 1\.12\.2026/);
  });

  it("shows the full lock for a product without a pack", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me({ threads: [] }))),
      on("POST", "/v1/threads", () => json(403, { error: "locked", product_id: "prodv2_pack" })),
    );
    const container = await mount(thread({ onBuy: () => {} }));
    const lock = container.querySelector("[data-testid=chat-lock]");
    assert.equal(lock?.getAttribute("data-lock"), "no-pack");
    assert.match(lock!.textContent!, /Nie masz pakietu odpowiedzi/);
    assert.equal(container.querySelector("textarea"), null);
  });

  it("shows a sent message as pending until the live event", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me())),
      on("GET", /^\/v1\/threads\/t1\/messages/, () => json(200, { messages: [], has_more: false })),
      on("POST", "/v1/threads/t1/messages", (request) => {
        const body = request.body as { body: string; client_id: string };
        return json(202, {
          message: { id: body.client_id, thread_id: "t1", author_email: BUYER, body: body.body, created_at: "2026-11-01T10:00:00Z", status: "pending" },
          thread: { id: "t1", kind: "pack", replies_left: 3, response_hours: 48 },
        });
      }),
    );
    const container = await mount(thread());
    await type(container, "Czy mogę zapytać o termin?");
    await click(container.querySelector("button[type=submit]"));
    const sent = requests.find((r) => r.method === "POST" && r.path === "/v1/threads/t1/messages");
    const body = sent?.body as { body: string; client_id: string };
    assert.equal(body.body, "Czy mogę zapytać o termin?");
    assert.match(body.client_id, /^[0-9a-f-]{36}$/);
    const row = container.querySelector(`[data-message-id="${body.client_id}"]`);
    assert.equal(row?.getAttribute("data-state"), "pending");
    assert.match(row!.textContent!, /Wysyłanie/);
    assert.equal(container.querySelector("textarea")!.value, "", "the composer is cleared");
  });

  it("shows a refused message with the reason and lets the buyer edit it", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me())),
      on("GET", /^\/v1\/threads\/t1\/messages/, () => json(200, { messages: [], has_more: false })),
      on("POST", "/v1/threads/t1/messages", () => json(403, { error: "blocked" })),
    );
    const container = await mount(thread());
    await type(container, "Halo");
    await click(container.querySelector("button[type=submit]"));
    const row = container.querySelector("[data-state=rejected]");
    assert.ok(row, "a rejected message");
    assert.match(row!.textContent!, /zablokował Ci możliwość pisania/);
    await click(byText(row!, "button", "Popraw"));
    assert.equal(container.querySelector("[data-state=rejected]"), null);
    assert.equal(container.querySelector("textarea")!.value, "Halo");
  });

  it("offers to send again after a network failure", async () => {
    let attempts = 0;
    routes.push(
      on("GET", "/v1/me", () => json(200, me())),
      on("GET", /^\/v1\/threads\/t1\/messages/, () => json(200, { messages: [], has_more: false })),
      on("POST", "/v1/threads/t1/messages", (request) => {
        attempts++;
        if (attempts === 1) return json(503, { error: "unavailable" });
        const body = request.body as { body: string; client_id: string };
        return json(202, { message: { id: body.client_id, thread_id: "t1", author_email: BUYER, body: body.body, created_at: "2026-11-01T10:00:00Z", status: "pending" }, thread: { id: "t1" } });
      }),
    );
    const container = await mount(thread());
    await type(container, "Ponownie");
    await click(container.querySelector("button[type=submit]"));
    assert.match(container.querySelector("[data-state=failed]")!.textContent!, /Brak połączenia/);
    await click(byText(container, "button", "Wyślij ponownie"));
    assert.equal(attempts, 2);
    assert.ok(container.querySelector("[data-state=pending]"));
  });

  it("shows deleted messages as a placeholder and a system note", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me())),
      on("GET", /^\/v1\/threads\/t1\/messages/, () =>
        json(200, {
          messages: [
            msg("m3", "system", "Odpowiem w poniedziałek.", { system: true }),
            msg("m2", CREATOR, "", { deleted: true }),
          ],
          has_more: false,
        }),
      ),
    );
    const container = await mount(thread());
    assert.match(container.querySelector("[data-state=deleted]")!.textContent!, /Wiadomość została usunięta/);
    assert.match(container.textContent!, /Wiadomość automatyczna/);
  });

  it("reports a creator's message with a reason and a note", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me())),
      on("GET", /^\/v1\/threads\/t1\/messages/, () => json(200, { messages: [msg("m2", CREATOR, "Kup to")], has_more: false })),
      on("POST", "/v1/reports", () => json(201, { id: "r1" })),
    );
    const container = await mount(thread());
    await click(container.querySelector('[data-message-id="m2"] button[aria-label="Opcje wiadomości"]'));
    await click(byText(container, "button", "Zgłoś wiadomość"));
    const form = container.querySelector("[data-testid=chat-report]")!;
    await click(form.querySelector('input[value="spam"]'));
    const note = form.querySelector("textarea")!;
    const setter = Object.getOwnPropertyDescriptor(page.win.HTMLTextAreaElement.prototype, "value")!.set!;
    await React.act(async () => {
      setter.call(note, "reklama");
      note.dispatchEvent(new page.win.Event("input", { bubbles: true }));
    });
    await React.act(async () => {
      form.dispatchEvent(new page.win.Event("submit", { bubbles: true, cancelable: true }));
    });
    await settle();
    const report = requests.find((r) => r.path === "/v1/reports");
    assert.deepEqual(report?.body, { thread_id: "t1", message_id: "m2", reason: "spam", note: "reklama" });
    assert.match(container.textContent!, /Zgłoszenie trafiło do moderacji/);
  });

  it("mutes the thread from the conversation options", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me())),
      on("GET", /^\/v1\/threads\/t1\/messages/, () => json(200, { messages: [], has_more: false })),
      on("POST", "/v1/threads/t1/mute", () => json(200, { ok: true })),
    );
    const container = await mount(thread());
    await click(container.querySelector('button[aria-label="Opcje rozmowy"]'));
    await click(byText(container, "button", "Wycisz powiadomienia"));
    assert.deepEqual(requests.find((r) => r.path === "/v1/threads/t1/mute")?.body, { muted: true });
    assert.match(container.textContent!, /Wyciszony/);
  });

  it("asks to log in when there is no session", async () => {
    const container = await mount(<widgets.ChatThread projectID="tstProj123" productId="prodv2_pack" locale="pl" />);
    assert.match(container.textContent!, /Zaloguj się w panelu klienta/);
  });

  it("uses the panel session as the bearer and the project as X-Bitsnap-Project", async () => {
    const seen: Array<Record<string, string>> = [];
    const original = globalThis.fetch;
    page.win.localStorage.setItem(
      `bitsnap-panel-session:${encodeURIComponent("https://bitsnap.pl")}:${encodeURIComponent("tstProj123")}`,
      "session-abc",
    );
    globalThis.fetch = (async (_url: string, init: RequestInit = {}) => {
      seen.push(init.headers as Record<string, string>);
      return json(401, { error: "unauthorized" });
    }) as unknown as typeof fetch;
    try {
      const container = await mount(
        <widgets.ChatThread projectID="tstProj123" chatProjectID="18" productId="prodv2_pack" apiUrl="https://chat.test" locale="en" />,
      );
      assert.equal(seen[0].Authorization, "Bearer session-abc");
      assert.equal(seen[0]["X-Bitsnap-Project"], "18");
      assert.match(container.textContent!, /Your session has expired/);
    } finally {
      globalThis.fetch = original;
      page.win.localStorage.clear();
    }
  });
});

describe("Channel", () => {
  const channel = (extra: Record<string, unknown> = {}) => ({
    id: "c1",
    name: "Klub twórców",
    topic: "Co tydzień nowe materiały",
    welcome: "Witaj w klubie!",
    who_can_post: "members",
    product_id: "prodv2_club",
    role: "member",
    member_count: 42,
    created_at: "2026-10-01T00:00:00Z",
    ...extra,
  });

  it("shows the lock with the welcome text and Kup dostęp without a grant", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me({ threads: [] }))),
      on("GET", /^\/v1\/threads\/c1\/messages/, () =>
        json(403, { error: "locked", product_id: "prodv2_club", price_cents: 2900, welcome: "Dołącz do klubu" }),
      ),
    );
    const bought: unknown[] = [];
    const container = await mount(
      <widgets.Channel projectID="tstProj123" client={client()} channelId="c1" locale="pl" onBuy={(r) => void bought.push(r)} />,
    );
    const lock = container.querySelector("[data-testid=chat-lock]");
    assert.equal(lock?.getAttribute("data-lock"), "no-access");
    assert.match(lock!.textContent!, /Dołącz do klubu/);
    await click(byText(container, "button", "Kup dostęp"));
    assert.deepEqual(bought, [{ productId: "prodv2_club", reason: "no-access", priceCents: 2900 }]);
  });

  it("shows the channel and refuses a link with the moderation reason", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me({ threads: [], channels: [channel()] }))),
      on("GET", /^\/v1\/threads\/c1\/messages/, () => json(200, { messages: [], has_more: false })),
      on("POST", "/v1/threads/c1/messages", () => json(422, { error: "moderation_link" })),
    );
    const container = await mount(<widgets.Channel projectID="tstProj123" client={client()} channelId="c1" locale="pl" pollIntervalMs={60_000} />);
    assert.match(container.textContent!, /Klub twórców/);
    assert.match(container.textContent!, /Członkowie: 42/);
    assert.match(container.textContent!, /Witaj w klubie!/);
    await type(container, "zobacz www.example.com");
    await click(container.querySelector("button[type=submit]"));
    assert.match(container.querySelector("[data-state=rejected]")!.textContent!, /Linki są w tym kanale zablokowane/);
  });

  it("shows the cooldown wait", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me({ threads: [], channels: [channel()] }))),
      on("GET", /^\/v1\/threads\/c1\/messages/, () => json(200, { messages: [], has_more: false })),
      on("POST", "/v1/threads/c1/messages", () => json(429, { error: "cooldown", retry_after: 25 })),
    );
    const container = await mount(<widgets.Channel projectID="tstProj123" client={client()} channelId="c1" locale="pl" pollIntervalMs={60_000} />);
    await type(container, "Szybko");
    await click(container.querySelector("button[type=submit]"));
    assert.match(container.textContent!, /Spróbuj ponownie za 25 s/);
  });

  it("sends a failed message again under the same id, even after a refused retry", async () => {
    let calls = 0;
    routes.push(
      on("GET", "/v1/me", () => json(200, me({ threads: [], channels: [channel()] }))),
      on("GET", /^\/v1\/threads\/c1\/messages/, () => json(200, { messages: [], has_more: false })),
      on("POST", "/v1/threads/c1/messages", () =>
        ++calls === 1 ? json(503, { error: "unavailable" }) : json(429, { error: "cooldown", retry_after: 5 }),
      ),
    );
    const container = await mount(<widgets.Channel projectID="tstProj123" client={client()} channelId="c1" locale="pl" pollIntervalMs={60_000} />);
    await type(container, "Raz");
    await click(container.querySelector("button[type=submit]"));
    await click(byText(container, "button", "Wyślij ponownie"));
    await click(byText(container, "button", "Wyślij ponownie"));
    const ids = requests
      .filter((r) => r.method === "POST" && r.path === "/v1/threads/c1/messages")
      .map((r) => (r.body as { client_id: string }).client_id);
    assert.equal(ids.length, 3);
    assert.equal(ids[1], ids[0], "a send with an unknown outcome keeps its id");
    assert.equal(ids[2], ids[0], "a refusal does not forget the earlier unknown outcome");
  });

  it("sends a message refused every time under a new id", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me({ threads: [], channels: [channel()] }))),
      on("GET", /^\/v1\/threads\/c1\/messages/, () => json(200, { messages: [], has_more: false })),
      on("POST", "/v1/threads/c1/messages", () => json(429, { error: "cooldown", retry_after: 5 })),
    );
    const container = await mount(<widgets.Channel projectID="tstProj123" client={client()} channelId="c1" locale="pl" pollIntervalMs={60_000} />);
    await type(container, "Raz");
    await click(container.querySelector("button[type=submit]"));
    await click(byText(container, "button", "Wyślij ponownie"));
    const ids = requests
      .filter((r) => r.method === "POST" && r.path === "/v1/threads/c1/messages")
      .map((r) => (r.body as { client_id: string }).client_id);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[1], ids[0]);
  });

  it("blocks the composer where only the creator posts", async () => {
    routes.push(
      on("GET", "/v1/me", () => json(200, me({ threads: [], channels: [channel({ who_can_post: "creator" })] }))),
      on("GET", /^\/v1\/threads\/c1\/messages/, () => json(200, { messages: [msg("m1", CREATOR, "Nowy materiał")], has_more: false })),
    );
    const container = await mount(<widgets.Channel projectID="tstProj123" client={client()} channelId="c1" locale="en" pollIntervalMs={60_000} />);
    assert.equal(container.querySelector("textarea"), null);
    assert.match(container.textContent!, /Only the creator posts in this channel/);
    assert.match(container.textContent!, /Nowy materiał/);
  });
});
