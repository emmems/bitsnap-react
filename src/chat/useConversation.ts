import { useCallback, useEffect, useRef, useState } from "react";
import { ChatError, type ChatClient } from "./client";
import { startLive, type NatsModule } from "./realtime";
import type {
  ChatChannelSummary,
  ChatLiveMode,
  ChatMessage,
  ChatRealtimeEvent,
  ChatReportReason,
  ChatThreadSummary,
} from "./types";

/** What to open: a pack thread (by product or id) or a channel. */
export type ConversationTarget =
  | { kind: "thread"; threadId?: string; productId?: string }
  | { kind: "channel"; channelId: string; productId?: string };

/** The client-side state of a message the service has not stored. */
export type LocalMessageState = {
  state: "pending" | "unconfirmed" | "rejected" | "failed";
  /** Error code or live reject reason. */
  reason?: string;
  retryAfter?: number;
};

export type ConversationMessage = ChatMessage & { local?: LocalMessageState };

/**
 * Why the buyer sees the lock: `replies` (no creator replies left, writing
 * still works), `expired` (every pack expired), `no-pack` (no thread and no
 * pack for the product), `no-access` (a paid channel without a grant).
 */
export type ConversationLock = {
  reason: "replies" | "expired" | "no-pack" | "no-access";
  productId?: string;
  priceCents?: number;
  welcome?: string;
};

export type ConversationState = {
  status: "loading" | "ready" | "locked" | "error";
  error?: ChatError;
  threadId?: string;
  /** The caller's e-mail, lowercased. */
  me?: string;
  thread?: ChatThreadSummary;
  channel?: ChatChannelSummary;
  lock?: ConversationLock;
  /** Oldest first. */
  messages: ConversationMessage[];
  hasMore: boolean;
  loadingOlder: boolean;
  live: ChatLiveMode;
};

export type ConversationActions = {
  send(body: string): Promise<void>;
  /** Sends a failed or refused message again. */
  retry(id: string): Promise<void>;
  /** Removes a message that was not stored. */
  discard(id: string): void;
  deleteMessage(id: string): Promise<void>;
  report(input: {
    messageId?: string;
    reason: ChatReportReason;
    note?: string;
  }): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  loadOlder(): Promise<void>;
  reload(): void;
};

export type UseConversationOptions = {
  /**
   * `undefined` when there is no credential (the state is an error), `null`
   * while the credential is still being looked up (the state stays loading).
   */
  client: ChatClient | null | undefined;
  target: ConversationTarget;
  pollIntervalMs?: number;
  realtimeUrl?: string;
  loadNats?: () => Promise<NatsModule>;
  /** A pending send counts as unconfirmed after this long. Default 45 s. */
  confirmTimeoutMs?: number;
};

const PAGE = 50;

const initial: ConversationState = {
  status: "loading",
  messages: [],
  hasMore: false,
  loadingOlder: false,
  live: "off",
};

/** A UUID v4; the service uses it as the message id, so a retry is stored once. */
export function newMessageId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Merges messages by id, oldest first. A stored message replaces a pending
 * copy of itself (the live `message.created` or a history page after a 202);
 * messages that were refused locally stay as they are.
 */
export function mergeMessages(
  current: ConversationMessage[],
  incoming: ChatMessage[],
): ConversationMessage[] {
  const byId = new Map(current.map((m) => [m.id, m] as const));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    if (message.status === "pending") {
      // A pending answer never overwrites a stored copy.
      if (existing && !existing.local) continue;
      byId.set(message.id, { ...message, local: existing?.local ?? { state: "pending" } });
      continue;
    }
    if (existing?.local && existing.local.state !== "pending" && existing.local.state !== "unconfirmed") {
      continue;
    }
    byId.set(message.id, { ...message, local: undefined });
  }
  return [...byId.values()].sort((a, b) => {
    const at = Date.parse(a.createdAt) || 0;
    const bt = Date.parse(b.createdAt) || 0;
    return at - bt;
  });
}

/** The lock of a pack thread that the buyer can read. */
export function threadLock(thread: ChatThreadSummary): ConversationLock | undefined {
  if (thread.kind !== "pack") return undefined;
  if (thread.composerLocked) return { reason: "expired", productId: thread.productId };
  if (thread.repliesLeft <= 0) return { reason: "replies", productId: thread.productId };
  return undefined;
}

function lockedFrom(error: ChatError, reason: ConversationLock["reason"], productId?: string): ConversationLock {
  const price = Number(error.data.price_cents);
  return {
    reason,
    productId: typeof error.data.product_id === "string" && error.data.product_id
      ? error.data.product_id
      : productId,
    priceCents: Number.isFinite(price) && price > 0 ? price : undefined,
    welcome: typeof error.data.welcome === "string" ? error.data.welcome : undefined,
  };
}

function asChatError(error: unknown): ChatError {
  return error instanceof ChatError ? error : new ChatError("internal_error", 0);
}

/**
 * State and actions of one conversation: resolves the thread (opening a pack
 * thread when the buyer holds a pack and has none yet), loads the newest
 * page, listens live (or polls) and sends optimistically.
 */
