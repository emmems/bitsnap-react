import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  FileText,
  Lock,
  Package,
  PackageX,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { PublicOrderDetails } from "../../../gen/proto/public/v1/public_api_pb";
import { cn } from "../../../lib/utils";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import { Label } from "../../../ui/label";
import { formatExactTime } from "../../order-history/lines";
import type { PanelTexts } from "../../texts";
import { PanelCard } from "../shared/PanelCard";
import { PanelEmptyState } from "../shared/PanelEmptyState";
import { StatusPill } from "../shared/StatusPill";
import {
  fillText,
  formatLongDate,
  formatMinorAmount,
  formatShortDate,
  shortOrderRef,
  timestampToDate,
} from "./format";
import type { OrderTimeline } from "./useOrderTimeline";

/** Entries the timeline shows before "Pokaż całą historię". */
export const TIMELINE_PREVIEW = 3;

const SECTION_LABEL =
  "mb-2.5 text-[11px] font-bold tracking-[0.08em] text-(--panel-muted) uppercase";

const LINK_BUTTON =
  "inline-flex min-h-8 items-center gap-1 rounded-sm text-sm font-semibold text-(--panel-fg) underline decoration-[color-mix(in_srgb,var(--panel-fg)_35%,transparent)] underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now) disabled:opacity-60";

export function BackLink({
  label,
  ariaLabel,
  onClick,
}: {
  label: string;
  ariaLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="-ml-1 mb-3.5 inline-flex min-h-9 items-center gap-1 self-start rounded-md px-1 text-sm font-medium text-(--panel-muted) hover:text-(--panel-fg) focus-visible:outline-2 focus-visible:outline-(--panel-accent-text-now)"
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}

/** Skeleton that mirrors the page: header line, two item rows, totals. */
export function OrderDetailsSkeleton({ label }: { label: string }) {
  const bar = "animate-pulse rounded bg-(--panel-surface-2) motion-reduce:animate-none";
  return (
    <div role="status" aria-label={label} className="flex w-full max-w-[960px] flex-col gap-3.5">
      <div className={cn(bar, "h-7 w-56")} />
      <div className={cn(bar, "h-5 w-40")} />
      <PanelCard className="mt-2 flex flex-col gap-4">
        <div className={cn(bar, "h-2.5 w-20")} />
        {[0, 1].map((index) => (
          <div key={index} className="flex items-center gap-3">
            <div className={cn(bar, "size-11 shrink-0 rounded-lg")} />
            <div className="flex flex-1 flex-col gap-2">
              <div className={cn(bar, "h-3.5 w-3/5")} />
              <div className={cn(bar, "h-3 w-1/4")} />
            </div>
            <div className={cn(bar, "h-3.5 w-16")} />
          </div>
        ))}
        <div className={cn(bar, "h-4 w-full")} />
      </PanelCard>
    </div>
  );
}

/** Unavailable, not found or failed: one message, one way on. */
export function OrderProblem({
  kind,
  texts,
  onBack,
  onRetry,
}: {
  kind: "unavailable" | "not-found" | "error";
  texts: PanelTexts;
  onBack?: () => void;
  onRetry?: () => void;
}) {
  if (kind === "error") {
    return (
      <PanelEmptyState
        role="alert"
        icon={<AlertCircle />}
        title={texts.orderErrorTitle}
        description={texts.orderErrorText}
        action={
          onRetry ? (
            <Button variant="outline" className="min-h-11" onClick={onRetry}>
              {texts.retry}
            </Button>
          ) : undefined
        }
        className="w-full max-w-[720px]"
      />
    );
  }
  return (
    <PanelEmptyState
      icon={<PackageX />}
      title={texts.orderUnavailableTitle}
      description={
        kind === "unavailable" ? texts.orderUnavailableText : texts.orderNotFoundText
      }
      action={
        onBack ? (
          <Button className="min-h-11" onClick={onBack}>
            {texts.orderBackToList}
          </Button>
        ) : undefined
      }
      className="w-full max-w-[720px]"
    />
  );
}

function ItemThumb({ src }: { src?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setBroken(true)}
        className="size-11 shrink-0 rounded-lg bg-(--panel-surface-2) object-cover sm:size-14"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-(--panel-surface-2) text-(--panel-muted) sm:size-14"
    >
      <Package className="size-5" />
    </span>
  );
}

