import {
  AlertCircle,
  ArrowLeft,
  Clock,
  Lock,
  MoreHorizontal,
  Paperclip,
  Pin,
  SendHorizontal,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "../lib/utils";
import {
  fill,
  formatChatDate,
  formatMessageTime,
  rejectionText,
  repliesLeftText,
  type ChatTexts,
} from "./texts";
import type { ChatReportReason } from "./types";
import type {
  ConversationActions,
  ConversationLock,
  ConversationMessage,
  ConversationState,
} from "./useConversation";

export type ConversationViewProps = {
  conversation: ConversationState & ConversationActions;
  texts: ChatTexts;
  locale: string;
  kind: "thread" | "channel";
  /** Heading; defaults to the thread title or the channel name. */
  title?: string;
  onBack?: () => void;
  /** The lock's buy action. Rejects to show the error. */
  onBuy?: (lock: ConversationLock) => Promise<void> | void;
  className?: string;
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500";

const quietButton = cn(
  "inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
  focusRing,
);

const primaryButton = cn(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200",
  focusRing,
);

/** The shared body of `ChatThread`, `Channel` and the panel screen. */
export function ConversationView({
  conversation: c,
  texts,
  locale,
  kind,
  title,
  onBack,
  onBuy,
  className,
}: ConversationViewProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState<{ messageId?: string } | null>(null);
  const [notice, setNotice] = useState<string>();
  const [draft, setDraft] = useState("");
  const [reportSent, setReportSent] = useState(false);
  useEffect(() => {
    if (!reportSent) return;
    const timer = setTimeout(() => setReportSent(false), 6000);
    return () => clearTimeout(timer);
  }, [reportSent]);
  const heading =
    title ||
    c.channel?.name ||
    (kind === "channel" ? texts.channelFallbackTitle : texts.chatFallbackTitle);

  const meta = metaLine(c, texts, locale);

  return (
    <section
      data-bitsnap-chat={kind}
      aria-label={heading}
      className={cn(
        "flex h-full min-h-[28rem] w-full min-w-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50",
        className,
      )}
    >
      <header className="flex items-start gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={texts.back}
            className={cn(quietButton, "w-11 justify-center px-0")}
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </button>
        )}
        <div className="min-w-0 flex-1 py-1.5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <span className="truncate">{heading}</span>
            <LiveDot live={c.live} texts={texts} />
          </h2>
          {meta.length > 0 && (
            <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-600 dark:text-neutral-400">
              {meta.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </p>
          )}
        </div>
        {c.status === "ready" && (
          <button
            type="button"
            aria-label={texts.conversationActions}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(quietButton, "w-11 justify-center px-0")}
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
          </button>
        )}
      </header>
      {menuOpen && c.status === "ready" && (
        <div className="flex flex-wrap gap-1 border-b border-neutral-200 bg-neutral-50 px-3 py-1 dark:border-neutral-800 dark:bg-neutral-950">
          {kind === "thread" && c.thread && (
            <button
              type="button"
              className={quietButton}
              onClick={async () => {
                setMenuOpen(false);
                try {
                  await c.setMuted(!c.thread!.muted);
                  setNotice(undefined);
                } catch {
                  setNotice(texts.muteError);
                }
              }}
            >
              {c.thread.muted ? texts.unmuteThread : texts.muteThread}
            </button>
          )}
          <button
            type="button"
            className={quietButton}
            onClick={() => {
              setMenuOpen(false);
              setReporting({});
            }}
          >
            {texts.reportConversation}
          </button>
        </div>
      )}

      {c.status === "loading" && <LoadingBody texts={texts} />}
      {c.status === "error" && <ErrorBody conversation={c} texts={texts} />}
      {c.status === "locked" && c.lock && (
        <div className="flex flex-1 flex-col justify-center overflow-y-auto p-4">
          <LockCard lock={c.lock} kind={kind} texts={texts} onBuy={onBuy} prominent />
        </div>
      )}
      {c.status === "ready" && (
        <>
          <MessageList
            conversation={c}
            texts={texts}
            locale={locale}
            kind={kind}
            onReport={(messageId) => setReporting({ messageId })}
            onEdit={(message) => {
              setDraft(message.body);
              c.discard(message.id);
            }}
          />
          {notice && (
            <p role="status" className="px-4 pb-2 text-xs text-red-700 dark:text-red-400">
              {notice}
            </p>
          )}
          {c.lock && (
            <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
              <LockCard lock={c.lock} kind={kind} texts={texts} onBuy={onBuy} />
            </div>
          )}
          {reporting ? (
            <ReportForm
              texts={texts}
              messageId={reporting.messageId}
              onCancel={() => setReporting(null)}
              onSubmit={async (reason, note) => {
                await c.report({ messageId: reporting.messageId, reason, note });
                setReporting(null);
                setNotice(undefined);
                setReportSent(true);
              }}
            />
          ) : (
            <Composer
              conversation={c}
              texts={texts}
              kind={kind}
              draft={draft}
              setDraft={setDraft}
            />
          )}
        </>
      )}
      {reportSent && (
        <p role="status" className="border-t border-neutral-200 px-4 py-2 text-xs text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
          {texts.reportSent}
        </p>
      )}
    </section>
  );
}

