import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ChatError, type ChatClient } from "./client.ts";
import { startLive, type NatsConnectionLike, type NatsModule } from "./realtime.ts";
import type { ChatLiveMode, ChatRealtimeEvent, ChatRealtimeToken } from "./types.ts";

// Node has a WebSocket global; make sure the code path that needs it runs.
(globalThis as { WebSocket?: unknown }).WebSocket ??= class {};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeClient(token: () => Promise<ChatRealtimeToken>): ChatClient {
  return { realtimeToken: token } as unknown as ChatClient;
}

function fakeNats() {
  const state: {
    servers?: string[];
    jwt?: () => string;
    subject?: string;
    deliver?: (data: unknown) => void;
    close?: () => void;
    closedByClient: boolean;
  } = { closedByClient: false };
  const nats: NatsModule = {
    jwtAuthenticator: (jwt) => {
      state.jwt = jwt;
      return { jwt };
    },
    wsconnect: async (options) => {
      state.servers = options.servers;
      let resolveClosed: () => void = () => {};
      const closed = new Promise<void>((resolve) => (resolveClosed = resolve));
      state.close = resolveClosed;
      const connection: NatsConnectionLike = {
        subscribe(subject, { callback }) {
          state.subject = subject;
          state.deliver = (data) =>
            callback(null, { data: new TextEncoder().encode(JSON.stringify(data)) });
          return { unsubscribe() {} };
        },
        closed: () => closed,
        close: async () => {
          state.closedByClient = true;
        },
      };
      return connection;
    },
  };
  return { nats, state };
}

const token = (subjects: string[], servers: string[] = []): ChatRealtimeToken => ({
  jwt: "jwt-1",
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  servers,
  subjects,
  truncated: false,
});

let stops: Array<() => void> = [];
afterEach(() => {
  stops.forEach((stop) => stop());
  stops = [];
});

describe("chat realtime", () => {
  it("subscribes to the conversation subject with the JWT and forwards events", async () => {
    const { nats, state } = fakeNats();
    const modes: ChatLiveMode[] = [];
    const events: ChatRealtimeEvent[] = [];
    let polls = 0;
    stops.push(
      startLive({
        client: fakeClient(async () =>
          token(["chat.project.18.thread.other", "chat.project.18.thread.t1"], ["wss://nats.test"]),
        ),
        kind: "thread",
        id: "t1",
        onEvent: (event) => events.push(event),
        onMode: (mode) => modes.push(mode),
        poll: async () => void polls++,
        loadNats: async () => nats,
      }),
    );
    await sleep(10);
    assert.equal(state.subject, "chat.project.18.thread.t1");
    assert.deepEqual(state.servers, ["wss://nats.test"]);
    assert.equal(state.jwt?.(), "jwt-1");
    assert.deepEqual(modes, ["connecting", "live"]);
    assert.equal(polls, 1, "one catch-up page after the subscribe");

    state.deliver!({ type: "message.created", id: "m1", author_email: "c@x.pl", body: "Hej", created_at: "2026-11-01T10:00:00Z" });
    state.deliver!({ type: "message.rejected", id: "m2", reason: "pack_empty" });
    assert.equal(events.length, 2);
    assert.equal(events[0].type, "message.created");
    assert.deepEqual(events[1], { type: "message.rejected", id: "m2", reason: "pack_empty" });
  });

  it("uses the default WebSocket URL when the token lists no server", async () => {
    const { nats, state } = fakeNats();
    stops.push(
      startLive({
        client: fakeClient(async () => token(["chat.project.18.channel.c1"])),
        kind: "channel",
        id: "c1",
        onEvent: () => {},
        onMode: () => {},
        poll: async () => {},
        loadNats: async () => nats,
      }),
    );
    await sleep(10);
    assert.deepEqual(state.servers, ["wss://bitsnap-nats-queue-production.up.railway.app"]);
    assert.equal(state.subject, "chat.project.18.channel.c1");
  });

  it("polls when the realtime token is refused", async () => {
    const modes: ChatLiveMode[] = [];
    let polls = 0;
    let loaded = false;
    stops.push(
      startLive({
        client: fakeClient(async () => {
          throw new ChatError("unavailable", 503);
        }),
        kind: "thread",
        id: "t1",
        onEvent: () => {},
        onMode: (mode) => modes.push(mode),
        poll: async () => void polls++,
        pollIntervalMs: 15,
        loadNats: async () => {
          loaded = true;
          throw new Error("must not load");
        },
      }),
    );
    await sleep(60);
    assert.deepEqual(modes, ["connecting", "polling"]);
    assert.ok(polls >= 2, `polled ${polls} times`);
    assert.equal(loaded, false, "the NATS client is not loaded without a token");
  });

  it("polls when the subject is not in the token", async () => {
    const { nats } = fakeNats();
    const modes: ChatLiveMode[] = [];
    stops.push(
      startLive({
        client: fakeClient(async () => token(["chat.project.18.thread.other"])),
        kind: "thread",
        id: "t1",
        onEvent: () => {},
        onMode: (mode) => modes.push(mode),
        poll: async () => {},
        pollIntervalMs: 1000,
        loadNats: async () => nats,
      }),
    );
    await sleep(10);
    assert.equal(modes.at(-1), "polling");
  });

  it("falls back to polling when the socket closes, and reconnects later", async () => {
    const { nats, state } = fakeNats();
    const modes: ChatLiveMode[] = [];
    let polls = 0;
    let tokens = 0;
    stops.push(
      startLive({
        client: fakeClient(async () => {
          tokens++;
          return token(["chat.project.18.thread.t1"]);
        }),
        kind: "thread",
        id: "t1",
        onEvent: () => {},
        onMode: (mode) => modes.push(mode),
        poll: async () => void polls++,
        pollIntervalMs: 10,
        retryMs: 40,
        loadNats: async () => nats,
      }),
    );
    await sleep(10);
    assert.equal(modes.at(-1), "live");
    const pollsWhileLive = polls;
    state.close!();
    await sleep(30);
    assert.equal(modes.at(-1), "polling");
    assert.ok(polls > pollsWhileLive, "polling while the socket is down");
    await sleep(40);
    assert.equal(tokens, 2, "a new token for the retry");
    assert.equal(modes.at(-1), "live");
  });

  it("polls when the browser has no WebSocket", async () => {
    const saved = (globalThis as { WebSocket?: unknown }).WebSocket;
    delete (globalThis as { WebSocket?: unknown }).WebSocket;
    try {
      const modes: ChatLiveMode[] = [];
      let asked = false;
      stops.push(
        startLive({
          client: fakeClient(async () => {
            asked = true;
            return token([]);
          }),
          kind: "thread",
          id: "t1",
          onEvent: () => {},
          onMode: (mode) => modes.push(mode),
          poll: async () => {},
          pollIntervalMs: 1000,
        }),
      );
      await sleep(5);
      assert.deepEqual(modes, ["polling"]);
      assert.equal(asked, false);
    } finally {
      (globalThis as { WebSocket?: unknown }).WebSocket = saved;
    }
  });

  it("closes the connection on stop", async () => {
    const { nats, state } = fakeNats();
    const stop = startLive({
      client: fakeClient(async () => token(["chat.project.18.thread.t1"])),
      kind: "thread",
      id: "t1",
      onEvent: () => {},
      onMode: () => {},
      poll: async () => {},
      loadNats: async () => nats,
    });
    await sleep(10);
    stop();
    assert.equal(state.closedByClient, true);
  });
});