function ItemsCard({
  order,
  texts,
  locale,
  invoiceUrl,
  className,
}: {
  order: PublicOrderDetails;
  texts: PanelTexts;
  locale: string;
  invoiceUrl?: string;
  className?: string;
}) {
  const headingId = useId();
  return (
    <PanelCard as="section" aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className={SECTION_LABEL}>
        {texts.orderItems}
      </h2>
      <ul className="divide-y divide-(--panel-border)">
        {order.items.map((item, index) => {
          const unit = formatMinorAmount(item.price, item.currency || order.currency, locale);
          const line = formatMinorAmount(
            BigInt(item.price) * BigInt(Math.max(1, item.quantity)),
            item.currency || order.currency,
            locale,
          );
          return (
            <li key={index} className="flex items-center gap-3 py-2.5">
              <ItemThumb src={item.imageUrl} />
              <div className="min-w-0 flex-1">
                <p className="leading-snug font-semibold break-words">{item.name}</p>
                <p className="text-xs text-(--panel-muted)">
                  {fillText(texts.orderQuantityPrice, {
                    quantity: item.quantity,
                    price: unit,
                  })}
                </p>
              </div>
              <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">
                {line}
              </span>
            </li>
          );
        })}
      </ul>
      {/* No derived "Dostawa i rabaty" line: it needs the API (plan B2). */}
      <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-(--panel-border) pt-3 text-base font-bold">
        <span>{texts.orderTotal}</span>
        <span className="tabular-nums">
          {formatMinorAmount(order.totalAmount, order.currency, locale)}
        </span>
      </div>
      {invoiceUrl && (
        <Button
          asChild
          variant="outline"
          className="mt-3.5 min-h-11 w-full sm:w-auto"
        >
          <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
            <FileText aria-hidden="true" className="size-4" />
            {texts.orderInvoice}
          </a>
        </Button>
      )}
    </PanelCard>
  );
}

