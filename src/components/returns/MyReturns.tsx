import { Button } from "@/src/ui/button";
import { cn } from "@/src/lib/utils";
import { useReturnsSlot } from "./appearance.context";
import { formatDate } from "./date";
import { useMyReturn, useMyReturns } from "./hooks";
import {
  EmptyState,
  ErrorMessage,
  Pagination,
  SECONDARY_BUTTON_CLASS,
  SkeletonRows,
  StatusBadge,
  StepFrame,
  useRefundStatusText,
} from "./internal";
import { formatMoney } from "./money";
import { useReturnsContext } from "./ReturnsProvider";
import { useReturnsLocale, useReturnsText } from "./texts.context";

export type ReturnsMyReturnsListProps = {
  /** Called with the ID of the chosen return. */
  onSelectReturn?: (returnId: string) => void;
  onBack?: () => void;
  /** Returns per page. Defaults to 10. */
  pageSize?: number;
  className?: string;
};

/** Return requests the customer has submitted, with their status. */
export function ReturnsMyReturnsList({
  onSelectReturn,
  onBack,
  pageSize,
  className,
}: ReturnsMyReturnsListProps) {
  useReturnsContext("ReturnsMyReturnsList");
  const text = useReturnsText();
  const locale = useReturnsLocale();
  const refundText = useRefundStatusText();
  const myReturns = useMyReturns({ pageSize });
  const list = useReturnsSlot("returnList");
  const card = useReturnsSlot("returnCard");
  const reference = useReturnsSlot("returnReference");
  const secondaryButton = useReturnsSlot("secondaryButton");

  return (
    <StepFrame
      className={className}
      onBack={onBack}
      title={text("myReturnsTitle")}
      description={text("myReturnsDescription")}
    >
      {myReturns.isLoading ? (
        <SkeletonRows />
      ) : myReturns.errorKey != null ? (
        <ErrorMessage errorKey={myReturns.errorKey} onRetry={myReturns.refetch} />
      ) : myReturns.returns.length === 0 ? (
        <EmptyState>{text("myReturnsEmpty")}</EmptyState>
      ) : (
        <>
          <ul
            data-bitsnap-returns-slot="returnList"
            className={cn("flex flex-col gap-3", list.className)}
            style={list.style}
          >
            {myReturns.returns.map((item) => (
              <li
                key={item.id}
                data-bitsnap-returns-slot="returnCard"
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 border p-4",
                  card.className,
                )}
                style={card.style}
              >
                <div className="flex flex-col gap-1">
                  <span
                    data-bitsnap-returns-slot="returnReference"
                    className={cn("font-medium", reference.className)}
                    style={reference.style}
                  >
                    {item.reference}
                  </span>
                  <span className="text-sm">
                    {formatDate(item.createdAt, locale)}
                  </span>
                  <span className="text-sm">
                    {text("myReturnRefund")}: {refundText(item.refundStatus)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={item.status} />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label={`${text("myReturnOpen")}: ${item.reference}`}
                    data-bitsnap-returns-slot="secondaryButton"
                    className={cn(
                      SECONDARY_BUTTON_CLASS,
                      secondaryButton.className,
                    )}
                    style={secondaryButton.style}
                    onClick={() => onSelectReturn?.(item.id)}
                  >
                    {text("myReturnOpen")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={myReturns.page}
            total={myReturns.total}
            hasNext={myReturns.hasNext}
            hasPrevious={myReturns.hasPrevious}
            isFetching={myReturns.isFetching}
            onNext={myReturns.next}
            onPrevious={myReturns.previous}
          />
        </>
      )}
    </StepFrame>
  );
}

export type ReturnsMyReturnDetailProps = {
  /** ID of the return to show. */
  returnId: string;
  onBack?: () => void;
  className?: string;
};

/** Status, lines, refund and history of one return request. */
export function ReturnsMyReturnDetail({
  returnId,
  onBack,
  className,
}: ReturnsMyReturnDetailProps) {
  useReturnsContext("ReturnsMyReturnDetail");
  const text = useReturnsText();
  const locale = useReturnsLocale();
  const refundText = useRefundStatusText();
  const { request, isLoading, errorKey, refetch } = useMyReturn(returnId);
  const summary = useReturnsSlot("summary");
  const lineList = useReturnsSlot("lineList");
  const lineSlot = useReturnsSlot("line");
  const lineName = useReturnsSlot("lineName");
  const instructions = useReturnsSlot("returnInstructions");
  const history = useReturnsSlot("history");
  const historyEntry = useReturnsSlot("historyEntry");

  return (
    <StepFrame
      className={className}
      onBack={onBack}
      title={
        request != null
          ? text("myReturnTitle", { reference: request.reference })
          : text("myReturnDetailTitle")
      }
    >
      {isLoading ? (
        <SkeletonRows />
      ) : errorKey != null ? (
        <ErrorMessage errorKey={errorKey} onRetry={refetch} />
      ) : (
        request != null && (
          <div className="flex flex-col gap-5">
            <div
              data-bitsnap-returns-slot="summary"
              className={cn(
                "flex flex-col gap-2 border p-4 text-sm",
                summary.className,
              )}
              style={summary.style}
            >
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={request.status} />
                <span>
                  {text("myReturnCreatedAt")}:{" "}
                  {formatDate(request.createdAt, locale)}
                </span>
              </div>
              <span>
                {text("myReturnRefund")}: {refundText(request.refundStatus)}
                {request.refundAmountMinor > BigInt(0) &&
                  ` · ${formatMoney(request.refundAmountMinor, request.currency, locale)}`}
              </span>
              {request.customerNote !== "" && (
                <span className="whitespace-pre-wrap">
                  {text("myReturnNote")}: {request.customerNote}
                </span>
              )}
            </div>
            {request.returnInstructions !== "" && (
              <p
                data-bitsnap-returns-slot="returnInstructions"
                className={cn(
                  "whitespace-pre-wrap border p-3 text-sm",
                  instructions.className,
                )}
                style={instructions.style}
              >
                {request.returnInstructions}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{text("myReturnLines")}</h3>
              <ul
                data-bitsnap-returns-slot="lineList"
                className={cn("flex flex-col gap-3", lineList.className)}
                style={lineList.style}
              >
                {request.lines.map((line) => (
                  <li
                    key={line.lineId}
                    data-bitsnap-returns-slot="line"
                    className={cn(
                      "flex flex-wrap items-baseline justify-between gap-2 border p-4",
                      lineSlot.className,
                    )}
                    style={lineSlot.style}
                  >
                    <span
                      data-bitsnap-returns-slot="lineName"
                      className={cn("font-medium", lineName.className)}
                      style={lineName.style}
                    >
                      {line.name}
                    </span>
                    <span className="text-sm">
                      {text("myReturnLineQuantities", {
                        requested: line.requestedQuantity,
                        approved: line.approvedQuantity,
                        received: line.receivedQuantity,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {request.history.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">{text("myReturnHistory")}</h3>
                <ul
                  data-bitsnap-returns-slot="history"
                  className={cn("flex flex-col gap-2", history.className)}
                  style={history.style}
                >
                  {request.history.map((entry) => (
                    <li
                      key={entry.id}
                      data-bitsnap-returns-slot="historyEntry"
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-2 text-sm",
                        historyEntry.className,
                      )}
                      style={historyEntry.style}
                    >
                      <StatusBadge status={entry.status} />
                      <span>{formatDate(entry.createdAt, locale)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      )}
    </StepFrame>
  );
}
