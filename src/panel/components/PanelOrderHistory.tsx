import { Loader2, Receipt } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getLocale } from "../../components/checkout/locale";
import { cn } from "../../lib/utils";
import { rpcProvider, useInfiniteQuery } from "../../rpc-provider";
import { Button } from "../../ui/button";
import { selectedShop, shopsOfOrders, type ShopOption } from "../shop-filter";
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
import { ShopPills } from "./shared/ShopPills";

interface PanelOrderHistoryComponentProps {
  projectID: string;
  accessToken: string;
  openOrderDetails: (orderId: string, orderProject?: string) => void;
  /** Action of the empty state ("Przejdź do biblioteki"); hidden without it. */
  openLibrary?: () => void;
  /** Selected shop filter from URL (`shop` param), global panel only. */
  shop?: string;
  onShopChange?: (shop: string | undefined) => void;
}

/** Orders per "Pokaż więcej" step. */
export const ORDERS_PAGE_SIZE = 20;

/** The list wrapper: plain cards on small viewports, one divided card on wide viewports. */
const LIST_CARD_MD =
  "md:overflow-hidden md:rounded-xl md:border md:border-(--panel-border) md:bg-(--panel-surface)";
const LIST_CARD_LG =
  "lg:overflow-hidden lg:rounded-xl lg:border lg:border-(--panel-border) lg:bg-(--panel-surface)";

const nextOffset = (
  last: { orders: readonly unknown[]; totalCount: number },
  pages: readonly Array<{ orders: readonly unknown[] }>[number][],
) => {
  const loaded = pages.reduce((sum, page) => sum + page.orders.length, 0);
  return last.orders.length > 0 && loaded < last.totalCount
    ? loaded
    : undefined;
};

/**
 * Order history, option A: a compact list grouped by month with
 * "Pokaż więcej". Rows of old orders without an id are static and say why.
 * On the global panel (`projectID === ""`), shows shop pills (2+ shops) and
 * per-row shop marks while viewing all shops.
 */
