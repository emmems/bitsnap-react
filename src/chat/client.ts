import {
  DEFAULT_CHAT_API_URL,
  DEFAULT_CHAT_ATTACHMENTS_URL,
  type ChatChannelSummary,
  type ChatAttachment,
  type ChatMe,
  type ChatMessage,
  type ChatMessagePage,
  type ChatPack,
  type ChatRealtimeEvent,
  type ChatRealtimeToken,
  type ChatReportReason,
  type ChatSendResult,
  type ChatThreadState,
  type ChatThreadSummary,
} from "./types";

/**
 * An error answer of the chat service (`{"error":"<code>"}`), or `network`
 * (status 0) when the request did not get an answer.
 *
 * Codes the buyer UI handles: `unauthorized` (401), `plan_required`,
 * `locked`, `muted`, `blocked`, `forbidden`, `read_only` (403), `not_found`
 * (404), `moderation_link`, `moderation_banned_word`, `moderation_media`
 * (422), `cooldown` (429, with `retryAfter`), `unavailable` (503),
 * `invalid_project` (400).
 */
export class ChatError extends Error {
  readonly code: string;
  readonly status: number;
  /** `cooldown`: seconds to wait before the next post. */
  readonly retryAfter?: number;
  /** Extra fields of the answer (`locked`: product, price type and bounds). */
  readonly data: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    data: Record<string, unknown> = {},
  ) {
    super(`chat: ${code} (${status})`);
    this.name = "ChatError";
    this.code = code;
    this.status = status;
    this.data = data;
    const retry = Number(data.retry_after);
    if (Number.isFinite(retry) && retry > 0) this.retryAfter = retry;
  }
}

export type ChatClientOptions = {
  /** Project id sent as `X-Bitsnap-Project`. */
  projectId: string;
  /** Bearer credential: the panel session token or a `bcht_` buyer token. */
  token: string;
  /** Base URL of the chat service. Defaults to `https://chat.bitsnap.pl`. */
  baseUrl?: string;
  /** Bitsnap app host for private attachment upload and read endpoints. */
  attachmentsUrl?: string;
  /** Replaces `fetch` (tests, server rendering). */
  fetch?: typeof fetch;
};

/** The buyer calls of the chat service HTTP API. */
export type ChatClient = {
  readonly baseUrl: string;
  readonly projectId: string;
  me(): Promise<ChatMe>;
  /** Opens or returns the pack thread of a service product. */
  openThread(productId: string): Promise<ChatThreadSummary>;
  /** Newest first; `before` is a message id. */
  messages(
    threadId: string,
    options?: { before?: string; limit?: number },
  ): Promise<ChatMessagePage>;
  /** Queues a message. The service answers 202 with `status: "pending"`. */
  send(
    threadId: string,
    input: { body: string; clientId?: string; attachment?: ChatAttachment },
  ): Promise<ChatSendResult>;
  uploadAttachment(threadId: string, file: File, progress: (value: number) => void): Promise<ChatAttachment>;
  attachmentURL(threadId: string, message: ChatMessage): Promise<string>;
  deleteMessage(threadId: string, messageId: string): Promise<void>;
  mute(threadId: string, muted: boolean): Promise<void>;
  report(input: {
    threadId: string;
    messageId?: string;
    reason: ChatReportReason;
    note?: string;
  }): Promise<void>;
  markRead(threadId: string, messageId: string): Promise<void>;
  /**
   * A NATS token for every conversation the caller may read. The answer is
   * kept until a minute and a half before it expires (the service mints one
   * per caller every 10 s); `fresh` asks for a new one.
   */
  realtimeToken(options?: { fresh?: boolean }): Promise<ChatRealtimeToken>;
};

