/**
 * `bitsnap-react/chat` subpath: the buyer chat (pack threads and community
 * channels of the Bitsnap chat service). `Panel` and the `ChatThread` /
 * `Channel` exports of the main entry load it on demand, so the main bundle
 * does not carry it; the NATS client is loaded only when a conversation
 * opens. Load `bitsnap-react/dist/index.css` once.
 */
export {
  Channel,
  ChatThread,
  type ChannelProps,
  type ChatBuyRequest,
  type ChatThreadProps,
  type ChatWidgetBaseProps,
} from "./widgets";
export {
  default as PanelMessages,
  chatProjects,
  type PanelMessagesProps,
  type PanelMessagesSelection,
} from "./PanelMessages";
export {
  ChatError,
  createChatClient,
  parseRealtimeEvent,
  type ChatClient,
  type ChatClientOptions,
} from "./client";
export { startLive, type LiveOptions } from "./realtime";
export {
  useConversation,
  type ConversationLock,
  type ConversationMessage,
  type ConversationTarget,
  type UseConversationOptions,
} from "./useConversation";
export { addPackToCart, type BuyPackInput } from "./buy";
export { CHAT_TEXT_TABLES, getChatTexts, type ChatTexts } from "./texts";
export {
  DEFAULT_CHAT_API_URL,
  DEFAULT_CHAT_REALTIME_URL,
  type ChatChannelEntitlement,
  type ChatChannelSummary,
  type ChatLiveMode,
  type ChatMe,
  type ChatMessage,
  type ChatMessagePage,
  type ChatPack,
  type ChatPackEntitlement,
  type ChatRealtimeEvent,
  type ChatRealtimeToken,
  type ChatReportReason,
  type ChatSendResult,
  type ChatThreadState,
  type ChatThreadSummary,
} from "./types";
