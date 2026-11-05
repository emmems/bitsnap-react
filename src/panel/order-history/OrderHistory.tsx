import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  CheckCircle2,
  FileText,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { getLocale } from "../../components/checkout/locale";
import { rpcProvider, useInfiniteQuery } from "../../rpc-provider";
import { usePanelConfig } from "../PanelProvider";
import { getPanelSession } from "../session-storage";
import {
  formatExactTime,
  formatRelativeTime,
  orderHistoryLine,
  type OrderHistoryIcon,
  type OrderHistoryLine,
} from "./lines";
import { getOrderHistoryTexts } from "./texts";

/** Entries per page: the history is short, "Pokaż więcej" loads the rest. */
export const ORDER_HISTORY_PAGE_SIZE = 10;

const ICONS: Record<OrderHistoryIcon, LucideIcon> = {
  paid: CheckCircle2,
  shipped: Truck,
  status: RefreshCw,
  tracking: Truck,
  email: Mail,
  access: KeyRound,
  invoice: FileText,
  refund: Undo2,
  return: RotateCcw,
};

type Row = OrderHistoryLine & { id: string; date?: Date };

/**
 * The short history of the buyer's own order (paid, access e-mail, access,
 * invoice, shipping, refund, return), newest first. Needs the panel session;
 * renders nothing without it, for an order with no history, while the first
 * page loads, and on any failure (an older server answers UNIMPLEMENTED).
 */
export function OrderHistory({ orderId }: { orderId: string }) {
  const { projectID, host } = usePanelConfig();
  const accessToken = getPanelSession(projectID, host);
  const locale = getLocale();
  const texts = getOrderHistoryTexts(locale);
  const enabled = !!projectID && !!accessToken && !!orderId;

  const query = useInfiniteQuery(
    rpcProvider.publicApi.getOrderHistory,
    {
      projectId: projectID ?? "",
      accessToken: accessToken ?? "",
      orderId,
      pageToken: "",
      pageSize: ORDER_HISTORY_PAGE_SIZE,
    },
    {
      pageParamKey: "pageToken",
      getNextPageParam: (page) =>
        page.result.case === "success" && page.result.value.nextPageToken !== ""
          ? page.result.value.nextPageToken
          : undefined,
      enabled,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  const rows = useMemo(() => {
    const result: Row[] = [];
    const seen = new Set<string>();
    for (const page of query.data?.pages ?? []) {
      if (page.result.case !== "success") continue;
      for (const entry of page.result.value.entries) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        const line = orderHistoryLine(entry, locale, texts);
        if (line == null) continue;
        result.push({
          ...line,
          id: entry.id,
          date: entry.occurredAt ? timestampDate(entry.occurredAt) : undefined,
        });
      }
    }
    return result;
  }, [query.data, locale, texts]);

  // A failed first page hides the block quietly; a failed "show more" keeps
  // what is shown and drops the button (a failure page has no next token).
  const firstPageOk = query.data?.pages[0]?.result.case === "success";
  if (!enabled || !firstPageOk || rows.length === 0) return null;
  const canShowMore = query.hasNextPage && !query.isFetchNextPageError;

  const now = new Date();
  return (
    <section
      aria-labelledby={`bitsnap-order-history-${orderId}`}
      className="border-t pt-4"
      data-bitsnap-order-history=""
    >
      <h3
        id={`bitsnap-order-history-${orderId}`}
        className="mb-3 font-semibold"
      >
        {texts.heading}
      </h3>
      <ol className="space-y-3">
        {rows.map((row) => {
          const Icon = ICONS[row.icon];
          return (
            <li key={row.id} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm leading-snug">
                  {row.text}
                  {row.link && (
                    <>
                      {" · "}
                      <a
                        href={row.link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-current"
                      >
                        {row.link.label}
                      </a>
                    </>
                  )}
                </p>
                {row.date && (
                  <time
                    dateTime={row.date.toISOString()}
                    title={formatExactTime(row.date, locale)}
                    className="text-xs text-muted-foreground"
                  >
                    {formatRelativeTime(row.date, locale, now)}
                  </time>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {canShowMore && (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-sm font-medium underline underline-offset-2 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-current"
        >
          {query.isFetchingNextPage && (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          )}
          {query.isFetchingNextPage ? texts.loadingMore : texts.showMore}
        </button>
      )}
    </section>
  );
}
