/**
 * Buyer side of the Bitsnap chat service (`bitsnap-messaging`): the shapes
 * the library works with. The wire is snake_case JSON; `client.ts` maps it to
 * these camelCase types. Times are ISO 8601 strings, `null` when absent.
 */

/** Default base URL of the chat service. */
export const DEFAULT_CHAT_API_URL = "https://chat.bitsnap.pl";

/** Default NATS WebSocket URL, used when the realtime token lists no server. */
export const DEFAULT_CHAT_REALTIME_URL =
  "wss://bitsnap-nats-queue-production.up.railway.app";

/** One paid order that gives a pack thread creator replies. */
export type ChatPack = {
  orderId: string;
  productId?: string;
  replies: number;
  used: number;
  left: number;
  expiresAt: string | null;
  expired: boolean;
};

/** A stored message, or the pending answer of a send. */
export type ChatMessage = {
  id: string;
  threadId: string;
  authorEmail: string;
  body: string;
  attachmentKey?: string;
  attachmentKind?: string;
  createdAt: string;
  pinned: boolean;
  /** Soft deleted: the body is empty. */
  deleted: boolean;
  /** A message of the service, such as the creator's away notice. */
  system: boolean;
  /** `"pending"` in the answer of a send: queued, not stored yet. */
  status?: "pending";
};

/** The state of a conversation for the caller (`ThreadView` on the wire). */
export type ChatThreadSummary = {
  id: string;
  kind: "pack" | "channel";
  channelId?: string;
  /** For a buyer, the creator's e-mail (pack) or the channel name. */
  title: string;
  lastMessage?: ChatMessage;
  unread: number;
  repliesTotal: number;
  repliesUsed: number;
  repliesLeft: number;
  expiresAt: string | null;
  /** The caller cannot write: every pack has expired. */
  composerLocked: boolean;
  productId?: string;
  /** The creator's promise in hours ("odpowiedź w ciągu 48 h"), 0 for none. */
  responseHours: number;
  packs: ChatPack[];
  muted: boolean;
};

/** A channel the caller may read. */
export type ChatChannelSummary = {
  id: string;
  name: string;
  topic: string;
  welcome: string;
  whoCanPost: "creator" | "members";
  productId: string;
  /** `creator`, `member` or `muted`. */
  role: string;
  memberCount: number;
  createdAt: string;
  blockLinks: boolean;
  blockMedia: boolean;
  cooldownSeconds: number;
};

/** A pack the buyer holds and has not opened a thread for yet. */
export type ChatPackEntitlement = {
  productId: string;
  name: string;
  repliesLeftHint: number;
  expiresAt: string | null;
};

/** A community product the buyer holds; `channelId` once a channel is bound. */
export type ChatChannelEntitlement = {
  productId: string;
  channelId?: string;
};

/** `GET /v1/me`: the buyer's chat in one project. */
export type ChatMe = {
  email: string;
  threads: ChatThreadSummary[];
  entitlements: {
    packs: ChatPackEntitlement[];
    channels: ChatChannelEntitlement[];
  };
  channels: ChatChannelSummary[];
};

/** One page of history, newest first as the service answers it. */
export type ChatMessagePage = {
  messages: ChatMessage[];
  hasMore: boolean;
};

/** The thread part of a send answer. */
export type ChatThreadState = Pick<
  ChatThreadSummary,
  | "id"
  | "kind"
  | "repliesTotal"
  | "repliesUsed"
  | "repliesLeft"
  | "expiresAt"
  | "composerLocked"
  | "responseHours"
>;

/** `POST /v1/threads/{id}/messages` answers 202 with the queued message. */
export type ChatSendResult = {
  message: ChatMessage;
  thread: ChatThreadState;
};

export type ChatReportReason = "spam" | "abuse" | "illegal" | "other";

/** `POST /v1/realtime/token`. */
export type ChatRealtimeToken = {
  jwt: string;
  expiresAt: string;
  servers: string[];
  subjects: string[];
  truncated: boolean;
};

/** Live events on the thread or channel subject. */
export type ChatRealtimeEvent =
  | { type: "message.created"; message: ChatMessage }
  | { type: "message.rejected"; id: string; reason: string }
  | { type: "message.deleted"; id: string }
  | { type: "message.pinned"; id: string }
  | { type: "message.unpinned"; id: string };

/** How a conversation hears about new messages. */
export type ChatLiveMode = "connecting" | "live" | "polling" | "off";
