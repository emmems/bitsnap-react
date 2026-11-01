import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChatError, createChatClient, parseRealtimeEvent } from "./client.ts";

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };

function fake(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string, init: RequestInit = {}) => {
    const call: Call = {
      url: input,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("chat client requests", () => {
  it("sends the bearer and the project on every call, to chat.bitsnap.pl by default", async () => {
    const { calls, fetchFn } = fake(() =>
      json(200, { email: "b@x.pl", threads: [], entitlements: { packs: [], channels: [] }, channels: [] }),
    );
    const client = createChatClient({ projectId: "18", token: "bcht_abc", fetch: fetchFn });
    await client.me();
    assert.equal(calls[0].url, "https://chat.bitsnap.pl/v1/me");
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].headers.Authorization, "Bearer bcht_abc");
    assert.equal(calls[0].headers["X-Bitsnap-Project"], "18");
    assert.equal(calls[0].headers["Content-Type"], undefined, "a GET has no JSON body");
  });

  it("uses the given base URL without a trailing slash", async () => {
    const { calls, fetchFn } = fake(() => json(200, { messages: [], has_more: false }));
    const client = createChatClient({ projectId: "18", token: "t", baseUrl: "https://chat.test/", fetch: fetchFn });
    await client.messages("th 1", { before: "m-9", limit: 20 });
    assert.equal(calls[0].url, "https://chat.test/v1/threads/th%201/messages?before=m-9&limit=20");
  });

  it("maps GET /v1/me from snake case", async () => {
    const { fetchFn } = fake(() =>
      json(200, {
        email: "Buyer@X.pl",
        threads: [
          {
            id: "t1",
            kind: "pack",
            title: "creator@x.pl",
            unread: 2,
            replies_total: 10,
            replies_used: 7,
            replies_left: 3,
            expires_at: "2026-12-01T00:00:00Z",
            composer_locked: false,
            product_id: "prodv2_abc",
            response_hours: 48,
            muted: true,
            packs: [{ order_id: "o1", replies: 10, used: 7, left: 3, expires_at: null, expired: false }],
            last_message: { id: "m1", thread_id: "t1", author_email: "creator@x.pl", body: "Hej", created_at: "2026-11-01T10:00:00Z", pinned: false },
          },
        ],
        entitlements: {
          packs: [{ product_id: "prodv2_new", name: "Konsultacja", replies_left_hint: 5, expires_at: null }],
          channels: [{ product_id: "prodv2_com", channel_id: "c1" }],
        },
        channels: [{ id: "c1", name: "Klub", topic: "", welcome: "Witaj", who_can_post: "members", product_id: "prodv2_com", role: "member", member_count: 12, created_at: "2026-10-01T00:00:00Z" }],
      }),
    );
    const me = await createChatClient({ projectId: "18", token: "t", fetch: fetchFn }).me();
    const thread = me.threads[0];
    assert.equal(thread.repliesLeft, 3);
    assert.equal(thread.responseHours, 48);
    assert.equal(thread.productId, "prodv2_abc");
    assert.equal(thread.muted, true);
    assert.equal(thread.packs[0].orderId, "o1");
    assert.equal(thread.packs[0].expiresAt, null);
    assert.equal(thread.lastMessage?.body, "Hej");
    assert.equal(me.entitlements.packs[0].repliesLeftHint, 5);
    assert.equal(me.entitlements.channels[0].channelId, "c1");
    assert.equal(me.channels[0].whoCanPost, "members");
    assert.equal(me.channels[0].memberCount, 12);
  });

  it("opens a pack thread with POST /v1/threads {product_id}", async () => {
    const { calls, fetchFn } = fake(() => json(201, { id: "t9", kind: "pack", replies_left: 5 }));
    const thread = await createChatClient({ projectId: "18", token: "t", fetch: fetchFn }).openThread("prodv2_abc");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "https://chat.bitsnap.pl/v1/threads");
    assert.deepEqual(calls[0].body, { product_id: "prodv2_abc" });
    assert.equal(calls[0].headers["Content-Type"], "application/json");
    assert.equal(thread.id, "t9");
    assert.equal(thread.repliesLeft, 5);
  });

  it("treats the 202 of a send as a pending message with the thread state", async () => {
    const { calls, fetchFn } = fake(() =>
      json(202, {
        message: { id: "11111111-1111-4111-8111-111111111111", thread_id: "t1", author_email: "b@x.pl", body: "Pytanie", created_at: "2026-11-01T10:00:00Z", status: "pending" },
        thread: { id: "t1", kind: "pack", replies_left: 2, composer_locked: false, response_hours: 24 },
      }),
    );
    const result = await createChatClient({ projectId: "18", token: "t", fetch: fetchFn }).send("t1", {
      body: "Pytanie",
      clientId: "11111111-1111-4111-8111-111111111111",
    });
    assert.equal(calls[0].url, "https://chat.bitsnap.pl/v1/threads/t1/messages");
    assert.deepEqual(calls[0].body, { body: "Pytanie", client_id: "11111111-1111-4111-8111-111111111111" });
    assert.equal(result.message.status, "pending");
    assert.equal(result.thread.repliesLeft, 2);
    assert.equal(result.thread.responseHours, 24);
  });

  it("sends report, mute, delete and read receipt bodies", async () => {
    const { calls, fetchFn } = fake(() => json(200, { ok: true }));
    const client = createChatClient({ projectId: "18", token: "t", fetch: fetchFn });
    await client.report({ threadId: "t1", messageId: "m1", reason: "abuse", note: "obraźliwe" });
    await client.report({ threadId: "t1", reason: "spam" });
    await client.mute("t1", true);
    await client.deleteMessage("t1", "m1");
    await client.markRead("t1", "m2");
    assert.deepEqual(
      calls.map((c) => [c.method, c.url.replace("https://chat.bitsnap.pl", ""), c.body]),
      [
        ["POST", "/v1/reports", { thread_id: "t1", message_id: "m1", reason: "abuse", note: "obraźliwe" }],
        ["POST", "/v1/reports", { thread_id: "t1", reason: "spam" }],
        ["POST", "/v1/threads/t1/mute", { muted: true }],
        ["DELETE", "/v1/threads/t1/messages/m1", undefined],
        ["POST", "/v1/threads/t1/receipts", { state: "read", message_id: "m2" }],
      ],
    );
  });

  it("reads the realtime token answer", async () => {
    const { calls, fetchFn } = fake(() =>
      json(200, { jwt: "eyJ", expires_at: "2026-11-01T10:10:00Z", servers: ["wss://nats.test"], subjects: ["chat.project.18.thread.t1"], truncated: false }),
    );
    const token = await createChatClient({ projectId: "18", token: "t", fetch: fetchFn }).realtimeToken();
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "https://chat.bitsnap.pl/v1/realtime/token");
    assert.deepEqual(token.servers, ["wss://nats.test"]);
    assert.deepEqual(token.subjects, ["chat.project.18.thread.t1"]);
  });
});