export function useConversation(
  options: UseConversationOptions,
): ConversationState & ConversationActions {
  const { client, target } = options;
  const [state, setState] = useState<ConversationState>(initial);
  const [generation, setGeneration] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastRead = useRef<string>(undefined);

  const targetKey =
    target.kind === "thread"
      ? `t:${target.threadId ?? ""}:${target.productId ?? ""}`
      : `c:${target.channelId}:${target.productId ?? ""}`;

  // --- load -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    lastRead.current = undefined;
    setState(initial);
    if (client === null) return;
    if (!client) {
      setState({ ...initial, status: "error", error: new ChatError("no_token", 401) });
      return;
    }
    (async () => {
      try {
        const me = await client.me();
        const email = me.email.toLowerCase();
        let thread: ChatThreadSummary | undefined;
        let channel: ChatChannelSummary | undefined;
        let threadId: string;
        if (target.kind === "thread") {
          thread = target.threadId
            ? me.threads.find((t) => t.id === target.threadId)
            : me.threads.find((t) => t.productId === target.productId);
          if (!thread && target.productId) {
            try {
              thread = await client.openThread(target.productId);
            } catch (error) {
              const e = asChatError(error);
              if (e.code === "locked" || e.status === 404) {
                if (!cancelled)
                  setState({
                    ...initial,
                    status: "locked",
                    me: email,
                    lock: lockedFrom(e, "no-pack", target.productId),
                  });
                return;
              }
              throw e;
            }
          }
          if (!thread) throw new ChatError("not_found", 404);
          threadId = thread.id;
        } else {
          channel = me.channels.find((c) => c.id === target.channelId);
          threadId = target.channelId;
        }

        let page;
        try {
          page = await client.messages(threadId, { limit: PAGE });
        } catch (error) {
          const e = asChatError(error);
          if (e.code === "locked") {
            if (!cancelled)
              setState({
                ...initial,
                status: "locked",
                me: email,
                thread,
                channel,
                threadId,
                lock: lockedFrom(
                  e,
                  target.kind === "channel" ? "no-access" : "no-pack",
                  target.productId ?? channel?.productId ?? thread?.productId,
                ),
              });
            return;
          }
          throw e;
        }
        if (cancelled) return;
        setState({
          ...initial,
          status: "ready",
          me: email,
          thread,
          channel,
          threadId,
          lock: thread ? threadLock(thread) : undefined,
          messages: mergeMessages([], page.messages),
          hasMore: page.hasMore,
        });
      } catch (error) {
        if (!cancelled) setState({ ...initial, status: "error", error: asChatError(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, targetKey, generation]);

  // --- thread state refresh (replies left after a creator reply) --------
  const refreshThread = useCallback(() => {
    if (!client) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      try {
        const me = await client.me();
        setState((s) => {
          if (s.status !== "ready") return s;
          const thread = s.thread && me.threads.find((t) => t.id === s.thread!.id);
          const channel = s.channel && me.channels.find((c) => c.id === s.channel!.id);
          return {
            ...s,
            thread: thread ?? s.thread,
            channel: channel ?? s.channel,
            lock: thread ? threadLock(thread) : s.lock,
          };
        });
      } catch {
        // Keep the last state.
      }
    }, 1500);
  }, [client]);

  // --- live -------------------------------------------------------------
  const poll = useCallback(async () => {
    const { threadId } = stateRef.current;
    if (!client || !threadId) return;
    const page = await client.messages(threadId, { limit: PAGE });
    setState((s) =>
      s.threadId === threadId ? { ...s, messages: mergeMessages(s.messages, page.messages) } : s,
    );
  }, [client]);

  const onEvent = useCallback(
    (event: ChatRealtimeEvent) => {
      setState((s) => {
        switch (event.type) {
          case "message.created":
            return { ...s, messages: mergeMessages(s.messages, [event.message]) };
          case "message.rejected":
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.id === event.id
                  ? { ...m, local: { state: "rejected", reason: event.reason || "rejected" } }
                  : m,
              ),
            };
          case "message.deleted":
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.id === event.id ? { ...m, deleted: true, body: "", attachmentKey: undefined } : m,
              ),
            };
          case "message.pinned":
          case "message.unpinned":
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.id === event.id ? { ...m, pinned: event.type === "message.pinned" } : m,
              ),
            };
        }
      });
      if (
        event.type === "message.created" &&
        !event.message.system &&
        event.message.authorEmail.toLowerCase() !== stateRef.current.me
      ) {
        refreshThread();
      }
    },
    [refreshThread],
  );

  const ready = state.status === "ready";
  const liveThreadId = ready ? state.threadId : undefined;
  useEffect(() => {
    if (!client || !liveThreadId) return;
    const stop = startLive({
      client,
      kind: target.kind,
      id: liveThreadId,
      onEvent,
      onMode: (live) => setState((s) => ({ ...s, live })),
      poll,
      pollIntervalMs: options.pollIntervalMs,
      realtimeUrl: options.realtimeUrl,
      loadNats: options.loadNats,
    });
    return () => {
      stop();
      setState((s) => ({ ...s, live: "off" }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, liveThreadId, onEvent, poll]);

  // --- read receipt of the newest message from the other side -----------
  useEffect(() => {
    if (!client || !state.threadId || state.status !== "ready") return;
    const last = [...state.messages]
      .reverse()
      .find((m) => !m.local && m.authorEmail.toLowerCase() !== state.me);
    if (!last || lastRead.current === last.id) return;
    lastRead.current = last.id;
    void client.markRead(state.threadId, last.id).catch(() => undefined);
  }, [client, state.threadId, state.status, state.messages, state.me]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  // --- actions ----------------------------------------------------------
  const updateMessage = (id: string, patch: (m: ConversationMessage) => ConversationMessage) =>
    setState((s) => ({ ...s, messages: s.messages.map((m) => (m.id === id ? patch(m) : m)) }));

  const send = useCallback(
    async (body: string, reuseId?: string) => {
      const text = body.trim();
      const { threadId, me } = stateRef.current;
      if (!client || !threadId || !text) return;
      const id = reuseId ?? newMessageId();
      const optimistic: ConversationMessage = {
        id,
        threadId,
        authorEmail: me ?? "",
        body: text,
        createdAt: new Date().toISOString(),
        pinned: false,
        deleted: false,
        system: false,
        status: "pending",
        local: { state: "pending" },
      };
      setState((s) => ({ ...s, messages: [...s.messages, optimistic] }));
      try {
        const result = await client.send(threadId, { body: text, clientId: id });
        setState((s) => ({
          ...s,
          messages: mergeMessages(s.messages, [{ ...result.message, id }]),
          thread: s.thread ? { ...s.thread, ...result.thread, id: s.thread.id } : s.thread,
          lock: s.thread ? threadLock({ ...s.thread, ...result.thread, id: s.thread.id }) : s.lock,
        }));
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          updateMessage(id, (m) =>
            m.local?.state === "pending" ? { ...m, local: { state: "unconfirmed" } } : m,
          );
        }, options.confirmTimeoutMs ?? 45_000);
        timers.current.add(timer);
      } catch (error) {
        const e = asChatError(error);
        const failed = e.code === "network" || e.code === "unavailable" || e.status >= 500;
        updateMessage(id, (m) => ({
          ...m,
          local: {
            state: failed ? "failed" : "rejected",
            reason: e.code,
            retryAfter: e.retryAfter,
          },
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, options.confirmTimeoutMs],
  );

  const discard = useCallback((id: string) => {
    setState((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== id) }));
  }, []);

  const retry = useCallback(
    async (id: string) => {
      const message = stateRef.current.messages.find((m) => m.id === id);
      if (!message) return;
      // A send whose outcome is unknown (network error, 5xx, no
      // confirmation) may have been queued: it goes again under the same
      // id, so the service stores and bills it once. Only a refused send
      // gets a new id.
      const uncertain = message.local?.state !== "rejected";
      discard(id);
      await send(message.body, uncertain ? id : undefined);
    },
    [discard, send],
  );

  const deleteMessage = useCallback(
    async (id: string) => {
      const { threadId } = stateRef.current;
      const before = stateRef.current.messages.find((m) => m.id === id);
      if (!client || !threadId || !before) return;
      updateMessage(id, (m) => ({ ...m, deleted: true, body: "", attachmentKey: undefined }));
      try {
        await client.deleteMessage(threadId, id);
      } catch (error) {
        updateMessage(id, () => before);
        throw error;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client],
  );

  const report = useCallback(
    async (input: { messageId?: string; reason: ChatReportReason; note?: string }) => {
      const { threadId } = stateRef.current;
      if (!client || !threadId) return;
      await client.report({ threadId, ...input });
    },
    [client],
  );

  const setMuted = useCallback(
    async (muted: boolean) => {
      const { threadId } = stateRef.current;
      if (!client || !threadId) return;
      await client.mute(threadId, muted);
      setState((s) => (s.thread ? { ...s, thread: { ...s.thread, muted } } : s));
    },
    [client],
  );

  const loadOlder = useCallback(async () => {
    const { threadId, messages, hasMore, loadingOlder } = stateRef.current;
    const oldest = messages.find((m) => !m.local);
    if (!client || !threadId || !hasMore || loadingOlder || !oldest) return;
    setState((s) => ({ ...s, loadingOlder: true }));
    try {
      const page = await client.messages(threadId, { before: oldest.id, limit: PAGE });
      setState((s) => ({
        ...s,
        loadingOlder: false,
        hasMore: page.hasMore,
        messages: mergeMessages(s.messages, page.messages),
      }));
    } catch {
      setState((s) => ({ ...s, loadingOlder: false }));
    }
  }, [client]);

  const reload = useCallback(() => setGeneration((g) => g + 1), []);

  return { ...state, send, retry, discard, deleteMessage, report, setMuted, loadOlder, reload };
}
