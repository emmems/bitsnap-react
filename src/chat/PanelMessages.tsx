import { Hash, MessageCircle } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { getLocale } from "../components/checkout/locale";
import {
  UserProductType,
  type UserProduct,
} from "../gen/proto/public/v1/public_api_pb";
import { cn } from "../lib/utils";
import { addPackToCart } from "./buy";
import { ChatError, createChatClient, type ChatClient } from "./client";
import {
  fill,
  formatChatDate,
  formatMessageTime,
  getChatTexts,
  repliesLeftText,
  type ChatTexts,
} from "./texts";
import type { ChatMe } from "./types";
import { Channel, ChatThread, type ChatBuyRequest } from "./widgets";

const BitsnapCheckout = lazy(() => import("../components/checkout/BitsnapCart"));

/** Which conversation the panel shows (kept in the URL). */
export type PanelMessagesSelection = {
  /** Chat project of the conversation. */
  chatProject?: string;
  thread?: string;
  channel?: string;
};

export type PanelMessagesProps = {
  accessToken: string;
  /** Panel products: CHAT and COMMUNITY items name the conversations. */
  products: UserProduct[];
  /** `chat_api_url` of the products answer. */
  chatApiUrl?: string;
  /** Project of the panel, used when no chat product names one. */
  projectID?: string;
  host?: string;
  selection: PanelMessagesSelection;
  onSelect: (selection: PanelMessagesSelection) => void;
  locale?: string;
  texts?: Partial<ChatTexts>;
};

type ProjectLoad =
  | { status: "loading" }
  | { status: "ready"; me: ChatMe }
  | { status: "error"; error: ChatError };

const isChatProduct = (product: UserProduct) =>
  product.productType === UserProductType.CHAT ||
  product.productType === UserProductType.COMMUNITY;

/**
 * The projects whose chat the buyer may have: those of the CHAT and
 * COMMUNITY products, else the panel's project.
 *
 * `UserProduct.projectId` is what the panel knows of a project. The chat
 * service wants its numeric id (`X-Bitsnap-Project`); see the README.
 */
export function chatProjects(products: UserProduct[], fallback?: string): string[] {
  const ids = [...new Set(products.filter(isChatProduct).map((p) => p.projectId).filter(Boolean))];
  if (ids.length > 0) return ids;
  return fallback ? [fallback] : [];
}

