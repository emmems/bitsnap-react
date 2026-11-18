import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useMemo } from "react";
import { rpcProvider, useInfiniteQuery } from "../../../rpc-provider";
import { orderHistoryLine, type OrderHistoryLine } from "../../order-history/lines";
import { getOrderHistoryTexts } from "../../order-history/texts";

export const ORDER_TIMELINE_PAGE_SIZE = 10;

export type OrderTimelineRow = OrderHistoryLine & {
  id: string;
  kind: string;
  date?: Date;
};

export type OrderTimeline = {
  /** Rendered entries, newest first; empty while loading, on failure or with no history. */
  rows: OrderTimelineRow[];
  /** https link of the newest `invoice.issued` entry with one. */
  invoiceUrl: string | undefined;
  hasMore: boolean;
  isFetchingMore: boolean;
  fetchMore: () => void;
};

/**
 * The buyer's order history (`GetOrderHistory`), shared by the timeline and
 * the invoice button of the order page. Needs the panel session; any failure
 * (an older server answers UNIMPLEMENTED) gives an empty timeline.
 */
export function useOrderTimeline({
  projectID,
  accessToken,
  orderId,
  locale,
}: {
  projectID: string | undefined;
  accessToken: string | undefined;
  orderId: string | undefined;
  locale: string;
}): OrderTimeline {
  const enabled = !!projectID && !!accessToken && !!orderId;
  const query = useInfiniteQuery(
    rpcProvider.publicApi.getOrderHistory,
    {
      projectId: projectID ?? "",
      accessToken: accessToken ?? "",
      orderId: orderId ?? "",
      pageToken: "",
      pageSize: ORDER_TIMELINE_PAGE_SIZE,
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

  const texts = getOrderHistoryTexts(locale);
  const rows = useMemo(() => {
    const result: OrderTimelineRow[] = [];
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
          kind: entry.kind,
          date: entry.occurredAt ? timestampDate(entry.occurredAt) : undefined,
        });
      }
    }
    return result;
  }, [query.data, locale, texts]);

  const firstPageOk = query.data?.pages[0]?.result.case === "success";
  const visible = enabled && firstPageOk ? rows : [];
  return {
    rows: visible,
    invoiceUrl: visible.find((row) => row.kind === "invoice.issued" && row.link)
      ?.link?.url,
    hasMore: visible.length > 0 && query.hasNextPage && !query.isFetchNextPageError,
    isFetchingMore: query.isFetchingNextPage,
    fetchMore: () => void query.fetchNextPage(),
  };
}