function TimelineSection({
  timeline,
  texts,
  locale,
}: {
  timeline: OrderTimeline;
  texts: PanelTexts;
  locale: string;
}) {
  const headingId = useId();
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const { rows } = timeline;
  if (rows.length === 0) return null;
  const shown = expanded ? rows : rows.slice(0, TIMELINE_PREVIEW);
  const canExpand = expanded
    ? timeline.hasMore
    : rows.length > TIMELINE_PREVIEW || timeline.hasMore;
  const canCollapse = expanded && !timeline.hasMore && rows.length > TIMELINE_PREVIEW;

  return (
    <section aria-labelledby={headingId} data-bitsnap-order-timeline="">
      <h2 id={headingId} className={SECTION_LABEL}>
        {texts.orderTimeline}
      </h2>
      <ol id={listId} className="flex flex-col">
        {shown.map((row, index) => (
          <li
            key={row.id}
            className="relative grid grid-cols-[0.875rem_minmax(0,1fr)_auto] items-start gap-x-2.5 pb-3.5 last:pb-0"
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-[5px] ml-0.5 size-[9px] rounded-full",
                index === 0 ? "bg-(--panel-fg)" : "bg-(--panel-muted)",
              )}
            />
            {index < shown.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-4 bottom-0.5 left-1.5 w-px bg-(--panel-border)"
              />
            )}
            <p className="text-sm leading-snug font-medium break-words">
              {row.text}
              {row.link && (
                <>
                  {" "}
                  <a
                    href={row.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-(--panel-accent-text-now)"
                  >
                    {row.link.label}
                  </a>
                </>
              )}
            </p>
            {row.date ? (
              <time
                dateTime={row.date.toISOString()}
                title={formatExactTime(row.date, locale)}
                className="text-xs whitespace-nowrap text-(--panel-muted)"
              >
                {formatShortDate(row.date, locale)}
              </time>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ol>
      {(canExpand || canCollapse) && (
        <button
          type="button"
          aria-controls={listId}
          aria-expanded={expanded}
          disabled={timeline.isFetchingMore}
          onClick={() => {
            if (canCollapse) {
              setExpanded(false);
              return;
            }
            setExpanded(true);
            if (timeline.hasMore && (expanded || rows.length <= TIMELINE_PREVIEW)) {
              timeline.fetchMore();
            }
          }}
          className={cn(LINK_BUTTON, "mt-2 text-xs")}
        >
          {canCollapse ? texts.orderTimelineLess : texts.orderTimelineAll}
        </button>
      )}
    </section>
  );
}

function CopyValue({ value, texts }: { value: string; texts: PanelTexts }) {
  const [copied, setCopied] = useState(false);
  const canCopy =
    typeof navigator !== "undefined" && navigator.clipboard?.writeText != null;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 font-semibold tabular-nums">
      <span className="min-w-0 break-all">{value}</span>
      {canCopy && (
        <button
          type="button"
          aria-label={copied ? texts.orderCopied : texts.orderCopyTracking}
          title={copied ? texts.orderCopied : texts.orderCopyTracking}
          onClick={() => {
            void navigator.clipboard.writeText(value).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-(--panel-muted) hover:bg-(--panel-surface-2) hover:text-(--panel-fg) focus-visible:outline-2 focus-visible:outline-(--panel-accent-text-now)"
        >
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
        </button>
      )}
    </span>
  );
}

function DeliverySection({
  order,
  texts,
}: {
  order: PublicOrderDetails;
  texts: PanelTexts;
}) {
  const headingId = useId();
  const method = order.deliveryMethod?.trim();
  const tracking = order.isVerified ? order.trackingNumber?.trim() : undefined;
  if (!method && !tracking) return null;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={SECTION_LABEL}>
        {texts.orderDelivery}
      </h2>
      <div className="flex flex-col gap-0.5 text-sm">
        {method && <p className="font-semibold break-words">{method}</p>}
        {tracking && (
          <>
            <p className="mt-1 text-xs text-(--panel-muted)">{texts.orderTracking}</p>
            <CopyValue value={tracking} texts={texts} />
          </>
        )}
      </div>
    </section>
  );
}

function YourDataCard({
  order,
  texts,
  canVerify,
  onVerify,
  className,
}: {
  order: PublicOrderDetails;
  texts: PanelTexts;
  canVerify: boolean;
  onVerify: (email: string) => void;
  className?: string;
}) {
  const headingId = useId();
  const revealId = useId();
  const emailId = useId();
  const [revealed, setRevealed] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [email, setEmail] = useState("");
  const address = order.deliveryAddress?.trim();
  const phone = order.customerPhone?.trim();
  const masked = !order.isVerified;
  const hidden = address || phone;

  return (
    <PanelCard as="section" aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className={SECTION_LABEL}>
        {texts.orderYourData}
      </h2>
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        {order.customerName && (
          <p className="font-semibold break-words">{order.customerName}</p>
        )}
        {order.customerEmail && (
          <p className="break-all text-(--panel-muted)">{order.customerEmail}</p>
        )}
      </div>
      {hidden &&
        (revealed ? (
          <div
            id={revealId}
            className="mt-2.5 flex flex-col gap-0.5 rounded-lg bg-(--panel-surface-2) px-3 py-2.5 text-sm"
          >
            {address && <p className="break-words">{address}</p>}
            {phone && <p className="text-(--panel-muted)">{phone}</p>}
            <button
              type="button"
              aria-expanded="true"
              aria-controls={revealId}
              onClick={() => setRevealed(false)}
              className={cn(LINK_BUTTON, "mt-1 self-start text-xs")}
            >
              {texts.orderHideData}
            </button>
          </div>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5 rounded-lg bg-(--panel-surface-2) px-3 py-2">
            <span className="text-xs text-(--panel-muted)">{texts.orderDataHidden}</span>
            <Button
              variant="outline"
              size="sm"
              aria-expanded="false"
              aria-controls={revealId}
              className="bg-(--panel-surface)"
              onClick={() => setRevealed(true)}
            >
              {texts.orderShowData}
            </Button>
          </div>
        ))}
      {masked && canVerify && (
        <div className="mt-3 border-t border-(--panel-border) pt-3">
          <p className="text-xs text-(--panel-muted)">{texts.orderMaskedNote}</p>
          {verifying ? (
            <form
              className="mt-2.5 flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (email.trim() === "") return;
                onVerify(email.trim());
                setVerifying(false);
              }}
            >
              <p className="text-sm">{texts.orderVerifyText}</p>
              <Label htmlFor={emailId}>{texts.orderVerifyEmailLabel}</Label>
              <Input
                id={emailId}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="min-h-11">
                  {texts.orderVerifyConfirm}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setVerifying(false)}
                >
                  {texts.orderVerifyCancel}
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              className="mt-2.5 min-h-11 w-full"
              onClick={() => setVerifying(true)}
            >
              <Lock aria-hidden="true" className="size-4" />
              {texts.orderVerify}
            </Button>
          )}
        </div>
      )}
    </PanelCard>
  );
}

