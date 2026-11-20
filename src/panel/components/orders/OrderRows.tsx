import { ChevronRight, Info } from "lucide-react";
import { useId } from "react";
import { cn } from "../../../lib/utils";
import type { ShopOption } from "../../shop-filter";
import { orderStatusLabel, type PanelTexts } from "../../texts";
import { ShopMark } from "../shared/ShopAvatar";
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
  projectId?: string;
  /** Resolved shop for global-panel rows; omitted on shop panels and single-shop filters. */
  shop?: ShopOption;
};

/**
 * Row layout: on a phone every row is its own card (number + amount, date +
 * status, name); from `md` (shop panel) or `lg` (global panel, where 768 px
 * leaves no room for a shop mark beside the fixed columns) the rows sit in
 * one divided card as a single line.
 */
const ROW_GRID_MD =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-(--panel-border) bg-(--panel-surface) px-4 py-3.5 text-left md:grid-cols-[6.5rem_7rem_minmax(0,1fr)_6rem_8rem_1.25rem] md:gap-y-0 md:rounded-none md:border-0 md:border-t md:bg-transparent md:px-5";

const ROW_GRID_LG =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-(--panel-border) bg-(--panel-surface) px-4 py-3.5 text-left lg:grid-cols-[6.5rem_7rem_minmax(0,1fr)_6rem_8rem_1.25rem] lg:gap-y-0 lg:rounded-none lg:border-0 lg:border-t lg:bg-transparent lg:px-5";

export function MonthHeader({
  label,
  wide = "md",
}: {
  label: string;
  wide?: "md" | "lg";
}) {
  return (
    <h2
      className={cn(
        "mt-5 mb-2 text-[11px] font-bold tracking-[0.08em] text-(--panel-muted) uppercase first:mt-0",
        wide === "lg"
          ? "lg:m-0 lg:bg-(--panel-surface-2) lg:px-5 lg:py-2"
          : "md:m-0 md:bg-(--panel-surface-2) md:px-5 md:py-2",
      )}
    >
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
  wide = "md",
}: {
  order: OrderRowData;
  showName: boolean;
  texts: PanelTexts;
  locale: string;
  onOpen: (id: string, projectId?: string) => void;
  wide?: "md" | "lg";
}) {
  const noteId = useId();
  const titleId = useId();
  const lg = wide === "lg";
  const rowGrid = lg ? ROW_GRID_LG : ROW_GRID_MD;
  const amount = formatMinorAmount(order.totalAmount, order.currency, locale);
  const date = order.date ? formatShortDate(order.date, locale) : "";
  const name =
    showName && order.customerName.trim() !== ""
      ? fillText(texts.orderFor, { name: order.customerName.trim() })
      : "";
  const shop = order.shop;
  const shopName = shop ? shop.name.trim() || texts.shopUnknown : "";
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
          rowGrid,
          "border-dashed bg-transparent",
          lg
            ? "lg:grid-cols-[minmax(0,1fr)_6rem_8rem_1.25rem] lg:border-solid"
            : "md:grid-cols-[minmax(0,1fr)_6rem_8rem_1.25rem] md:border-solid",
        )}
      >
        {shop && (
          <span
            className={cn(
              "col-span-full mb-1 flex min-w-0 items-center",
              lg ? "lg:hidden" : "md:hidden",
            )}
          >
            <ShopMark
              shop={shop}
              fallbackName={texts.shopUnknown}
              size="sm"
              className="text-xs font-medium"
            />
          </span>
        )}
        <span
          className={cn(
            "min-w-0",
            lg ? "lg:col-start-1 lg:row-start-1" : "md:col-start-1 md:row-start-1",
          )}
        >
          {shop && (
            <ShopMark
              shop={shop}
              fallbackName={texts.shopUnknown}
              size="sm"
              className={cn(
                "mb-1 hidden text-xs font-medium",
                lg ? "lg:inline-flex" : "md:inline-flex",
              )}
            />
          )}
          <span className="block">
            <span id={titleId} className="font-semibold break-words">
              {title}
            </span>
            {name && (
              <span
                className={cn(
                  "hidden text-(--panel-muted)",
                  lg ? "lg:inline" : "md:inline",
                )}
              >
                {" · "}
                {name}
              </span>
            )}
          </span>
        </span>
        <span
          className={cn(
            "justify-self-end font-semibold whitespace-nowrap tabular-nums",
            lg
              ? "lg:col-start-2 lg:row-start-1 lg:text-right"
              : "md:col-start-2 md:row-start-1 md:text-right",
          )}
        >
          {amount}
        </span>
        <span
          className={cn(
            "min-w-0 text-xs text-(--panel-muted)",
            lg ? "lg:hidden" : "md:hidden",
          )}
        >
          {name}
        </span>
        <span
          className={cn(
            "justify-self-end",
            lg
              ? "lg:col-start-3 lg:row-start-1 lg:justify-self-start"
              : "md:col-start-3 md:row-start-1 md:justify-self-start",
          )}
        >
          {pill}
        </span>
        <span
          id={noteId}
          className={cn(
            "col-span-full mt-1.5 flex items-start gap-1.5 text-xs text-(--panel-muted)",
            lg
              ? "lg:col-span-1 lg:col-start-1 lg:row-start-2 lg:mt-0.5"
              : "md:col-span-1 md:col-start-1 md:row-start-2 md:mt-0.5",
          )}
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
        onClick={() => onOpen(order.id, order.projectId)}
        // Names the row with everything it shows: number, shop (when shown),
        // date, amount, status and the checkout name when there is one.
        aria-label={[
          fillText(texts.orderNumber, { ref }),
          shopName,
          date,
          amount,
          orderStatusLabel(order.status, texts) ?? order.status.trim(),
          name,
        ]
          .filter(Boolean)
          .join(", ")}
        className={cn(
          rowGrid,
          "w-full cursor-pointer transition-colors hover:border-[color-mix(in_srgb,var(--panel-fg)_25%,var(--panel-border))] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--panel-accent-text-now)",
          lg
            ? "lg:hover:bg-[color-mix(in_srgb,var(--panel-surface-2)_55%,transparent)]"
            : "md:hover:bg-[color-mix(in_srgb,var(--panel-surface-2)_55%,transparent)]",
        )}
      >
        {shop && (
          <span
            className={cn(
              "col-span-full mb-1 flex min-w-0 items-center",
              lg ? "lg:hidden" : "md:hidden",
            )}
          >
            <ShopMark
              shop={shop}
              fallbackName={texts.shopUnknown}
              size="sm"
              className="text-xs font-medium"
            />
          </span>
        )}
        <span
          className={cn(
            "font-semibold tabular-nums",
            lg ? "lg:col-start-1 lg:row-start-1" : "md:col-start-1 md:row-start-1",
          )}
        >
          {ref}
        </span>
        <span
          className={cn(
            "justify-self-end font-semibold whitespace-nowrap tabular-nums",
            lg
              ? "lg:col-start-4 lg:row-start-1 lg:text-right"
              : "md:col-start-4 md:row-start-1 md:text-right",
          )}
        >
          {amount}
        </span>
        <span
          className={cn(
            "text-sm text-(--panel-muted)",
            lg ? "lg:col-start-2 lg:row-start-1" : "md:col-start-2 md:row-start-1",
          )}
        >
          {date}
        </span>
        <span
          className={cn(
            "justify-self-end",
            lg
              ? "lg:col-start-5 lg:row-start-1 lg:justify-self-start"
              : "md:col-start-5 md:row-start-1 md:justify-self-start",
          )}
        >
          {pill}
        </span>
        <span
          className={cn(
            "col-span-full mt-0.5 flex min-w-0 items-center justify-between gap-2",
            lg
              ? "lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:mt-0"
              : "md:col-span-1 md:col-start-3 md:row-start-1 md:mt-0",
          )}
        >
          {shop ? (
            <span className="flex min-w-0 flex-1 flex-col">
              <ShopMark
                shop={shop}
                fallbackName={texts.shopUnknown}
                size="sm"
                className={cn(
                  "hidden text-sm font-medium",
                  lg ? "lg:inline-flex" : "md:inline-flex",
                )}
              />
              {name && (
                <span className="min-w-0 truncate text-xs text-(--panel-muted)">
                  {name}
                </span>
              )}
            </span>
          ) : (
            <span
              className={cn(
                "min-w-0 truncate text-xs text-(--panel-muted)",
                lg ? "lg:text-sm" : "md:text-sm",
              )}
            >
              {name}
            </span>
          )}
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-(--panel-muted)",
              lg ? "lg:hidden" : "md:hidden",
            )}
          />
        </span>
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "hidden size-4 text-(--panel-muted)",
            lg
              ? "lg:col-start-6 lg:row-start-1 lg:block"
              : "md:col-start-6 md:row-start-1 md:block",
          )}
        />
      </button>
    </li>
  );
}

