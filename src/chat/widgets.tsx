import { useEffect, useMemo, useRef, useState } from "react";
import { getLocale } from "../components/checkout/locale";
import { getPanelConfig } from "../panel/config";
import { getPanelSession } from "../panel/session-storage";
import { addPackToCart } from "./buy";
import { createChatClient, type ChatClient } from "./client";
import { ConversationView } from "./Conversation";
import type { NatsModule } from "./realtime";
import { getChatTexts, type ChatTexts } from "./texts";
import { useConversation, type ConversationLock } from "./useConversation";

/** What the lock's buy action gets. */
export type ChatBuyRequest = {
  /** The product (or variant) to sell: `buyProductId`, else the locked product. */
  productId: string;
  /** `replies`, `expired`, `no-pack` or `no-access`. */
  reason: ConversationLock["reason"];
  /** Known for a locked channel (from the chat service). */
  priceCents?: number;
  amount?: number;
  email?: string;
  code?: string;
  turnstileToken?: string;
};

/** Props shared by `ChatThread` and `Channel`. */
export type ChatWidgetBaseProps = {
  /**
   * Public Bitsnap project id of the shop. The cart uses it, the panel
   * session is looked up with it, and it is the `X-Bitsnap-Project` of the
   * chat service unless `chatProjectID` is given.
   */
  projectID: string;
  /** Project id for the chat service, when it differs from `projectID`. */
  chatProjectID?: string;
  /**
   * Bearer for the chat service: a `bcht_` buyer token from your server
   * (`POST /api/v1/chat/buyer-token`). Defaults to the customer panel session
   * of this browser (after `PanelLogin`).
   */
  token?: string;
  /** Chat service base URL. Defaults to `https://chat.bitsnap.pl`. */
  apiUrl?: string;
  /** Bitsnap app host serving private chat attachment APIs (defaults to the page origin). */
  attachmentsUrl?: string;
  /** NATS WebSocket URL overriding the one of the realtime token. */
  realtimeUrl?: string;
  /** Bitsnap host of the panel session (`setHost`), when not the default. */
  host?: string;
  /** Polling interval in ms while the live connection is down. Default 8000. */
  pollIntervalMs?: number;
  /** Language of the default texts; defaults to the library locale. */
  locale?: string;
  /** Text overrides, whatever the locale. */
  texts?: Partial<ChatTexts>;
  /** Heading of the conversation. */
  title?: string;
  /** Shows a back button in the header. */
  onBack?: () => void;
  /**
   * The lock's "Kup pakiet" / "Kup dostęp". Default: add the product to the
   * page cart and open it (mount `BitsnapCheckout` on the page). Throw to
   * show the error line.
   */
  onBuy?: (request: ChatBuyRequest) => Promise<void> | void;
  /** The product or variant the buy action sells (e.g. the pack variant). */
  buyProductId?: string;
  className?: string;
  /** A ready client (tests, custom transport). Replaces token and URLs. */
  client?: ChatClient;
  /** @internal Replaces the NATS loader (tests). */
  loadNats?: () => Promise<NatsModule>;
};

export type ChatThreadProps = ChatWidgetBaseProps & {
  /** The service product of the pack: opens its thread, creating it if needed. */
  productId?: string;
  /** An existing thread. Give this or `productId`. */
  threadId?: string;
};

export type ChannelProps = ChatWidgetBaseProps & {
  /** The channel (its id is also the id of its conversation). */
  channelId: string;
  /** The community product sold by the lock; defaults to the channel's own. */
  productId?: string;
};

/**
 * The chat client of a widget. The panel session lives in localStorage, so
 * it is read after mounting (`null` until then: the widget stays loading and
 * the server HTML has no session-dependent content).
 */
function useWidgetClient(props: ChatWidgetBaseProps): ChatClient | null | undefined {
  const [stored, setStored] = useState<string | undefined | null>(null);
  const host = props.host ?? getPanelConfig().host;
  useEffect(() => {
    if (props.client || props.token) return;
    setStored(getPanelSession(props.projectID, host));
  }, [props.client, props.token, props.projectID, host]);
  const token = props.token ?? stored;
  const projectId = props.chatProjectID ?? props.projectID;
  return useMemo(() => {
    if (props.client) return props.client;
    if (token === null) return null;
    if (!token) return undefined;
    return createChatClient({ projectId, token, baseUrl: props.apiUrl, attachmentsUrl: props.attachmentsUrl });
  }, [props.client, token, projectId, props.apiUrl, props.attachmentsUrl]);
}