function metaLine(c: ConversationState, texts: ChatTexts, locale: string): string[] {
  const items: string[] = [];
  if (c.thread && c.thread.kind === "pack") {
    items.push(repliesLeftText(texts, c.thread.repliesLeft, locale));
    if (c.thread.expiresAt) {
      const date = formatChatDate(c.thread.expiresAt, locale);
      items.push(
        fill(c.thread.composerLocked ? texts.expiredOn : texts.expiresOn, { date }),
      );
    }
    if (c.thread.responseHours > 0)
      items.push(fill(texts.responseHours, { hours: c.thread.responseHours }));
    if (c.thread.muted) items.push(texts.mutedBadge);
  }
  if (c.channel) {
    if (c.channel.topic) items.push(c.channel.topic);
    if (c.channel.memberCount > 0)
      items.push(fill(texts.members, { count: c.channel.memberCount }));
  }
  return items;
}

function LiveDot({ live, texts }: { live: ConversationState["live"]; texts: ChatTexts }) {
  if (live !== "live" && live !== "polling") return null;
  const label = live === "live" ? texts.liveLabel : texts.pollingLabel;
  return (
    <span
      title={label}
      data-live={live}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        live === "live" ? "bg-emerald-500" : "bg-neutral-400 dark:bg-neutral-500",
      )}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}

function LoadingBody({ texts }: { texts: ChatTexts }) {
  return (
    <div role="status" aria-busy="true" aria-label={texts.loading} className="flex flex-1 flex-col gap-3 p-4">
      {[60, 40, 70].map((width, index) => (
        <div
          key={index}
          aria-hidden="true"
          style={{ width: `${width}%` }}
          className={cn(
            "h-10 rounded-2xl bg-neutral-100 motion-safe:animate-pulse dark:bg-neutral-800",
            index === 1 && "self-end",
          )}
        />
      ))}
    </div>
  );
}

function errorText(code: string, texts: ChatTexts): string {
  switch (code) {
    case "no_token":
      return texts.errorNoToken;
    case "unauthorized":
      return texts.errorUnauthorized;
    case "plan_required":
      return texts.errorPlan;
    case "not_found":
      return texts.errorNotFound;
    case "unavailable":
    case "network":
      return texts.errorUnavailable;
    default:
      return texts.errorGeneric;
  }
}

function ErrorBody({
  conversation: c,
  texts,
}: {
  conversation: ConversationState & ConversationActions;
  texts: ChatTexts;
}) {
  const code = c.error?.code ?? "";
  const canRetry = code !== "no_token" && code !== "plan_required" && code !== "unauthorized";
  return (
    <div role="alert" className="flex flex-1 flex-col items-start justify-center gap-3 p-4">
      <p className="text-sm text-neutral-700 dark:text-neutral-300">{errorText(code, texts)}</p>
      {canRetry && (
        <button type="button" className={primaryButton} onClick={c.reload}>
          {texts.retry}
        </button>
      )}
    </div>
  );
}