/** The "Wiadomości" screen of the customer panel. */
export default function PanelMessages({
  accessToken,
  products,
  chatApiUrl,
  projectID,
  host,
  selection,
  onSelect,
  locale = getLocale(),
  texts: overrides,
}: PanelMessagesProps) {
  const texts = useMemo(() => getChatTexts(overrides, locale), [overrides, locale]);
  const projects = useMemo(() => chatProjects(products, projectID), [products, projectID]);
  const clients = useMemo(() => {
    const map = new Map<string, ChatClient>();
    for (const id of projects)
      map.set(id, createChatClient({ projectId: id, token: accessToken, baseUrl: chatApiUrl }));
    return map;
  }, [projects, accessToken, chatApiUrl]);

  const [loads, setLoads] = useState<Record<string, ProjectLoad>>({});
  const [generation, setGeneration] = useState(0);
  const selectedKey = `${selection.chatProject ?? ""}:${selection.thread ?? ""}:${selection.channel ?? ""}`;

  // Reloaded when the buyer leaves a conversation, so unread counts and
  // replies left are fresh.
  useEffect(() => {
    let cancelled = false;
    for (const [id, client] of clients) {
      setLoads((all) => (all[id]?.status === "ready" ? all : { ...all, [id]: { status: "loading" } }));
      client.me().then(
        (me) => !cancelled && setLoads((all) => ({ ...all, [id]: { status: "ready", me } })),
        (error) =>
          !cancelled &&
          setLoads((all) => ({
            ...all,
            [id]: {
              status: "error",
              error: error instanceof ChatError ? error : new ChatError("internal_error", 0),
            },
          })),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [clients, generation, selectedKey]);

  const productName = useMemo(() => {
    const map = new Map<string, UserProduct>();
    for (const product of products) map.set(product.productId, product);
    return map;
  }, [products]);

  const [checkoutProject, setCheckoutProject] = useState<string>();
  const buyFor = (project: string) => async (request: ChatBuyRequest) => {
    setCheckoutProject(project);
    await addPackToCart({
      projectID: project,
      productId: request.productId,
      name: productName.get(request.productId)?.productName,
      priceCents: request.priceCents,
      host,
    });
  };

  const selectedClient = selection.chatProject ? clients.get(selection.chatProject) : undefined;
  const hasSelection = Boolean(selectedClient && (selection.thread || selection.channel));
  const back = () => onSelect({});

  let conversation = null;
  if (hasSelection && selectedClient && selection.chatProject) {
    const project = selection.chatProject;
    const load = loads[project];
    const me = load?.status === "ready" ? load.me : undefined;
    if (selection.thread) {
      const thread = me?.threads.find((t) => t.id === selection.thread);
      conversation = (
        <ChatThread
          key={`t:${project}:${selection.thread}`}
          projectID={project}
          client={selectedClient}
          threadId={selection.thread}
          title={(thread?.productId && productName.get(thread.productId)?.productName) || undefined}
          locale={locale}
          texts={overrides}
          onBack={back}
          onBuy={buyFor(project)}
        />
      );
    } else if (selection.channel) {
      const entitlement = me?.entitlements.channels.find((c) => c.channelId === selection.channel);
      conversation = (
        <Channel
          key={`c:${project}:${selection.channel}`}
          projectID={project}
          client={selectedClient}
          channelId={selection.channel}
          productId={entitlement?.productId}
          locale={locale}
          texts={overrides}
          onBack={back}
          onBuy={buyFor(project)}
        />
      );
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn(hasSelection && "hidden md:block")}>
        <h3 className="text-2xl">{texts.inboxHeading}</h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{texts.inboxIntro}</p>
      </div>
      <div className="mt-6 grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(16rem,22rem)_1fr]">
        <div className={cn("min-w-0", hasSelection && "hidden md:block")}>
          <Inbox
            projects={projects}
            loads={loads}
            clients={clients}
            products={products}
            texts={texts}
            locale={locale}
            selection={selection}
            onSelect={onSelect}
            onRetry={() => setGeneration((g) => g + 1)}
          />
        </div>
        <div className={cn("min-h-[32rem] min-w-0 md:h-[calc(100dvh-10rem)]", !hasSelection && "hidden md:flex")}>
          {conversation ?? (
            <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-neutral-300 p-6 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
              {texts.selectConversation}
            </div>
          )}
        </div>
      </div>
      {checkoutProject && (
        <Suspense fallback={null}>
          <BitsnapCheckout projectID={checkoutProject} locale={locale} />
        </Suspense>
      )}
    </div>
  );
}

type InboxProps = {
  projects: string[];
  loads: Record<string, ProjectLoad>;
  clients: Map<string, ChatClient>;
  products: UserProduct[];
  texts: ChatTexts;
  locale: string;
  selection: PanelMessagesSelection;
  onSelect: (selection: PanelMessagesSelection) => void;
  onRetry: () => void;
};

const rowClass =
  "flex min-h-11 w-full min-w-0 items-start gap-3 rounded-xl p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500";

function Inbox({ projects, loads, clients, products, texts, locale, selection, onSelect, onRetry }: InboxProps) {
  const [opening, setOpening] = useState<string>();
  const [openError, setOpenError] = useState<string>();
  const byProduct = new Map(products.map((p) => [p.productId, p] as const));
  const multiProject = projects.length > 1;
  const states = projects.map((id) => loads[id] ?? ({ status: "loading" } as const));

  if (states.length > 0 && states.every((s) => s.status === "loading")) {
    return (
      <div role="status" aria-busy="true" aria-label={texts.loading} className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} aria-hidden="true" className="h-20 rounded-xl bg-white motion-safe:animate-pulse dark:bg-neutral-800" />
        ))}
      </div>
    );
  }

  if (states.length === 0 || states.every((s) => s.status === "error")) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3" data-testid="chat-inbox-error">
        <p className="text-sm text-neutral-700 dark:text-neutral-300">{texts.inboxError}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-current dark:bg-white dark:text-neutral-900"
        >
          {texts.retry}
        </button>
      </div>
    );
  }

  const rows: ReactNode[] = [];
  const starts: ReactNode[] = [];
  for (const project of projects) {
    const load = loads[project];
    if (load?.status !== "ready") continue;
    const { me } = load;
    const projectName = multiProject
      ? products.find((p) => p.projectId === project)?.projectName
      : undefined;

    for (const thread of me.threads) {
      const product = thread.productId ? byProduct.get(thread.productId) : undefined;
      const selected = selection.chatProject === project && selection.thread === thread.id;
      const meta = [repliesLeftText(texts, thread.repliesLeft, locale)];
      if (thread.expiresAt)
        meta.push(
          fill(thread.composerLocked ? texts.expiredOn : texts.expiresOn, {
            date: formatChatDate(thread.expiresAt, locale),
          }),
        );
      if (thread.responseHours > 0) meta.push(fill(texts.responseHours, { hours: thread.responseHours }));
      const last = thread.lastMessage;
      rows.push(
        <li key={`t:${project}:${thread.id}`}>
          <button
            type="button"
            data-thread-id={thread.id}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect({ chatProject: project, thread: thread.id })}
            className={cn(rowClass, selected ? "bg-neutral-200 dark:bg-neutral-800" : "bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800")}
          >
            <MessageCircle className="mt-0.5 size-5 shrink-0 text-neutral-500 dark:text-neutral-400" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline gap-2">
                <span className={cn("truncate", thread.unread > 0 ? "font-semibold" : "font-medium")}>
                  {product?.productName || thread.title || texts.chatFallbackTitle}
                </span>
                {last && (
                  <time dateTime={last.createdAt} className="ml-auto shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                    {formatMessageTime(last.createdAt, locale)}
                  </time>
                )}
              </span>
              {projectName && <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">{projectName}</span>}
              <span className="flex items-center gap-2">
                <span className="line-clamp-1 flex-1 text-sm text-neutral-600 dark:text-neutral-300">
                  {last ? (last.deleted ? texts.deletedPlaceholder : last.body) : texts.noMessagesYet}
                </span>
                {thread.unread > 0 && (
                  <span
                    aria-label={fill(texts.unread, { count: thread.unread })}
                    className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 px-1.5 text-xs font-semibold text-white tabular-nums dark:bg-white dark:text-neutral-900"
                  >
                    {thread.unread}
                  </span>
                )}
              </span>
              <span className={cn("text-xs", thread.repliesLeft <= 0 || thread.composerLocked ? "text-amber-800 dark:text-amber-300" : "text-neutral-500 dark:text-neutral-400")}>
                {meta.join(" · ")}
                {thread.muted && ` · ${texts.mutedBadge}`}
              </span>
            </span>
          </button>
        </li>,
      );
    }

    for (const channel of me.channels) {
      const selected = selection.chatProject === project && selection.channel === channel.id;
      rows.push(
        <li key={`c:${project}:${channel.id}`}>
          <button
            type="button"
            data-channel-id={channel.id}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect({ chatProject: project, channel: channel.id })}
            className={cn(rowClass, selected ? "bg-neutral-200 dark:bg-neutral-800" : "bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800")}
          >
            <Hash className="mt-0.5 size-5 shrink-0 text-neutral-500 dark:text-neutral-400" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">{channel.name || texts.channelFallbackTitle}</span>
              {projectName && <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">{projectName}</span>}
              <span className="line-clamp-1 text-sm text-neutral-600 dark:text-neutral-300">
                {channel.topic || texts.kindChannel}
              </span>
              {channel.memberCount > 0 && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {fill(texts.members, { count: channel.memberCount })}
                </span>
              )}
            </span>
          </button>
        </li>,
      );
    }

    for (const pack of me.entitlements.packs) {
      const key = `${project}:${pack.productId}`;
      const name = byProduct.get(pack.productId)?.productName || pack.name || texts.chatFallbackTitle;
      starts.push(
        <li key={`p:${key}`} className="flex flex-col gap-2 rounded-xl bg-white p-3 dark:bg-neutral-900 sm:flex-row sm:items-center">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-medium">{name}</span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {[
                repliesLeftText(texts, pack.repliesLeftHint, locale),
                pack.expiresAt ? fill(texts.expiresOn, { date: formatChatDate(pack.expiresAt, locale) }) : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <button
            type="button"
            disabled={opening === key}
            aria-busy={opening === key || undefined}
            onClick={async () => {
              const client = clients.get(project);
              if (!client) return;
              setOpening(key);
              setOpenError(undefined);
              try {
                const thread = await client.openThread(pack.productId);
                onSelect({ chatProject: project, thread: thread.id });
              } catch {
                setOpenError(key);
              } finally {
                setOpening(undefined);
              }
            }}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {opening === key ? texts.loading : texts.startChat}
          </button>
          {openError === key && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400 sm:basis-full">
              {texts.errorGeneric}
            </p>
          )}
        </li>,
      );
    }

    const listed = new Set(me.channels.map((c) => c.id));
    for (const entitlement of me.entitlements.channels) {
      if (entitlement.channelId && listed.has(entitlement.channelId)) continue;
      const name = byProduct.get(entitlement.productId)?.productName || texts.channelFallbackTitle;
      starts.push(
        <li key={`e:${project}:${entitlement.productId}`} className="flex flex-col gap-2 rounded-xl bg-white p-3 dark:bg-neutral-900 sm:flex-row sm:items-center">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-medium">{name}</span>
            {!entitlement.channelId && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">{texts.channelNotReady}</span>
            )}
          </span>
          {entitlement.channelId && (
            <button
              type="button"
              onClick={() => onSelect({ chatProject: project, channel: entitlement.channelId })}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {texts.openChannel}
            </button>
          )}
        </li>,
      );
    }
  }

  if (rows.length === 0 && starts.length === 0) {
    return (
      <p data-testid="chat-inbox-empty" className="text-sm text-neutral-600 dark:text-neutral-400">
        {texts.inboxEmpty}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="chat-inbox">
      {rows.length > 0 && <ul className="flex flex-col gap-2">{rows}</ul>}
      {starts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{texts.startSection}</h4>
          <ul className="flex flex-col gap-2">{starts}</ul>
        </section>
      )}
    </div>
  );
}