function useBuy(props: ChatWidgetBaseProps) {
  const claim = useRef<{ key: string; token: string; expires: number } | null>(null);
  return async (lock: ConversationLock & { email?: string; code?: string; turnstileToken?: string }) => {
    const productId = props.buyProductId ?? lock.productId;
    if (!productId) return;
    const request: ChatBuyRequest = { productId, reason: lock.reason, priceCents: lock.priceCents, ...(lock.amount != null ? { amount: lock.amount } : {}), ...(lock.email ? { email: lock.email } : {}), ...(lock.code ? { code: lock.code } : {}), ...(lock.turnstileToken != null ? { turnstileToken: lock.turnstileToken } : {}) };
    if (props.onBuy) {
      await props.onBuy(request);
      return;
    }
    const commerceBase = (props.host ?? getPanelConfig().host ?? "https://bitsnap.pl").replace(/\/+$/, "");
    const isFreeClaim = lock.freeClaimLimit != null && (lock.priceType === "free" || (lock.priceType === "pay_what_you_want" && lock.minimumCents === 0 && request.amount === 0));
    if (isFreeClaim && request.email && request.turnstileToken != null) {
      claim.current = null;
      const response = await fetch(`${commerceBase}/api/integrations/${encodeURIComponent(props.projectID)}/public-commerce/free-claim/request-code`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: request.email, turnstileToken: request.turnstileToken }),
      });
      const result = await response.json() as { code?: string };
      if (!response.ok) throw new Error(result.code ?? "internal");
      return;
    }
    if (isFreeClaim && request.email && request.code) {
      const key = JSON.stringify([commerceBase, props.projectID, productId, request.email, request.code]);
      if (!claim.current || claim.current.key !== key || claim.current.expires <= Date.now()) {
        claim.current = null;
        const verify = await fetch(`${commerceBase}/api/integrations/${encodeURIComponent(props.projectID)}/public-commerce/free-claim/verify-code`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: request.email, code: request.code }),
        });
        const verified = await verify.json() as { claimToken?: string; code?: string; expiresIn?: number };
        if (!verify.ok || !verified.claimToken) throw new Error(verified.code ?? "email-verification-required");
        claim.current = { key, token: verified.claimToken, expires: Date.now() + (verified.expiresIn ?? 600) * 1000 };
      }
      const bought = await fetch(`${commerceBase}/api/integrations/${encodeURIComponent(props.projectID)}/public-commerce/buy`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ id: productId, quantity: 1, amount: 0 }], details: { email: request.email }, claimToken: claim.current.token }),
      });
      const result = await bought.json() as { success?: boolean; url?: string; code?: string };
      if (!bought.ok || !result.url) throw new Error(result.code ?? "free-order-not-supported");
      window.location.assign(result.url);
      return;
    }
    await addPackToCart({
      projectID: props.projectID,
      productId,
      name: props.title,
      priceCents: lock.priceCents,
      amount: lock.amount,
      host: props.host,
    });
  };
}

/**
 * A buyer's pack thread for one service product: history, live updates,
 * sending with pending and refused states, report and mute, and the lock
 * with "Kup pakiet" when the replies are used up or the pack expired.
 * Load `bitsnap-react/dist/index.css` once.
 */
export function ChatThread(props: ChatThreadProps) {
  const client = useWidgetClient(props);
  const locale = props.locale ?? getLocale();
  const texts = useMemo(() => getChatTexts(props.texts, locale), [props.texts, locale]);
  const conversation = useConversation({
    client,
    target: { kind: "thread", threadId: props.threadId, productId: props.productId },
    pollIntervalMs: props.pollIntervalMs,
    realtimeUrl: props.realtimeUrl,
    loadNats: props.loadNats,
  });
  const buy = useBuy(props);
  return (
    <div className="bitsnap-react h-full">
      <ConversationView
        host={props.host}
        conversation={conversation}
        texts={texts}
        locale={locale}
        kind="thread"
        title={props.title}
        onBack={props.onBack}
        onBuy={buy}
        className={props.className}
      />
    </div>
  );
}

/**
 * A community channel: messages, live updates, posting when the channel
 * allows it (with the channel's moderation refusals shown on the message),
 * report, and the lock with "Kup dostęp" for a buyer without a grant.
 * Load `bitsnap-react/dist/index.css` once.
 */
export function Channel(props: ChannelProps) {
  const client = useWidgetClient(props);
  const locale = props.locale ?? getLocale();
  const texts = useMemo(() => getChatTexts(props.texts, locale), [props.texts, locale]);
  const conversation = useConversation({
    client,
    target: { kind: "channel", channelId: props.channelId, productId: props.productId },
    pollIntervalMs: props.pollIntervalMs,
    realtimeUrl: props.realtimeUrl,
    loadNats: props.loadNats,
  });
  const buy = useBuy(props);
  return (
    <div className="bitsnap-react h-full">
      <ConversationView
        host={props.host}
        conversation={conversation}
        texts={texts}
        locale={locale}
        kind="channel"
        title={props.title}
        onBack={props.onBack}
        onBuy={buy}
        className={props.className}
      />
    </div>
  );
}
