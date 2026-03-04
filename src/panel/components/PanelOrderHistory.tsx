import { rpcProvider, useQuery } from "../../rpc-provider";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../../ui/pagination";
import { Skeleton } from "../../ui/skeleton";
import { useState } from "react";

interface PanelOrderHistoryComponentProps {
  projectID: string;
  openOrderDetails: (orderId: string) => void;
}

const formatDate = (ts: number): string =>
  new Date(ts * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const formatAmount = (amount: number, currency: string): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);

const statusLabel: Record<string, string> = {
  draft: "Szkic",
  unpaid: "Nieopłacona",
  paid: "Opłacona",
  overdue: "Zaległa",
  cancelled: "Anulowana",
  completed: "Zakończone",
  processing: "Przetwarzane",
  refunded: "Zwrócone",
};

const statusColor: Record<string, string> = {
  draft: "text-neutral-400",
  unpaid: "text-yellow-500",
  paid: "text-green-600",
  overdue: "text-red-500",
  cancelled: "text-neutral-400 line-through",
  completed: "text-green-600",
  processing: "text-blue-500",
  refunded: "text-purple-500",
};

function PanelOrderHistory({
  openOrderDetails,
  projectID,
}: PanelOrderHistoryComponentProps) {
  const accessToken = localStorage.getItem("__access_token");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  console.log("projectID", projectID, accessToken);
  const { data, isFetching } = useQuery(rpcProvider.publicApi.getOrders, {
    projectId: projectID,
    accessToken: accessToken ?? "",
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
      <h3 className="text-2xl">Historia zamówień</h3>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Twoje zamówienia
      </p>

      {isFetching ? (
        <div className="mt-6 flex w-full flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-800"
            >
              <div className="flex items-center justify-between">
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
      ) : orders.length === 0 ? (
        <div className="mt-6 text-sm text-neutral-400">Brak zamówień.</div>
      ) : (
        <div>
          <div className="mt-6 flex w-full flex-col gap-3">
            {orders.map((order) => (
              <button
                key={order.id}
                onClick={() => openOrderDetails(order.id)}
                className="block rounded-xl bg-white p-4 text-left shadow-sm transition-colors hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Zamówienie #{order.id}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {order.customerName || "Klient"}
                    </p>
                  </div>
                  <div className="text-right">
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

                <div className="mt-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span>
                    Data:{" "}
                    {order.createdAt
                      ? formatDate(Number(order.createdAt.seconds))
                      : "-"}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {totalPages > 1 && !isFetching && (
            <div className="mt-4 flex justify-center">
              <Pagination>
                <PaginationContent>
                  {currentPage > 1 && (
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => handlePageChange(offset - limit)}
                      />
                    </PaginationItem>
                  )}

                  {currentPage > 2 && (
                    <PaginationItem>
                      <PaginationLink onClick={() => handlePageChange(0)}>
                        1
                      </PaginationLink>
                    </PaginationItem>
                  )}

                  {currentPage > 3 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}

                  {[currentPage - 1, currentPage, currentPage + 1]
                    .filter((page) => page > 0 && page <= totalPages)
                    .map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => handlePageChange((page - 1) * limit)}
                          isActive={currentPage === page}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}

                  {currentPage < totalPages - 2 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}

                  {currentPage < totalPages && (
                    <PaginationItem>
                      <PaginationLink
                        onClick={() =>
                          handlePageChange((totalPages - 1) * limit)
                        }
                      >
                        {totalPages}
                      </PaginationLink>
                    </PaginationItem>
                  )}

                  {currentPage < totalPages && (
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => handlePageChange(offset + limit)}
                      />
                    </PaginationItem>
                  )}
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default PanelOrderHistory;
