import { ChevronRight, Info } from "lucide-react";
import { useId } from "react";
import { cn } from "../../../lib/utils";
import { orderStatusLabel, type PanelTexts } from "../../texts";
import { StatusPill } from "../shared/StatusPill";
import {
  fillText,
  formatMinorAmount,
  formatShortDate,
  shortOrderRef,
} from "./format";

/** What one row needs of `GetOrdersResponse.OrderSummary`. */
export type OrderRowData = {
  id: string;
  status: string;
  totalAmount: number;
  currency: string;
  customerName: string;
  date: Date | undefined;
};

/**
 * Row layout: on a phone every row is its own card (number + amount, date +
 * status, name); from `md` the rows sit in one divided card as a single line.
 */
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-(--panel-border) bg-(--panel-surface) px-4 py-3.5 text-left md:grid-cols-[6.5rem_7rem_minmax(0,1fr)_6rem_8rem_1.25rem] md:gap-y-0 md:rounded-none md:border-0 md:border-t md:bg-transparent md:px-5";

export function MonthHeader({ label }: { label: string }) {
  return (
    <h2 className="mt-5 mb-2 text-[11px] font-bold tracking-[0.08em] text-(--panel-muted) uppercase first:mt-0 md:m-0 md:bg-(--panel-surface-2) md:px-5 md:py-2">
      {label}
    </h2>
  );
}

export function OrderRow({
  order,
  showName,
  texts,
  locale,
  onOpen,
}: {
  order: OrderRowData;
  showName: boolean;
  texts: PanelTexts;
  locale: string;
  onOpen: (id: string) => void;
}) {
  const noteId = useId();
  const titleId = useId();
  const amount = formatMinorAmount(order.totalAmount, order.currency, locale);
  const date = order.date ? formatShortDate(order.date, locale) : "";
  const name =
    showName && order.customerName.trim() !== ""
      ? fillText(texts.orderFor, { name: order.customerName.trim() })
      : "";
  const pill = <StatusPill status={order.status} texts={texts} />;

  // F1: an old order without an id has no details page: a static row with
  // the reason, never a dead click.
  if (order.id.trim() === "") {
    const title = date
      ? fillText(texts.orderFromDate, { date })
      : texts.orderLegacyTitle;
    return (
      <li
        data-order-row="legacy"
        aria-labelledby={titleId}
        aria-describedby={noteId}
        className={cn(
          ROW_GRID,
          "border-dashed bg-transparent md:grid-cols-[minmax(0,1fr)_6rem_8rem_1.25rem] md:border-solid",
        )}
      >
        <span className="min-w-0 md:col-start-1 md:row-start-1">
          <span id={titleId} className="font-semibold break-words">
            {title}
          </span>
          {name && (
            <span className="hidden text-(--panel-muted) md:inline">
              {" · "}
              {name}
            </span>
          )}
        </span>
        <span className="justify-self-end font-semibold whitespace-nowrap tabular-nums md:col-start-2 md:row-start-1 md:text-right">
          {amount}
        </span>
        <span className="min-w-0 text-xs text-(--panel-muted) md:hidden">
          {name}
        </span>
        <span className="justify-self-end md:col-start-3 md:row-start-1 md:justify-self-start">
          {pill}
        </span>
        <span
          id={noteId}
          className="col-span-full mt-1.5 flex items-start gap-1.5 text-xs text-(--panel-muted) md:col-span-1 md:col-start-1 md:row-start-2 md:mt-0.5"
        >
          <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {texts.orderLegacyNote}
        </span>
      </li>
    );
  }

  const ref = `#${shortOrderRef(order.id)}`;
  return (
    <li>
      <button
        type="button"
        data-order-row="open"
        onClick={() => onOpen(order.id)}
        // Names the row with everything it shows: number, date, amount,
        // status and the checkout name when there is one.
        aria-label={[
          fillText(texts.orderNumber, { ref }),
          date,
          amount,
          orderStatusLabel(order.status, texts) ?? order.status.trim(),
          name,
        ]
          .filter(Boolean)
          .join(", ")}
        className={cn(
          ROW_GRID,
          "w-full cursor-pointer transition-colors hover:border-[color-mix(in_srgb,var(--panel-fg)_25%,var(--panel-border))] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--panel-accent-text-now) md:hover:bg-[color-mix(in_srgb,var(--panel-surface-2)_55%,transparent)]",
        )}
      >
        <span className="font-semibold tabular-nums md:col-start-1">{ref}</span>
        <span className="justify-self-end font-semibold whitespace-nowrap tabular-nums md:col-start-4 md:row-start-1 md:text-right">
          {amount}
        </span>
        <span className="text-sm text-(--panel-muted) md:col-start-2 md:row-start-1">
          {date}
        </span>
        <span className="justify-self-end md:col-start-5 md:row-start-1 md:justify-self-start">
          {pill}
        </span>
        <span className="col-span-full mt-0.5 flex min-w-0 items-center justify-between gap-2 md:col-span-1 md:col-start-3 md:row-start-1 md:mt-0">
          <span className="min-w-0 truncate text-xs text-(--panel-muted) md:text-sm">
            {name}
          </span>
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-(--panel-muted) md:hidden"
          />
        </span>
        <ChevronRight
          aria-hidden="true"
          className="hidden size-4 text-(--panel-muted) md:col-start-6 md:row-start-1 md:block"
        />
      </button>
    </li>
  );
}

/** Skeleton rows in the same grid as `OrderRow`. */
export function OrderRowSkeletons({ count = 4 }: { count?: number }) {
  const bar = "h-3.5 animate-pulse rounded bg-(--panel-surface-2) motion-reduce:animate-none";
  return (
    <>
      <div className="mb-2 md:m-0 md:bg-(--panel-surface-2) md:px-5 md:py-2.5">
        <div className={cn(bar, "h-2.5 w-24 md:bg-(--panel-border)")} />
      </div>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={cn(ROW_GRID, "mb-2.5 md:mb-0")}
        >
          <div className={cn(bar, "w-20")} />
          <div className={cn(bar, "w-16 justify-self-end md:col-start-4 md:row-start-1")} />
          <div className={cn(bar, "w-24 md:col-start-2 md:row-start-1")} />
          <div className={cn(bar, "h-5 w-20 justify-self-end rounded-full md:col-start-5 md:row-start-1 md:justify-self-start")} />
        </div>
      ))}
    </>
  );
}