function LockCard({
  lock,
  kind,
  texts,
  onBuy,
  prominent,
}: {
  lock: ConversationLock;
  kind: "thread" | "channel";
  texts: ChatTexts;
  onBuy?: ConversationViewProps["onBuy"];
  prominent?: boolean;
}) {
  const [buying, setBuying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [title, body] =
    lock.reason === "replies"
      ? [texts.lockRepliesTitle, texts.lockRepliesBody]
      : lock.reason === "expired"
        ? [texts.lockExpiredTitle, texts.lockExpiredBody]
        : kind === "channel"
          ? [texts.lockChannelTitle, texts.lockChannelBody]
          : [texts.lockThreadTitle, texts.lockThreadBody];
  const action = kind === "channel" ? texts.buyAccess : texts.buyPack;
  const canBuy = onBuy != null && lock.productId != null;

  return (
    <div
      data-testid="chat-lock"
      data-lock={lock.reason}
      className={cn(
        "flex gap-3 rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800",
        prominent ? "flex-col items-start p-5" : "flex-col sm:flex-row sm:items-center",
      )}
    >
      <Lock
        className={cn("shrink-0 text-neutral-500 dark:text-neutral-400", prominent ? "size-6" : "hidden size-5 sm:block")}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold", prominent ? "text-lg" : "text-sm")}>{title}</p>
        <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">{body}</p>
        {lock.welcome && (
          <p className="mt-3 whitespace-pre-wrap text-sm">{lock.welcome}</p>
        )}
        {failed && (
          <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
            {texts.buyError}
          </p>
        )}
      </div>
      {canBuy && (
        <button
          type="button"
          className={cn(primaryButton, "shrink-0")}
          disabled={buying}
          aria-busy={buying || undefined}
          onClick={async () => {
            setBuying(true);
            setFailed(false);
            try {
              await onBuy!(lock);
            } catch {
              setFailed(true);
            } finally {
              setBuying(false);
            }
          }}
        >
          {buying ? texts.buying : action}
        </button>
      )}
    </div>
  );
}

function authorLabel(message: ConversationMessage, mine: boolean, kind: "thread" | "channel", texts: ChatTexts) {
  if (mine) return texts.you;
  if (kind === "thread") return texts.creator;
  // Channels have no display names yet: the part of the e-mail before "@".
  return message.authorEmail.split("@")[0] || texts.creator;
}

function MessageList({
  conversation: c,
  texts,
  locale,
  kind,
  onReport,
  onEdit,
}: {
  conversation: ConversationState & ConversationActions;
  texts: ChatTexts;
  locale: string;
  kind: "thread" | "channel";
  onReport: (messageId: string) => void;
  onEdit: (message: ConversationMessage) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const count = c.messages.length;
  const lastId = c.messages[count - 1]?.id;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [count, lastId]);

  return (
    <div
      ref={scroller}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      onScroll={(event) => {
        const el = event.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4"
    >
      {c.hasMore && (
        <button
          type="button"
          onClick={() => {
            stick.current = false;
            void c.loadOlder();
          }}
          disabled={c.loadingOlder}
          className={cn(quietButton, "self-center text-xs")}
        >
          {c.loadingOlder ? texts.loading : texts.loadOlder}
        </button>
      )}
      {count === 0 && (
        <div className="m-auto max-w-sm text-center" data-testid="chat-empty">
          <p className="text-sm font-medium">{texts.noMessagesYet}</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {kind === "channel" ? texts.emptyChannel : texts.emptyThread}
          </p>
          {c.channel?.welcome && (
            <p className="mt-3 whitespace-pre-wrap text-sm">{c.channel.welcome}</p>
          )}
        </div>
      )}
      {c.messages.map((message) => (
        <MessageRow
          key={message.id}
          message={message}
          mine={message.authorEmail.toLowerCase() === c.me}
          kind={kind}
          texts={texts}
          locale={locale}
          onDelete={() => c.deleteMessage(message.id)}
          onReport={() => onReport(message.id)}
          onRetry={() => void c.retry(message.id)}
          onDiscard={() => c.discard(message.id)}
          onEdit={() => onEdit(message)}
        />
      ))}
    </div>
  );
}

function MessageRow({
  message,
  mine,
  kind,
  texts,
  locale,
  onDelete,
  onReport,
  onRetry,
  onDiscard,
  onEdit,
}: {
  message: ConversationMessage;
  mine: boolean;
  kind: "thread" | "channel";
  texts: ChatTexts;
  locale: string;
  onDelete: () => Promise<void>;
  onReport: () => void;
  onRetry: () => void;
  onDiscard: () => void;
  onEdit: () => void;
}) {
  const [actions, setActions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const local = message.local;

  if (message.system) {
    return (
      <div data-message-id={message.id} className="mx-auto max-w-md text-center text-xs text-neutral-600 dark:text-neutral-400">
        <span className="font-medium">{texts.systemLabel}</span>
        {message.body && <p className="mt-0.5 whitespace-pre-wrap">{message.body}</p>}
      </div>
    );
  }

  const refused = local?.state === "rejected" || local?.state === "failed";
  const waiting = local?.state === "pending" || local?.state === "unconfirmed";
  const canAct = !local && !message.deleted;

  return (
    <div
      data-message-id={message.id}
      data-state={local?.state ?? (message.deleted ? "deleted" : "stored")}
      className={cn("group flex max-w-[85%] flex-col gap-1 sm:max-w-[75%]", mine ? "items-end self-end" : "items-start self-start")}
    >
      <div className={cn("flex items-end gap-1", mine && "flex-row-reverse")}>
        <div
          className={cn(
            "min-w-0 rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
            message.deleted
              ? "border border-dashed border-neutral-300 bg-transparent italic text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
              : mine
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50",
            waiting && "opacity-70",
            refused && "border border-red-600 dark:border-red-400",
          )}
        >
          {message.deleted ? (
            texts.deletedPlaceholder
          ) : (
            <>
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              {message.attachmentKey && (
                <span className="mt-1 inline-flex items-center gap-1 text-xs opacity-80">
                  <Paperclip className="size-3.5" aria-hidden="true" />
                  {texts.attachment}
                </span>
              )}
            </>
          )}
        </div>
        {canAct && (
          <button
            type="button"
            aria-label={texts.messageActions}
            aria-expanded={actions}
            onClick={() => {
              setActions((open) => !open);
              setConfirmDelete(false);
            }}
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-md text-neutral-500 opacity-100 hover:bg-neutral-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
              actions && "sm:opacity-100",
              focusRing,
            )}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="flex items-center gap-1.5 px-1 text-[11px] text-neutral-500 dark:text-neutral-400">
        {message.pinned && (
          <span className="inline-flex items-center gap-0.5">
            <Pin className="size-3" aria-hidden="true" />
            {texts.pinned}
          </span>
        )}
        <span>{authorLabel(message, mine, kind, texts)}</span>
        <span aria-hidden="true">·</span>
        {waiting ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden="true" />
            {local?.state === "pending" ? texts.pending : texts.notConfirmed}
          </span>
        ) : (
          <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt, locale)}</time>
        )}
      </p>
      {refused && (
        <div role="alert" className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
          <p className="flex items-start gap-1 text-xs text-red-700 dark:text-red-400">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {rejectionText(texts, local?.reason ?? "", local?.retryAfter)}
          </p>
          <div className="flex flex-wrap gap-1">
            {local?.state === "failed" || local?.reason === "cooldown" ? (
              <button type="button" className={cn(quietButton, "text-xs")} onClick={onRetry}>
                {texts.retrySend}
              </button>
            ) : (
              <button type="button" className={cn(quietButton, "text-xs")} onClick={onEdit}>
                {texts.editMessage}
              </button>
            )}
            <button type="button" className={cn(quietButton, "text-xs")} onClick={onDiscard}>
              {texts.dismiss}
            </button>
          </div>
        </div>
      )}
      {actions && canAct && (
        <div className="flex flex-wrap gap-1">
          {mine ? (
            <button
              type="button"
              className={cn(quietButton, "text-xs text-red-700 dark:text-red-400")}
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                setActions(false);
                await onDelete().catch(() => undefined);
              }}
            >
              {confirmDelete ? texts.deleteConfirm : texts.deleteMessage}
            </button>
          ) : (
            <button
              type="button"
              className={cn(quietButton, "text-xs")}
              onClick={() => {
                setActions(false);
                onReport();
              }}
            >
              {texts.reportMessage}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function composerBlock(c: ConversationState, kind: "thread" | "channel", texts: ChatTexts): string | undefined {
  if (kind === "thread" && c.thread?.composerLocked) return texts.composerExpired;
  if (kind === "channel" && c.channel) {
    if (c.channel.role === "muted") return texts.composerMuted;
    if (c.channel.whoCanPost === "creator" && c.channel.role !== "creator")
      return texts.composerCreatorOnly;
  }
  return undefined;
}

function Composer({
  conversation: c,
  texts,
  kind,
  draft,
  setDraft,
}: {
  conversation: ConversationState & ConversationActions;
  texts: ChatTexts;
  kind: "thread" | "channel";
  draft: string;
  setDraft: (value: string) => void;
}) {
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const blocked = composerBlock(c, kind, texts);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  if (blocked) {
    return (
      <p data-testid="chat-composer-blocked" className="border-t border-neutral-200 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        {blocked}
      </p>
    );
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void c.send(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="border-t border-neutral-200 px-3 pb-3 pt-2 dark:border-neutral-800">
      {c.messages.length === 0 && (
        <p className="pb-2 text-xs text-neutral-500 dark:text-neutral-400">{texts.privacyNote}</p>
      )}
      <div className="flex items-end gap-2">
        <label htmlFor={id} className="sr-only">
          {texts.composerLabel}
        </label>
        <textarea
          id={id}
          ref={area}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={texts.composerPlaceholder}
          className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-500 focus-visible:border-neutral-500 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:placeholder:text-neutral-400"
        />
        <button
          type="submit"
          aria-label={texts.send}
          disabled={draft.trim().length === 0}
          className={cn(primaryButton, "w-11 px-0")}
        >
          <SendHorizontal className="size-5" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

const REASONS: ChatReportReason[] = ["spam", "abuse", "illegal", "other"];

function ReportForm({
  texts,
  messageId,
  onCancel,
  onSubmit,
}: {
  texts: ChatTexts;
  messageId?: string;
  onCancel: () => void;
  onSubmit: (reason: ChatReportReason, note: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<ChatReportReason>("spam");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const noteId = useId();
  const label: Record<ChatReportReason, string> = {
    spam: texts.reasonSpam,
    abuse: texts.reasonAbuse,
    illegal: texts.reasonIllegal,
    other: texts.reasonOther,
  };
  return (
    <form
      data-testid="chat-report"
      className="flex flex-col gap-3 border-t border-neutral-200 p-4 dark:border-neutral-800"
      onSubmit={async (event) => {
        event.preventDefault();
        setSending(true);
        setFailed(false);
        try {
          await onSubmit(reason, note.trim());
        } catch {
          setFailed(true);
        } finally {
          setSending(false);
        }
      }}
    >
      <p className="text-sm font-semibold">
        {messageId ? texts.reportTitle : texts.reportConversationTitle}
      </p>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs text-neutral-600 dark:text-neutral-400">{texts.reportReason}</legend>
        {REASONS.map((value) => (
          <label key={value} className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="radio"
              name="chat-report-reason"
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
              className="size-4 accent-neutral-900 dark:accent-white"
            />
            {label[value]}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={noteId} className="text-xs text-neutral-600 dark:text-neutral-400">
          {texts.reportNote}
        </label>
        <textarea
          id={noteId}
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="resize-none rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:border-neutral-500 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-950"
        />
      </div>
      {failed && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {texts.reportError}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={quietButton} onClick={onCancel}>
          {texts.reportCancel}
        </button>
        <button type="submit" className={primaryButton} disabled={sending} aria-busy={sending || undefined}>
          {texts.reportSend}
        </button>
      </div>
    </form>
  );
}
