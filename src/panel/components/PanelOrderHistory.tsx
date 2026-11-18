import { Loader2, Receipt } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getLocale } from "../../components/checkout/locale";
import { rpcProvider, useInfiniteQuery } from "../../rpc-provider";
import { Button } from "../../ui/button";
import { getPanelTexts } from "../texts";
import {
  fillText,
  formatMonth,
  groupByMonth,
  namesDiffer,
  ordersCountText,
  timestampToDate,
} from "./orders/format";
import {
  MonthHeader,
  OrderRow,
  OrderRowSkeletons,
  type OrderRowData,
} from "./orders/OrderRows";
import { PanelEmptyState } from "./shared/PanelEmptyState";

interface PanelOrderHistoryComponentProps {
  projectID: string;
  accessToken: string;
  openOrderDetails: (orderId: string) => void;
  /** Action of the empty state ("Przejdź do biblioteki"); hidden without it. */
  openLibrary?: () => void;
}

/** Orders per "Pokaż więcej" step. */
export const ORDERS_PAGE_SIZE = 20;

/** The list wrapper: plain on a phone, one divided card from `md`. */
const LIST_CARD =
  "md:overflow-hidden md:rounded-xl md:border md:border-(--panel-border) md:bg-(--panel-surface)";

/**
 * Order history, option A: a compact list grouped by month with
 * "Pokaż więcej". Rows of old orders without an id are static and say why.
 */
function PanelOrderHistory({
  openOrderDetails,
  openLibrary,
  projectID,
  accessToken,
}: PanelOrderHistoryComponentProps) {
  const locale = getLocale();
  const texts = getPanelTexts(locale);

  const query = useInfiniteQuery(
    rpcProvider.publicApi.getOrders,
    { projectId: projectID, accessToken, offset: 0, limit: ORDERS_PAGE_SIZE },
    {
      pageParamKey: "offset",
      getNextPageParam: (last, pages) => {
        const loaded = pages.reduce((sum, page) => sum + page.orders.length, 0);
        return last.orders.length > 0 && loaded < last.totalCount
          ? loaded
          : undefined;
      },
    },
  );

  const orders = useMemo<OrderRowData[]>(() => {
    const seen = new Set<string>();
    const rows: OrderRowData[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const order of page.orders) {
        if (order.id !== "") {
          if (seen.has(order.id)) continue;
          seen.add(order.id);
        }
        rows.push({
          id: order.id,
          status: order.status,
          totalAmount: Number(order.totalAmount),
          currency: order.currency,
          customerName: order.customerName,
          date: timestampToDate(order.createdAt),
        });
      }
    }
    return rows;
  }, [query.data]);

  const pages = query.data?.pages ?? [];
  const totalCount = pages[pages.length - 1]?.totalCount ?? orders.length;
  const showNames = namesDiffer(orders.map((order) => order.customerName));
  const groups = groupByMonth(orders, (order) => order.date);

  // Announce how many orders "Pokaż więcej" added.
  const [announcement, setAnnouncement] = useState("");
  const countBeforeMore = useRef<number | null>(null);
  useEffect(() => {
    if (countBeforeMore.current == null || query.isFetchingNextPage) return;
    const added = orders.length - countBeforeMore.current;
    countBeforeMore.current = null;
    if (added > 0) {
      setAnnouncement(fillText(texts.ordersLoadedMore, { count: added }));
    }
  }, [orders.length, query.isFetchingNextPage, texts.ordersLoadedMore]);

  const loadMore = () => {
    countBeforeMore.current = orders.length;
    void query.fetchNextPage();
  };

  const firstLoad = query.isPending;
  const failed = query.isError && orders.length === 0;

  return (
    <div className="flex w-full max-w-[720px] flex-col">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{texts.ordersTitle}</h1>
        {!firstLoad && !failed && orders.length > 0 && (
          <p className="mt-0.5 text-sm text-(--panel-muted)">
            {ordersCountText(texts, locale, totalCount)}
          </p>
        )}
      </header>

      {firstLoad ? (
        <div role="status" aria-label={texts.ordersLoading} className={LIST_CARD}>
          <OrderRowSkeletons />
        </div>
      ) : failed ? (
        <PanelEmptyState
          role="alert"
          title={texts.ordersError}
          action={
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => void query.refetch()}
            >
              {texts.retry}
            </Button>
          }
        />
      ) : orders.length === 0 ? (
        <PanelEmptyState
          icon={<Receipt />}
          title={texts.ordersEmptyTitle}
          description={texts.ordersEmptyText}
          action={
            openLibrary ? (
              <Button className="min-h-11" onClick={openLibrary}>
                {texts.ordersEmptyAction}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className={LIST_CARD} data-orders-list="">
            {groups.map((group, groupIndex) => (
              <section key={`${group.key}-${groupIndex}`} className="mt-5 first:mt-0 md:mt-0">
                {group.date && (
                  <MonthHeader label={formatMonth(group.date, locale)} />
                )}
                <ul className="flex flex-col gap-2.5 md:gap-0 md:[&>li:first-child]:border-t-0 md:[&>li:first-child>button]:border-t-0">
                  {group.items.map((order, index) => (
                    <OrderRow
                      key={
                        order.id ||
                        `${order.date?.getTime() ?? "none"}-${groupIndex}-${index}`
                      }
                      order={order}
                      showName={showNames}
                      texts={texts}
                      locale={locale}
                      onOpen={openOrderDetails}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {query.hasNextPage && !query.isFetchNextPageError && (
            <div className="mt-4 flex justify-center md:justify-start">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={query.isFetchingNextPage}
                onClick={loadMore}
              >
                {query.isFetchingNextPage && (
                  <Loader2
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                )}
                {query.isFetchingNextPage
                  ? texts.ordersLoadingMore
                  : texts.ordersShowMore}
              </Button>
            </div>
          )}
          {query.isFetchNextPageError && (
            <div
              role="alert"
              className="mt-4 flex flex-wrap items-center gap-3 text-sm text-(--panel-danger)"
            >
              <span>{texts.ordersMoreError}</span>
              <Button variant="outline" className="min-h-11" onClick={loadMore}>
                {texts.retry}
              </Button>
            </div>
          )}
          {/* F8: the end note only after "Pokaż więcej" reached the end. */}
          {pages.length > 1 && !query.hasNextPage && (
            <p className="mt-6 text-center text-sm text-(--panel-muted) md:text-left">
              {texts.ordersEnd}
            </p>
          )}
        </>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

export default PanelOrderHistory;
