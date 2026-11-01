import { getLocale } from "../../components/checkout/locale";
import { getPanelTexts } from "../texts";
import { Button } from "../../ui/button";
import { rpcProvider, useQuery } from "../../rpc-provider";
import { Skeleton } from "../../ui/skeleton";
import { useState } from "react";

interface PanelOrderHistoryComponentProps {
  projectID: string;
  accessToken: string;
  openOrderDetails: (orderId: string) => void;
}

const formatDate = (ts: number): string =>
  new Date(ts * 1000).toLocaleDateString(getLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const formatAmount = (amount: number, currency: string): string =>
  new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);

const statusColor: Record<string, string> = {
  draft: "text-neutral-600 dark:text-neutral-400",
  unpaid: "text-amber-700 dark:text-amber-300",
  paid: "text-green-700 dark:text-green-400",
  overdue: "text-red-700 dark:text-red-400",
  cancelled: "text-neutral-600 line-through dark:text-neutral-400",
  completed: "text-green-700 dark:text-green-400",
  processing: "text-blue-700 dark:text-blue-400",
  refunded: "text-purple-700 dark:text-purple-400",
};

function PanelOrderHistory({
  openOrderDetails,
  projectID,
  accessToken,
}: PanelOrderHistoryComponentProps) {
  const texts = getPanelTexts();
  const statusLabel: Record<string, string> = {
    draft: texts.statusDraft,
    unpaid: texts.statusUnpaid,
    paid: texts.statusPaid,
    overdue: texts.statusOverdue,
    cancelled: texts.statusCancelled,
    completed: texts.statusCompleted,
    processing: texts.statusProcessing,
    refunded: texts.statusRefunded,
  };
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data, isFetching, isError, refetch } = useQuery(rpcProvider.publicApi.getOrders, {
    projectId: projectID,
    accessToken,
    offset,
    limit,
  });

  const orders = data?.orders ?? [];
  const totalCount = data?.totalCount ?? 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(totalCount / limit);

  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
  };

  return (
    <>
      <h3 className="text-2xl">{texts.ordersHeading}</h3>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {texts.ordersDescription}
      </p>

      {isFetching ? (
        <div className="mt-6 flex w-full flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <div className="space-y-2 text-right">
                  <Skeleton className="ml-auto h-4 w-16" />
                  <Skeleton className="ml-auto h-3 w-12" />
                </div>
              </div>
              <div className="mt-3">
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="mt-6 space-y-3">
          <p>{texts.ordersError}</p>
          <Button
            onClick={() => void refetch()}
            className="min-h-11 focus-visible:outline-2 focus-visible:outline-current"
          >
            {texts.retry}
          </Button>
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-6 text-sm text-neutral-600 dark:text-neutral-400">{texts.ordersEmpty}</div>
      ) : (
        <div>
          <div className="mt-6 flex w-full flex-col gap-3">
            {orders.map((order) => (
              <button
                key={order.id}
                onClick={() => openOrderDetails(order.id)}
                className="block min-h-11 focus-visible:outline-2 focus-visible:outline-current rounded-xl bg-white p-4 text-left shadow-sm transition-colors hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 break-words">
                    <p className="font-medium">{texts.orderLabel} #{order.id}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {order.customerName || texts.customerLabel}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">
                      {formatAmount(order.totalAmount, order.currency)}
                    </p>
                    <p
                      className={`text-xs font-medium ${statusColor[order.status] ?? "text-neutral-400"}`}
                    >
                      {statusLabel[order.status] ?? order.status}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                  <span>
                    {texts.dateLabel}:{" "}
                    {order.createdAt
                      ? formatDate(Number(order.createdAt.seconds))
                      : "-"}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {currentPage >= totalPages && (
            <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
              {texts.ordersEnd}
            </p>
          )}
          {totalPages > 1 && (
            <nav
              aria-label={texts.paginationLabel}
              className="mt-4 flex flex-wrap items-center justify-center gap-2"
            >
              {currentPage > 1 && (
                <Button variant="outline" className="min-h-11" onClick={() => handlePageChange(offset - limit)}>
                  {texts.previousPage}
                </Button>
              )}
              {Array.from(new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages]))
                .filter(page => page > 0 && page <= totalPages)
                .sort((a, b) => a - b)
                .map(page => (
                  <Button
                    key={page}
                    variant={page === currentPage ? "secondary" : "ghost"}
                    className="min-h-11 min-w-11"
                    aria-current={page === currentPage ? "page" : undefined}
                    onClick={() => handlePageChange((page - 1) * limit)}
                  >
                    {page}
                  </Button>
                ))}
              {currentPage < totalPages && (
                <Button variant="outline" className="min-h-11" onClick={() => handlePageChange(offset + limit)}>
                  {texts.nextPage}
                </Button>
              )}
            </nav>
          )}
        </div>
      )}
    </>
  );
}

export default PanelOrderHistory;