function HelpSection({
  order,
  texts,
  locale,
}: {
  order: PublicOrderDetails;
  texts: PanelTexts;
  locale: string;
}) {
  const headingId = useId();
  const threadId = useId();
  const [open, setOpen] = useState(false);
  // D4: the thread stays, read-only; the comment form waits for plan B4.
  if (order.comments.length === 0) return null;
  const count = Math.max(order.commentCount, order.comments.length);
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={SECTION_LABEL}>
        {texts.orderHelp}
      </h2>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={threadId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2 rounded-md text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-(--panel-accent-text-now)"
      >
        <span className="flex-1">
          {texts.orderComments}{" "}
          <span className="text-(--panel-muted)">({count})</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 text-(--panel-muted) transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ul id={threadId} className="mt-1 flex flex-col gap-3">
          {order.comments.map((comment) => {
            const date = timestampToDate(comment.createdAt);
            return (
              <li
                key={comment.id}
                className="rounded-lg bg-(--panel-surface-2) px-3 py-2.5 text-sm"
              >
                <p className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-(--panel-muted)">
                  <span className="font-semibold text-(--panel-fg)">
                    {comment.authorName || texts.orderSystemAuthor}
                  </span>
                  {(comment.authorType === "admin" ||
                    comment.authorType === "seller") && (
                    <span>{texts.orderSellerLabel}</span>
                  )}
                  {date && (
                    <time dateTime={date.toISOString()}>
                      {formatShortDate(date, locale)}
                    </time>
                  )}
                </p>
                <p className="break-words whitespace-pre-line">{comment.message}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Order as a receipt (plan option A, "Rachunek"): number, status and date;
 * products and total; history; delivery; the buyer's data with address and
 * phone behind "Pokaż dane"; the comment thread, read-only.
 * On a phone it is one column; from `lg` the side column holds history,
 * delivery and help.
 */
export function OrderDetailsView({
  order,
  texts,
  locale,
  timeline,
  canVerify,
  onVerify,
  onBack,
  lead,
}: {
  order: PublicOrderDetails;
  texts: PanelTexts;
  locale: string;
  timeline: OrderTimeline;
  /** Shows the e-mail confirmation for masked data (standalone, no session). */
  canVerify: boolean;
  onVerify: (email: string) => void;
  onBack?: () => void;
  /** Above the back link, e.g. the shop logo of the standalone page. */
  lead?: ReactNode;
}) {
  const ref = shortOrderRef(order.orderId);
  const created = timestampToDate(order.createdAt);
  const timelineSection = (
    <TimelineSection timeline={timeline} texts={texts} locale={locale} />
  );
  const delivery = <DeliverySection order={order} texts={texts} />;
  const help = <HelpSection order={order} texts={texts} locale={locale} />;
  const hasTimeline = timeline.rows.length > 0;
  const hasDelivery =
    !!order.deliveryMethod?.trim() ||
    (order.isVerified && !!order.trackingNumber?.trim());
  const hasHelp = order.comments.length > 0;
  const sideSections = [
    hasTimeline && { key: "timeline", node: timelineSection, order: "order-2" },
    hasDelivery && { key: "delivery", node: delivery, order: "order-3" },
    hasHelp && { key: "help", node: help, order: "order-5" },
  ].filter(Boolean) as Array<{ key: string; node: ReactNode; order: string }>;

  return (
    <div className="flex w-full max-w-[960px] min-w-0 flex-col" data-bitsnap-order-page="">
      {lead}
      {onBack && (
        <BackLink label={texts.orderBack} ariaLabel={texts.orderBackToList} onClick={onBack} />
      )}
      <header className="mb-4 flex flex-col gap-2 md:mb-5 md:flex-row md:flex-wrap md:items-center md:gap-x-3.5">
        <h1 className="text-2xl font-semibold tracking-tight break-words">
          {fillText(texts.orderNumber, { ref })}
        </h1>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-(--panel-muted)">
          <StatusPill status={order.status} texts={texts} />
          {created && (
            <time dateTime={created.toISOString()}>{formatLongDate(created, locale)}</time>
          )}
        </div>
      </header>

      <div className="flex min-w-0 flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-4">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3.5">
          <ItemsCard
            order={order}
            texts={texts}
            locale={locale}
            invoiceUrl={timeline.invoiceUrl}
            className="order-1 min-w-0"
          />
          <YourDataCard
            order={order}
            texts={texts}
            canVerify={canVerify}
            onVerify={onVerify}
            className="order-4 min-w-0"
          />
        </div>
        {sideSections.length > 0 && (
          <div className="contents lg:col-start-2 lg:row-start-1 lg:block lg:overflow-hidden lg:rounded-xl lg:border lg:border-(--panel-border) lg:bg-(--panel-surface)">
            {sideSections.map((section, index) => (
              <PanelCard
                key={section.key}
                className={cn(
                  section.order,
                  "min-w-0 lg:rounded-none lg:border-0 lg:bg-transparent",
                  index > 0 && "lg:border-t lg:border-(--panel-border)",
                )}
              >
                {section.node}
              </PanelCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
