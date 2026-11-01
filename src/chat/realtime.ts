import { parseRealtimeEvent, type ChatClient } from "./client";
import {
  DEFAULT_CHAT_REALTIME_URL,
  type ChatLiveMode,
  type ChatRealtimeEvent,
} from "./types";

/** The part of `@nats-io/nats-core` the chat uses. */
export type NatsModule = {
  wsconnect(options: {
    servers: string[];
    authenticator: unknown;
    name?: string;
    reconnect?: boolean;
    maxReconnectAttempts?: number;
  }): Promise<NatsConnectionLike>;
  jwtAuthenticator(jwt: () => string): unknown;
};

export type NatsConnectionLike = {
  subscribe(
    subject: string,
    options: { callback: (error: Error | null, msg: { data: Uint8Array }) => void },
  ): { unsubscribe(): void };
  closed(): Promise<void | Error>;
  close(): Promise<void>;
};

/**
 * The NATS client is loaded on the first open conversation, so pages and
 * shops without chat never download it.
 */
export const loadNatsCore = (): Promise<NatsModule> =>
  import("@nats-io/nats-core") as unknown as Promise<NatsModule>;

export type LiveOptions = {
  client: ChatClient;
  /** `thread` for a pack thread, `channel` for a channel. */
  kind: "thread" | "channel";
  /** Thread id (a channel thread has the channel's id). */
  id: string;
  onEvent: (event: ChatRealtimeEvent) => void;
  onMode: (mode: ChatLiveMode) => void;
  /** Loads the newest page: the fallback, and the catch-up after a connect. */
  poll: () => Promise<void>;
  /** Polling interval while the socket is down. Default 8 s. */
  pollIntervalMs?: number;
  /** Delay before the socket is tried again after a failure. Default 60 s. */
  retryMs?: number;
  /** Overrides the WebSocket servers of the realtime token. */
  realtimeUrl?: string;
  /** Replaces the NATS loader (tests). */
  loadNats?: () => Promise<NatsModule>;
};

/**
 * Listens to one conversation: a realtime token from the chat service, then
 * a subscribe-only NATS WebSocket on the conversation's subject. When any
 * step fails (no WebSocket, token refused, subject not granted, socket
 * closed) it polls the newest page instead and tries the socket again later.
 * Returns the stop function.
 */
export function startLive(options: LiveOptions): () => void {
  const pollMs = options.pollIntervalMs ?? 8000;
  const retryMs = options.retryMs ?? 60_000;
  const load = options.loadNats ?? loadNatsCore;
  const suffix = `.${options.kind}.${options.id}`;

  let stopped = false;
  let connection: NatsConnectionLike | undefined;
  let jwt = "";
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  const stopPolling = () => {
    if (pollTimer != null) clearInterval(pollTimer);
    pollTimer = undefined;
  };

  const fallback = () => {
    if (stopped) return;
    options.onMode("polling");
    if (pollTimer == null) {
      pollTimer = setInterval(() => {
        void options.poll().catch(() => undefined);
      }, pollMs);
    }
    if (retryTimer == null) {
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, retryMs);
    }
  };

  const scheduleRefresh = (expiresAt: string) => {
    if (refreshTimer != null) clearTimeout(refreshTimer);
    const at = Date.parse(expiresAt);
    if (!Number.isFinite(at)) return;
    // A new JWT a minute before the old one ends; the connection uses it on
    // its next (re)connect, which the server forces at the expiry.
    const delay = Math.max(5_000, at - Date.now() - 60_000);
    refreshTimer = setTimeout(async () => {
      if (stopped) return;
      try {
        const next = await options.client.realtimeToken({ fresh: true });
        jwt = next.jwt;
        scheduleRefresh(next.expiresAt);
      } catch {
        // The server closes the socket at the expiry: polling takes over.
      }
    }, delay);
  };

  async function connect() {
    if (stopped) return;
    if (typeof WebSocket === "undefined") {
      fallback();
      return;
    }
    options.onMode("connecting");
    try {
      let token = await options.client.realtimeToken();
      let subject = token.subjects.find((s) => s.endsWith(suffix));
      if (!subject) {
        // A kept token may predate this conversation.
        token = await options.client.realtimeToken({ fresh: true });
        subject = token.subjects.find((s) => s.endsWith(suffix));
      }
      if (!subject || !token.jwt) throw new Error("subject not granted");
      jwt = token.jwt;
      const nats = await load();
      if (stopped) return;
      const servers = options.realtimeUrl
        ? [options.realtimeUrl]
        : token.servers.length > 0
          ? token.servers
          : [DEFAULT_CHAT_REALTIME_URL];
      const nc = await nats.wsconnect({
        servers,
        authenticator: nats.jwtAuthenticator(() => jwt),
        name: "bitsnap-react/chat",
        reconnect: true,
        maxReconnectAttempts: 5,
      });
      if (stopped) {
        void nc.close().catch(() => undefined);
        return;
      }
      connection = nc;
      const decoder = new TextDecoder();
      nc.subscribe(subject, {
        callback: (error, msg) => {
          if (error) return;
          try {
            const event = parseRealtimeEvent(JSON.parse(decoder.decode(msg.data)));
            if (event) options.onEvent(event);
          } catch {
            // Not a chat event.
          }
        },
      });
      void nc.closed().then(() => {
        if (connection === nc) {
          connection = undefined;
          fallback();
        }
      });
      scheduleRefresh(token.expiresAt);
      stopPolling();
      options.onMode("live");
      // Messages stored between the history load and the subscribe.
      void options.poll().catch(() => undefined);
    } catch {
      fallback();
    }
  }

  void connect();

  return () => {
    stopped = true;
    stopPolling();
    if (retryTimer != null) clearTimeout(retryTimer);
    if (refreshTimer != null) clearTimeout(refreshTimer);
    const nc = connection;
    connection = undefined;
    if (nc) void nc.close().catch(() => undefined);
  };
}