export function createChatClient(options: ChatClientOptions): ChatClient {
  const baseUrl = (options.baseUrl || DEFAULT_CHAT_API_URL).replace(/\/+$/, "");
  const localOrigin = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname) ? window.location.origin : undefined;
  const attachmentBase = (options.attachmentsUrl ?? localOrigin ?? DEFAULT_CHAT_ATTACHMENTS_URL).replace(/\/+$/, "");
  const doFetch = options.fetch ?? ((...args) => fetch(...args));

  async function call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown }> {
    let response: Response;
    try {
      response = await doFetch(baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${options.token}`,
          "X-Bitsnap-Project": options.projectId,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ChatError("network", 0);
    }
    let json: unknown = null;
    try {
      const text = await response.text();
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      const data = isRecord(json) ? json : {};
      const code = typeof data.error === "string" ? data.error : "internal_error";
      throw new ChatError(code, response.status, data);
    }
    return { status: response.status, json };
  }

  const id = encodeURIComponent;
  let cachedToken: ChatRealtimeToken | undefined;

  return {
    baseUrl,
    projectId: options.projectId,
    async me() {
      const { json } = await call("GET", "/v1/me");
      return mapMe(json);
    },
    async openThread(productId) {
      const { json } = await call("POST", "/v1/threads", {
        product_id: productId,
      });
      return mapThread(json);
    },
    async messages(threadId, opts = {}) {
      const query = new URLSearchParams();
      if (opts.before) query.set("before", opts.before);
      if (opts.limit) query.set("limit", String(opts.limit));
      const qs = query.toString();
      const suffix = qs ? `?${qs}` : "";
      const { json } = await call(
        "GET",
        `/v1/threads/${id(threadId)}/messages${suffix}`,
      );
      const page = isRecord(json) ? json : {};
      return {
        messages: arr(page.messages).map(mapMessage),
        hasMore: page.has_more === true,
      };
    },
    async send(threadId, input) {
      const { json } = await call(
        "POST",
        `/v1/threads/${id(threadId)}/messages`,
        {
          body: input.body,
          ...(input.clientId ? { client_id: input.clientId } : {}),
          ...(input.attachment ? {
            attachment_key: input.attachment.key,
            attachment_kind: input.attachment.kind,
            attachment_name: input.attachment.filename,
            attachment_size: input.attachment.size,
            attachment_content_type: input.attachment.contentType,
          } : {}),
        },
      );
      const res = isRecord(json) ? json : {};
      return {
        message: mapMessage(res.message),
        thread: mapThreadState(res.thread),
      };
    },
    async uploadAttachment(threadId, file, progress) {
      const requestAttachment = async <T,>(path: string, body: unknown): Promise<T> => {
        const response = await doFetch(`${attachmentBase}/api/chat/attachments/${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${options.token}`, "X-Bitsnap-Project": options.projectId, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        let data: Record<string, unknown> = {};
        try { data = await response.json() as Record<string, unknown>; } catch { /* parsed as request error below */ }
        if (!response.ok) throw new ChatError(typeof data.error === "string" ? data.error : "request_failed", response.status, data);
        return data as T;
      };
      const ticket = await requestAttachment<{ key: string; uploadURL: string; uploadTicket: string }>("upload", {
        project_id: options.projectId, thread_id: threadId, filename: file.name, content_type: file.type, size: file.size,
      });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", ticket.uploadURL);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ChatError("upload_failed", xhr.status));
        xhr.onerror = () => reject(new ChatError("network", 0));
        xhr.send(file);
      });
      const done = await requestAttachment<{ key: string; kind: "image" | "file"; filename: string; size: number; content_type: string }>("complete", {
        project_id: options.projectId, thread_id: threadId, key: ticket.key, upload_ticket: ticket.uploadTicket, filename: file.name, content_type: file.type, size: file.size,
      });
      return { key: done.key, kind: done.kind, filename: done.filename, size: done.size, contentType: done.content_type };
    },
    async attachmentURL(threadId, message) {
      if (!message.attachmentKey) throw new ChatError("invalid_attachment", 400);
      const query = new URLSearchParams({ project_id: options.projectId, thread_id: threadId, key: message.attachmentKey, filename: message.attachmentName ?? "attachment", size: String(message.attachmentSize ?? 0) });
      const response = await doFetch(`${attachmentBase}/api/chat/attachments/read?${query}`, { headers: { Authorization: `Bearer ${options.token}`, "X-Bitsnap-Project": options.projectId } });
      let data: Record<string, unknown> = {};
      try { data = await response.json() as Record<string, unknown>; } catch { /* parsed as request error below */ }
      if (!response.ok || typeof data.url !== "string") throw new ChatError(typeof data.error === "string" ? data.error : "request_failed", response.status, data);
      return data.url;
    },
    async deleteMessage(threadId, messageId) {
      await call(
        "DELETE",
        `/v1/threads/${id(threadId)}/messages/${id(messageId)}`,
      );
    },
    async mute(threadId, muted) {
      await call("POST", `/v1/threads/${id(threadId)}/mute`, { muted });
    },
    async report(input) {
      await call("POST", "/v1/reports", {
        thread_id: input.threadId,
        ...(input.messageId ? { message_id: input.messageId } : {}),
        reason: input.reason,
        ...(input.note ? { note: input.note } : {}),
      });
    },
    async markRead(threadId, messageId) {
      await call("POST", `/v1/threads/${id(threadId)}/receipts`, {
        state: "read",
        message_id: messageId,
      });
    },
    async realtimeToken(opts = {}) {
      if (
        !opts.fresh &&
        cachedToken &&
        Date.parse(cachedToken.expiresAt) - Date.now() > 90_000
      ) {
        return cachedToken;
      }
      const { json } = await call("POST", "/v1/realtime/token");
      const res = isRecord(json) ? json : {};
      return (cachedToken = {
        jwt: str(res.jwt),
        expiresAt: str(res.expires_at),
        servers: arr(res.servers).filter((s): s is string => typeof s === "string"),
        subjects: arr(res.subjects).filter((s): s is string => typeof s === "string"),
        truncated: res.truncated === true,
      });
    },
  };
}

/** Parses one live event of the thread or channel subject. */
export function parseRealtimeEvent(raw: unknown): ChatRealtimeEvent | null {
  if (!isRecord(raw) || typeof raw.type !== "string") return null;
  const eventId = str(raw.id);
  switch (raw.type) {
    case "message.created":
      return { type: "message.created", message: mapMessage(raw) };
    case "message.updated":
      return { type: "message.updated", message: mapMessage(isRecord(raw.message) ? raw.message : raw) };
    case "message.rejected":
      return { type: "message.rejected", id: eventId, reason: str(raw.reason) };
    case "message.deleted":
    case "message.pinned":
    case "message.unpinned":
      return { type: raw.type, id: eventId };
    default:
      return null;
  }
}

// --- wire mapping -------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function optStr(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function time(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function mapMessage(raw: unknown): ChatMessage {
  const m = isRecord(raw) ? raw : {};
  const paymentRequest = m.kind === "payment_request" ? mapPaymentRequest(m.payment_request) : undefined;
  return {
    id: str(m.id),
    threadId: str(m.thread_id),
    authorEmail: str(m.author_email),
    body: str(m.body),
    kind: m.kind === "payment_request" ? "payment_request" : "text",
    ...(paymentRequest ? { paymentRequest } : {}),
    ...(m.kind === "payment_request" && !paymentRequest ? { paymentRequestInvalid: true } : {}),
    attachmentKey: optStr(m.attachment_key),
    attachmentKind: optStr(m.attachment_kind),
    attachmentName: optStr(m.attachment_name),
    attachmentSize: num(m.attachment_size),
    attachmentContentType: optStr(m.attachment_content_type),
    createdAt: str(m.created_at),
    pinned: m.pinned === true,
    deleted: m.deleted === true,
    system: m.system === true,
    ...(m.status === "pending" ? { status: "pending" as const } : {}),
  };
}

function mapPaymentRequest(raw: unknown): ChatMessage["paymentRequest"] {
  if (!isRecord(raw)) return undefined;
  const nullableNum = (value: unknown): number | null => value == null ? null : (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : NaN);
  const minAmountMinor = nullableNum(raw.min_amount_minor);
  const maxAmountMinor = nullableNum(raw.max_amount_minor);
  const amountMinor = raw.amount_minor;
  const extraReplies = raw.extra_replies;
  const extendExpiryDays = raw.extend_expiry_days;
  const validUrl = typeof raw.payment_url === "string" && /^https:\/\//i.test(raw.payment_url);
  if (
    typeof raw.request_id !== "string" || !raw.request_id ||
    typeof raw.title !== "string" || typeof raw.description !== "string" ||
    (raw.amount_mode !== "exact" && raw.amount_mode !== "pwyw") ||
    typeof amountMinor !== "number" || !Number.isFinite(amountMinor) || amountMinor < 0 ||
    Number.isNaN(minAmountMinor) || Number.isNaN(maxAmountMinor) ||
    (raw.amount_mode === "pwyw" && (minAmountMinor == null || maxAmountMinor == null || minAmountMinor > maxAmountMinor)) ||
    typeof raw.currency !== "string" || !/^[A-Z]{3}$/.test(raw.currency) ||
    typeof extraReplies !== "number" || !Number.isFinite(extraReplies) || extraReplies < 0 ||
    typeof extendExpiryDays !== "number" || !Number.isFinite(extendExpiryDays) || extendExpiryDays < 0 ||
    !validUrl || typeof raw.expires_at !== "string" || !Number.isFinite(Date.parse(raw.expires_at)) ||
    !["pending", "paid", "expired", "cancelled"].includes(String(raw.status)) ||
    (raw.paid_at != null && typeof raw.paid_at !== "string")
  ) return undefined;
  return {
    requestId: raw.request_id,
    title: raw.title,
    description: raw.description,
    amountMode: raw.amount_mode,
    amountMinor,
    minAmountMinor,
    maxAmountMinor,
    currency: raw.currency,
    extraReplies,
    extendExpiryDays,
    paymentUrl: raw.payment_url as string,
    status: raw.status as NonNullable<ChatMessage["paymentRequest"]>["status"],
    expiresAt: raw.expires_at as string,
    paidAt: raw.paid_at as string | null,
  };
}

function mapPack(raw: unknown): ChatPack {
  const p = isRecord(raw) ? raw : {};
  return {
    orderId: str(p.order_id),
    productId: optStr(p.product_id),
    replies: num(p.replies),
    used: num(p.used),
    left: num(p.left),
    expiresAt: time(p.expires_at),
    expired: p.expired === true,
  };
}

function mapThreadState(raw: unknown): ChatThreadState {
  const t = isRecord(raw) ? raw : {};
  return {
    id: str(t.id),
    kind: t.kind === "channel" ? "channel" : "pack",
    repliesTotal: num(t.replies_total),
    repliesUsed: num(t.replies_used),
    repliesLeft: num(t.replies_left),
    expiresAt: time(t.expires_at),
    composerLocked: t.composer_locked === true,
    responseHours: num(t.response_hours),
  };
}

export function mapThread(raw: unknown): ChatThreadSummary {
  const t = isRecord(raw) ? raw : {};
  return {
    ...mapThreadState(t),
    channelId: optStr(t.channel_id),
    title: str(t.title),
    lastMessage: isRecord(t.last_message) ? mapMessage(t.last_message) : undefined,
    unread: num(t.unread),
    productId: optStr(t.product_id),
    blocked: t.blocked === true,
    packs: arr(t.packs).map(mapPack),
    muted: t.muted === true,
  };
}

function mapChannel(raw: unknown): ChatChannelSummary {
  const c = isRecord(raw) ? raw : {};
  return {
    id: str(c.id),
    name: str(c.name),
    topic: str(c.topic),
    welcome: str(c.welcome),
    whoCanPost: c.who_can_post === "members" ? "members" : "creator",
    productId: str(c.product_id),
    role: str(c.role),
    memberCount: num(c.member_count),
    createdAt: str(c.created_at),
    blockLinks: c.block_links === true,
    blockMedia: c.block_media === true,
    cooldownSeconds: num(c.cooldown_seconds),
  };
}

function mapMe(raw: unknown): ChatMe {
  const m = isRecord(raw) ? raw : {};
  const ent = isRecord(m.entitlements) ? m.entitlements : {};
  return {
    email: str(m.email),
    threads: arr(m.threads).map(mapThread),
    entitlements: {
      packs: arr(ent.packs).map((raw) => {
        const p = isRecord(raw) ? raw : {};
        return {
          productId: str(p.product_id),
          name: str(p.name),
          repliesLeftHint: num(p.replies_left_hint),
          expiresAt: time(p.expires_at),
        };
      }),
      channels: arr(ent.channels).map((raw) => {
        const c = isRecord(raw) ? raw : {};
        return { productId: str(c.product_id), channelId: optStr(c.channel_id) };
      }),
    },
    channels: arr(m.channels).map(mapChannel),
  };
}
