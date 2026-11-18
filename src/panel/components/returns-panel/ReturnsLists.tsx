import { ChevronRight, Inbox, Undo2 } from "lucide-react";
import { formatDate } from "../../../components/returns/date";
import { useMyReturns, useReturnOrders } from "../../../components/returns/hooks";
import {
  ErrorMessage,
  Pagination,
  SkeletonRows,
  StatusBadge,
  useRefundStatusText,
} from "../../../components/returns/internal";
import { formatMoney } from "../../../components/returns/money";
import { useReturnsLocale, useReturnsText } from "../../../components/returns/texts.context";
import { Button } from "../../../ui/button";
import type { PanelTexts } from "../../texts";
import { pluralText } from "../orders/format";
import { PanelCard } from "../shared/PanelCard";
import { PanelEmptyState } from "../shared/PanelEmptyState";

export const RETURNS_PAGE_SIZE = 10;

const ROW =
  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 px-4 py-3.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--panel-surface-2)_55%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--panel-accent-text-now) sm:grid-cols-[minmax(0,1fr)_auto_1.25rem] sm:px-5 motion-reduce:transition-none";

/** "1 Wybierz produkt › 2 Podaj powód › 3 Potwierdź". */
export function ReturnsHowItWorks({ texts }: { texts: PanelTexts }) {
  const steps = [texts.returnsStep1, texts.returnsStep2, texts.returnsStep3];
  return (
    <div
      role="group"
      aria-label={texts.returnsHowTitle.replace(/:$/, "")}
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-(--panel-muted)"
    >
      <span aria-hidden="true" className="mr-1 hidden font-semibold sm:inline">{texts.returnsHowTitle}</span>
      <ol className="contents">
        {steps.map((step, index) => (
          <li key={step} className="inline-flex items-center gap-2 font-medium text-(--panel-fg)">
            <span className="inline-flex items-center">
              <span
                aria-hidden="true"
                className="mr-1.5 inline-grid size-5 place-items-center rounded-full bg-(--panel-surface-2) text-[11px]"
              >
                {index + 1}
              </span>
              {step}
            </span>
            {index < steps.length - 1 && (
              <ChevronRight aria-hidden="true" className="size-3.5 text-(--panel-muted)" />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** "Do zwrotu": the orders with lines to return, or an honest empty state. */
export function ReturnOrdersPanel({
  texts,
  onSelectOrder,
  onOpenOrders,
}: {
  texts: PanelTexts;
  onSelectOrder: (canonicalOrderId: string) => void;
  /** "Zobacz zamówienia" in the empty state; hidden without it. */
  onOpenOrders?: () => void;
}) {
  const text = useReturnsText();
  const locale = useReturnsLocale();
  const orders = useReturnOrders({ pageSize: RETURNS_PAGE_SIZE });

  if (orders.isLoading) return <SkeletonRows />;
  if (orders.errorKey != null) {
    return <ErrorMessage errorKey={orders.errorKey} onRetry={orders.refetch} />;
  }
  if (orders.orders.length === 0) {
    // R3: the list holds order snapshots, not eligibility; never claim
    // that nothing can be returned.
    return (
      <PanelEmptyState
        icon={<Undo2 />}
        title={texts.returnsEmptyTitle}
        description={texts.returnsRule}
        action={
          onOpenOrders ? (
            <Button className="min-h-11" onClick={onOpenOrders}>
              {texts.returnsEmptyAction}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <ReturnsHowItWorks texts={texts} />
      <PanelCard padding="none" className="overflow-hidden">
        <ul>
          {orders.orders.map((order) => {
            const title = text("orderTitle", { reference: order.displayReference });
            const lines = pluralText(locale, order.returnableLineCount, {
              one: texts.returnsLinesOne,
              few: texts.returnsLinesFew,
              many: texts.returnsLinesMany,
            });
            const meta = [
              formatDate(order.purchasedAt, locale),
              formatMoney(order.totalMinor, order.currency, locale),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={order.canonicalOrderId} className="border-t border-(--panel-border) first:border-t-0">
                <button
                  type="button"
                  className={ROW}
                  onClick={() => onSelectOrder(order.canonicalOrderId)}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold break-words tabular-nums">{title}</span>
                    <span className="block text-sm text-(--panel-muted)">{meta}</span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 justify-self-end text-(--panel-muted) sm:col-start-3 sm:row-start-1"
                  />
                  <span className="col-span-full text-xs text-(--panel-muted) sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-sm">
                    {lines}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PanelCard>
      <Pagination
        page={orders.page}
        total={orders.total}
        hasNext={orders.hasNext}
        hasPrevious={orders.hasPrevious}
        isFetching={orders.isFetching}
        onNext={orders.next}
        onPrevious={orders.previous}
      />
      <p className="text-xs text-(--panel-muted)">{texts.returnsRule}</p>
    </div>
  );
}

/** "Moje zwroty": submitted return requests with status and refund. */
export function MyReturnsPanel({
  texts,
  onSelectReturn,
}: {
  texts: PanelTexts;
  onSelectReturn: (returnId: string) => void;
}) {
  const text = useReturnsText();
  const locale = useReturnsLocale();
  const refundText = useRefundStatusText();
  const myReturns = useMyReturns({ pageSize: RETURNS_PAGE_SIZE });

  if (myReturns.isLoading) return <SkeletonRows />;
  if (myReturns.errorKey != null) {
    return <ErrorMessage errorKey={myReturns.errorKey} onRetry={myReturns.refetch} />;
  }
  if (myReturns.returns.length === 0) {
    return (
      <PanelEmptyState
        icon={<Inbox />}
        title={text("myReturnsEmpty")}
        description={texts.returnsMineEmptyText}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <PanelCard padding="none" className="overflow-hidden">
        <ul>
          {myReturns.returns.map((item) => (
            <li key={item.id} className="border-t border-(--panel-border) first:border-t-0">
              <button
                type="button"
                className={ROW}
                aria-label={`${text("myReturnOpen")}: ${item.reference}`}
                onClick={() => onSelectReturn(item.id)}
              >
                <span className="min-w-0">
                  <span className="block font-semibold break-words">{item.reference}</span>
                  <span className="block text-sm text-(--panel-muted)">
                    {formatDate(item.createdAt, locale)}
                  </span>
                  <span className="block text-xs text-(--panel-muted)">
                    {text("myReturnRefund")}: {refundText(item.refundStatus)}
                  </span>
                </span>
                <span className="justify-self-end sm:col-start-2 sm:row-start-1">
                  <StatusBadge status={item.status} />
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="hidden size-4 text-(--panel-muted) sm:col-start-3 sm:row-start-1 sm:block"
                />
              </button>
            </li>
          ))}
        </ul>
      </PanelCard>
      <Pagination
        page={myReturns.page}
        total={myReturns.total}
        hasNext={myReturns.hasNext}
        hasPrevious={myReturns.hasPrevious}
        isFetching={myReturns.isFetching}
        onNext={myReturns.next}
        onPrevious={myReturns.previous}
      />
    </div>
  );
}