/** Skeleton rows in the same grid as `OrderRow`. */
export function OrderRowSkeletons({
  count = 4,
  wide = "md",
}: {
  count?: number;
  wide?: "md" | "lg";
}) {
  const lg = wide === "lg";
  const rowGrid = lg ? ROW_GRID_LG : ROW_GRID_MD;
  const bar =
    "h-3.5 animate-pulse rounded bg-(--panel-surface-2) motion-reduce:animate-none";
  return (
    <>
      <div
        className={cn(
          "mb-2",
          lg
            ? "lg:m-0 lg:bg-(--panel-surface-2) lg:px-5 lg:py-2.5"
            : "md:m-0 md:bg-(--panel-surface-2) md:px-5 md:py-2.5",
        )}
      >
        <div
          className={cn(
            bar,
            "h-2.5 w-24",
            lg ? "lg:bg-(--panel-border)" : "md:bg-(--panel-border)",
          )}
        />
      </div>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={cn(rowGrid, "mb-2.5", lg ? "lg:mb-0" : "md:mb-0")}
        >
          <div className={cn(bar, "w-20")} />
          <div
            className={cn(
              bar,
              "w-16 justify-self-end",
              lg ? "lg:col-start-4 lg:row-start-1" : "md:col-start-4 md:row-start-1",
            )}
          />
          <div
            className={cn(
              bar,
              "w-24",
              lg ? "lg:col-start-2 lg:row-start-1" : "md:col-start-2 md:row-start-1",
            )}
          />
          <div
            className={cn(
              bar,
              "h-5 w-20 justify-self-end rounded-full",
              lg
                ? "lg:col-start-5 lg:row-start-1 lg:justify-self-start"
                : "md:col-start-5 md:row-start-1 md:justify-self-start",
            )}
          />
        </div>
      ))}
    </>
  );
}