describe("chat client errors", () => {
  it("throws the service code, with retry_after for a cooldown", async () => {
    const { fetchFn } = fake(() => json(429, { error: "cooldown", retry_after: 12 }));
    const client = createChatClient({ projectId: "18", token: "t", fetch: fetchFn });
    await assert.rejects(client.send("c1", { body: "x" }), (error: unknown) => {
      assert.ok(error instanceof ChatError);
      assert.equal(error.code, "cooldown");
      assert.equal(error.status, 429);
      assert.equal(error.retryAfter, 12);
      return true;
    });
  });

  it("keeps the extra fields of a locked answer", async () => {
    const { fetchFn } = fake(() => json(403, { error: "locked", product_id: "prodv2_com", price_cents: 2900, welcome: "Hej" }));
    const client = createChatClient({ projectId: "18", token: "t", fetch: fetchFn });
    await assert.rejects(client.messages("c1"), (error: unknown) => {
      assert.ok(error instanceof ChatError);
      assert.equal(error.code, "locked");
      assert.equal(error.data.product_id, "prodv2_com");
      assert.equal(error.data.price_cents, 2900);
      return true;
    });
  });

  it("reports a moderation refusal by its code", async () => {
    const { fetchFn } = fake(() => json(422, { error: "moderation_link" }));
    await assert.rejects(
      createChatClient({ projectId: "18", token: "t", fetch: fetchFn }).send("c1", { body: "www.x.pl" }),
      { code: "moderation_link", status: 422 },
    );
  });

  it("turns a failed request into `network` and a body without code into `internal_error`", async () => {
    const offline = createChatClient({
      projectId: "18",
      token: "t",
      fetch: (async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
    });
    await assert.rejects(offline.me(), { code: "network", status: 0 });
    const { fetchFn } = fake(() => new Response("bad gateway", { status: 502 }));
    await assert.rejects(createChatClient({ projectId: "18", token: "t", fetch: fetchFn }).me(), {
      code: "internal_error",
      status: 502,
    });
  });
});

describe("realtime events", () => {
  it("parses created, rejected and deleted events and drops others", () => {
    const created = parseRealtimeEvent({ type: "message.created", id: "m1", author_email: "c@x.pl", body: "Hi", created_at: "2026-11-01T10:00:00Z", system: true });
    assert.equal(created?.type, "message.created");
    assert.equal(created?.type === "message.created" && created.message.system, true);
    assert.deepEqual(parseRealtimeEvent({ type: "message.rejected", id: "m2", reason: "pack_empty" }), {
      type: "message.rejected",
      id: "m2",
      reason: "pack_empty",
    });
    assert.deepEqual(parseRealtimeEvent({ type: "message.deleted", id: "m3" }), { type: "message.deleted", id: "m3" });
    assert.equal(parseRealtimeEvent({ type: "typing", email: "x" }), null);
    assert.equal(parseRealtimeEvent("nope"), null);
  });
});