function PanelOrderHistory({
  openOrderDetails,
  openLibrary,
  projectID,
  accessToken,
  shop: shopParam,
  onShopChange,
}: PanelOrderHistoryComponentProps) {
  const locale = getLocale();
  const texts = getPanelTexts(locale);
  const isGlobal = !projectID;
  const wide = isGlobal ? "lg" : "md";
  const listCard = isGlobal ? LIST_CARD_LG : LIST_CARD_MD;

  const [internalShop, setInternalShop] = useState<string | undefined>(shopParam);
  const rawShop = onShopChange ? shopParam : internalShop;
  const handleShopChange = onShopChange ?? setInternalShop;

  // Global panel: always-on all-shops query supplying `shops[]` and "Wszystkie".
  const allQuery = useInfiniteQuery(
    rpcProvider.publicApi.getOrders,
    { projectId: "", accessToken, offset: 0, limit: ORDERS_PAGE_SIZE },
    {
      enabled: isGlobal,
      pageParamKey: "offset",
      getNextPageParam: nextOffset,
    },
  );

  const shops = useMemo<ShopOption[]>(
    () =>
      isGlobal
        ? shopsOfOrders(allQuery.data?.pages[0]?.shops, texts.shopUnknown)
        : [],
    [isGlobal, allQuery.data, texts.shopUnknown],
  );

  const activeShop = isGlobal ? selectedShop(shops, rawShop) : undefined;
  const shopQueryProjectId = isGlobal ? (activeShop ?? "") : projectID;
  const shopQueryEnabled = isGlobal ? Boolean(activeShop) : true;

  // Shop panel (always) OR global panel when a valid shop pill is selected.
  const shopQuery = useInfiniteQuery(
    rpcProvider.publicApi.getOrders,
    {
      projectId: shopQueryProjectId,
      accessToken,
      offset: 0,
      limit: ORDERS_PAGE_SIZE,
    },
    {
      enabled: shopQueryEnabled,
      pageParamKey: "offset",
      getNextPageParam: nextOffset,
    },
  );

  const query = isGlobal && !activeShop ? allQuery : shopQuery;

  const shopById = useMemo(
    () => new Map(shops.map((item) => [item.projectId, item])),
    [shops],
  );

  const orders = useMemo<OrderRowData[]>(() => {
    const seen = new Set<string>();
    const rows: OrderRowData[] = [];
    // Show per-row shop marks only on the global panel when viewing all shops
    // and the server provided `shops[]` + order `projectId`s.
    const showRowShop = isGlobal && !activeShop && shops.length > 0;
    for (const page of query.data?.pages ?? []) {
      for (const order of page.orders) {
        if (order.id !== "") {
          if (seen.has(order.id)) continue;
          seen.add(order.id);
        }
        const orderProjectId = order.projectId?.trim() || (activeShop ?? "");
        const resolvedShop =
          showRowShop && orderProjectId
            ? shopById.get(orderProjectId) ?? {
                projectId: orderProjectId,
                name: texts.shopUnknown,
              }
            : undefined;
        rows.push({
          id: order.id,
          status: order.status,
          totalAmount: Number(order.totalAmount),
          currency: order.currency,
          customerName: order.customerName,
          date: timestampToDate(order.createdAt),
          projectId: orderProjectId || undefined,
          shop: resolvedShop,
        });
      }
    }
    return rows;
  }, [query.data, isGlobal, activeShop, shops.length, shopById, texts.shopUnknown]);

  const pages = query.data?.pages ?? [];
  const totalCount = pages[pages.length - 1]?.totalCount ?? orders.length;
  const allTotalCount = allQuery.data?.pages[0]?.totalCount;
  const showNames = namesDiffer(orders.map((order) => order.customerName));
  const groups = groupByMonth(orders, (order) => order.date);

  // Announce how many orders "Pokaż więcej" added.
  const [announcement, setAnnouncement] = useState("");
  const countBeforeMore = useRef<number | null>(null);
  useEffect(() => {
    countBeforeMore.current = null;
  }, [activeShop]);
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
  const showPills = isGlobal && shops.length >= 2;
  const liveCountText =
    !firstLoad && !failed ? ordersCountText(texts, locale, totalCount) : undefined;

  return (
    <div
      className={cn(
        "flex w-full flex-col",
        isGlobal ? "max-w-[840px]" : "max-w-[720px]",
      )}
    >
      <header className={showPills ? "mb-3" : "mb-5"}>
        <h1 className="text-2xl font-semibold tracking-tight">{texts.ordersTitle}</h1>
        {!firstLoad && !failed && orders.length > 0 && (
          <p className="mt-0.5 text-sm text-(--panel-muted) tabular-nums">
            {ordersCountText(texts, locale, totalCount)}
          </p>
        )}
      </header>

      {showPills && (
        <ShopPills
          shops={shops}
          value={activeShop}
          onChange={handleShopChange}
          label={texts.shopFilterLabel}
          allLabel={texts.shopFilterAll}
          unknownShopLabel={texts.shopUnknown}
          allCount={allTotalCount}
          countText={liveCountText}
          srOnlyCount
          className="mb-4"
        />
      )}

      {firstLoad ? (
        <div role="status" aria-label={texts.ordersLoading} className={listCard}>
          <OrderRowSkeletons wide={wide} />
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
        activeShop ? (
          <PanelEmptyState
            icon={<Receipt />}
            title={texts.ordersEmptyShopTitle}
            description={texts.ordersEmptyShopText}
            action={
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => handleShopChange(undefined)}
              >
                {texts.ordersShowAll}
              </Button>
            }
          />
        ) : (
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
        )
      ) : (
        <>
          <div className={listCard} data-orders-list="">
            {groups.map((group, groupIndex) => (
              <section
                key={`${group.key}-${groupIndex}`}
                className={cn(
                  "mt-5 first:mt-0",
                  isGlobal ? "lg:mt-0" : "md:mt-0",
                )}
              >
                {group.date && (
                  <MonthHeader
                    label={formatMonth(group.date, locale)}
                    wide={wide}
                  />
                )}
                <ul
                  className={cn(
                    "flex flex-col gap-2.5",
                    isGlobal
                      ? "lg:gap-0 lg:[&>li:first-child]:border-t-0 lg:[&>li:first-child>button]:border-t-0"
                      : "md:gap-0 md:[&>li:first-child]:border-t-0 md:[&>li:first-child>button]:border-t-0",
                  )}
                >
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
                      wide={wide}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {query.hasNextPage && !query.isFetchNextPageError && (
            <div
              className={cn(
                "mt-4 flex justify-center",
                isGlobal ? "lg:justify-start" : "md:justify-start",
              )}
            >
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
            <p
              className={cn(
                "mt-6 text-center text-sm text-(--panel-muted)",
                isGlobal ? "lg:text-left" : "md:text-left",
              )}
            >
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
