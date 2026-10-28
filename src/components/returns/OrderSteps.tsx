import { useEffect, useState } from "react";
import { useInstrumentContext } from "@/src/analytics/instrument";
import type { FormEvent } from "react";
import type {
  ReturnOrderLine,
  ReturnRequestView,
} from "@/src/gen/proto/public/v1/returns_pb";
import { Button } from "@/src/ui/button";
import { Label } from "@/src/ui/label";
import { Spinner } from "@/src/ui/spinner";
import { Textarea } from "@/src/ui/textarea";
import { cn } from "@/src/lib/utils";
import { useReturnsSlot } from "./appearance.context";
import { LogoutButton } from "./AuthSteps";
import { formatDate } from "./date";
import {
  useCreateReturn,
  useMyReturn,
  useReturnableOrder,
  useReturnOrders,
} from "./hooks";
import {
  EmptyState,
  ErrorMessage,
  INPUT_CLASS,
  Pagination,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  SkeletonRows,
  StatusBadge,
  StepFrame,
} from "./internal";
import { formatMoney } from "./money";
import { useReturnsContext } from "./ReturnsProvider";
import { clampQuantity, isLineSelectable, toSelectedLines } from "./selection";
import type { SelectedReturnLine } from "./state-machine";
import { useReturnsLocale, useReturnsText } from "./texts.context";

export type ReturnsOrderListProps = {
  /** Called with the canonical order ID of the chosen order. */
  onSelectOrder?: (orderId: string) => void;
  /** Shows a "my returns" button that calls this. */
  onOpenMyReturns?: () => void;
  /** Shows the sign out button. Defaults to `true`. */
  showLogout?: boolean;
  /** Orders per page. Defaults to 10. */
  pageSize?: number;
  className?: string;
};

/** Orders of the customer that still have products to return. */
export function ReturnsOrderList({
  onSelectOrder,
  onOpenMyReturns,
  showLogout = true,
  pageSize,
  className,
}: ReturnsOrderListProps) {
  useReturnsContext("ReturnsOrderList");
  const text = useReturnsText();
  const locale = useReturnsLocale();
  const orders = useReturnOrders({ pageSize });
  const list = useReturnsSlot("orderList");
  const card = useReturnsSlot("orderCard");
  const reference = useReturnsSlot("orderReference");
  const date = useReturnsSlot("orderDate");
  const total = useReturnsSlot("orderTotal");
  const secondaryButton = useReturnsSlot("secondaryButton");

  return (
    <StepFrame
      className={className}
      title={text("ordersTitle")}
      description={text("ordersDescription")}
    >
      {(showLogout || onOpenMyReturns != null) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {onOpenMyReturns != null ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-bitsnap-returns-slot="secondaryButton"
              className={cn(SECONDARY_BUTTON_CLASS, secondaryButton.className)}
              style={secondaryButton.style}
              onClick={onOpenMyReturns}
            >
              {text("myReturnsLink")}
            </Button>
          ) : (
            <span />
          )}
          {showLogout && <LogoutButton />}
        </div>
      )}
      {orders.isLoading ? (
        <SkeletonRows />
      ) : orders.errorKey != null ? (
        <ErrorMessage errorKey={orders.errorKey} onRetry={orders.refetch} />
      ) : orders.orders.length === 0 ? (
        <EmptyState>{text("ordersEmpty")}</EmptyState>
      ) : (
        <>
          <ul
            data-bitsnap-returns-slot="orderList"
            className={cn("flex flex-col gap-3", list.className)}
            style={list.style}
          >
            {orders.orders.map((order) => (
              <li
                key={order.canonicalOrderId}
                data-bitsnap-returns-slot="orderCard"
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 border p-4",
                  card.className,
                )}
                style={card.style}
              >
                <div className="flex flex-col gap-1">
                  <span
                    data-bitsnap-returns-slot="orderReference"
                    className={cn("font-medium", reference.className)}
                    style={reference.style}
                  >
                    {text("orderTitle", { reference: order.displayReference })}
                  </span>
                  <span
                    data-bitsnap-returns-slot="orderDate"
                    className={cn("text-sm", date.className)}
                    style={date.style}
                  >
                    {formatDate(order.purchasedAt, locale)}
                  </span>
                  <span className="text-sm">
                    {text("orderReturnableLines", {
                      count: order.returnableLineCount,
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    data-bitsnap-returns-slot="orderTotal"
                    className={cn("font-medium", total.className)}
                    style={total.style}
                  >
                    {formatMoney(order.totalMinor, order.currency, locale)}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label={`${text("orderSelect")}: ${text("orderTitle", {
                      reference: order.displayReference,
                    })}`}
                    data-bitsnap-returns-slot="secondaryButton"
                    className={cn(
                      SECONDARY_BUTTON_CLASS,
                      secondaryButton.className,
                    )}
                    style={secondaryButton.style}
                    onClick={() => onSelectOrder?.(order.canonicalOrderId)}
                  >
                    {text("orderSelect")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={orders.page}
            total={orders.total}
            hasNext={orders.hasNext}
            hasPrevious={orders.hasPrevious}
            isFetching={orders.isFetching}
            onNext={orders.next}
            onPrevious={orders.previous}
          />
        </>
      )}
    </StepFrame>
  );
}

export type ReturnsOrderDetailProps = {
  /** Canonical order ID, as given to `onSelectOrder`. */
  orderId: string;
  /** Called with the selected lines and the note when the form is valid. */
  onContinue?: (selection: { items: SelectedReturnLine[]; note: string }) => void;
  onBack?: () => void;
  /** Selection to start with, for example when coming back from the confirmation. */
  initialItems?: SelectedReturnLine[];
  initialNote?: string;
  className?: string;
};

/** Line and quantity selection of one order. */
export function ReturnsOrderDetail({
  orderId,
  onContinue,
  onBack,
  initialItems,
  initialNote,
  className,
}: ReturnsOrderDetailProps) {
  useReturnsContext("ReturnsOrderDetail");
  const instrument = useInstrumentContext();
  useEffect(() => {
    // The order id may be an access token: report no order reference.
    instrument.track("return_started", {}, { order_ref: null });
  }, [instrument]);
  const text = useReturnsText();
  const locale = useReturnsLocale();
  const { order, returnHistory, isLoading, errorKey, refetch } =
    useReturnableOrder(orderId);
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (initialItems ?? []).map((item) => [item.lineId, item.quantity]),
    ),
  );
  const [note, setNote] = useState(initialNote ?? "");
  const [showEmptyError, setShowEmptyError] = useState(false);
  const lineList = useReturnsSlot("lineList");
  const lineSlot = useReturnsSlot("line");
  const lineName = useReturnsSlot("lineName");
  const linePrice = useReturnsSlot("linePrice");
  const quantityControl = useReturnsSlot("lineQuantityControl");
  const quantityButton = useReturnsSlot("quantityButton");
  const quantityInput = useReturnsSlot("quantityInput");
  const ineligibleReason = useReturnsSlot("lineIneligibleReason");
  const noteInput = useReturnsSlot("noteInput");
  const submitButton = useReturnsSlot("submitButton");
  const history = useReturnsSlot("history");
  const historyEntry = useReturnsSlot("historyEntry");

  function setQuantity(line: ReturnOrderLine, value: number) {
    setShowEmptyError(false);
    setQuantities((current) => ({
      ...current,
      [line.lineId]: clampQuantity(value, line.availableQuantity),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (order == null) {
      return;
    }
    const items = toSelectedLines(
      order.lines.filter(isLineSelectable).map((line) => line.lineId),
      quantities,
    );
    if (items.length === 0) {
      setShowEmptyError(true);
      return;
    }
    onContinue?.({ items, note: note.trim() });
  }

  return (
    <StepFrame
      className={className}
      onBack={onBack}
      title={text("orderDetailTitle", {
        reference: order?.displayReference ?? "",
      })}
      description={text("orderDetailDescription")}
    >
      {isLoading ? (
        <SkeletonRows />
      ) : errorKey != null ? (
        <ErrorMessage errorKey={errorKey} onRetry={refetch} />
      ) : order == null ? null : (
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <ul
            data-bitsnap-returns-slot="lineList"
            className={cn("flex flex-col gap-3", lineList.className)}
            style={lineList.style}
          >
            {order.lines.map((line) => {
              const selectable = isLineSelectable(line);
              const quantity = quantities[line.lineId] ?? 0;
              const inputId = `bitsnap-returns-quantity-${line.lineId}`;

              return (
                <li
                  key={line.lineId}
                  data-bitsnap-returns-slot="line"
                  data-selected={quantity > 0 ? "" : undefined}
                  data-ineligible={selectable ? undefined : ""}
                  className={cn(
                    "flex flex-col gap-3 border p-4",
                    lineSlot.className,
                  )}
                  style={lineSlot.style}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span
                      data-bitsnap-returns-slot="lineName"
                      className={cn("font-medium", lineName.className)}
                      style={lineName.style}
                    >
                      {line.name}
                    </span>
                    <span
                      data-bitsnap-returns-slot="linePrice"
                      className={cn("text-sm", linePrice.className)}
                      style={linePrice.style}
                    >
                      {formatMoney(line.paidUnitMinor, line.currency, locale)}
                    </span>
                  </div>
                  {selectable ? (
                    <div
                      role="group"
                      aria-label={text("quantityLabel", { name: line.name })}
                      data-bitsnap-returns-slot="lineQuantityControl"
                      className={cn(
                        "flex items-center gap-2",
                        quantityControl.className,
                      )}
                      style={quantityControl.style}
                    >
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        aria-label={text("quantityDecrease", {
                          name: line.name,
                        })}
                        aria-controls={inputId}
                        disabled={quantity <= 0}
                        data-bitsnap-returns-slot="quantityButton"
                        className={cn(
                          SECONDARY_BUTTON_CLASS,
                          quantityButton.className,
                        )}
                        style={quantityButton.style}
                        onClick={() => setQuantity(line, quantity - 1)}
                      >
                        <span aria-hidden="true">-</span>
                      </Button>
                      <input
                        id={inputId}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={line.availableQuantity}
                        step={1}
                        value={quantity}
                        aria-label={text("quantityLabel", { name: line.name })}
                        data-bitsnap-returns-slot="quantityInput"
                        className={cn(
                          "h-8 w-16 rounded-md border px-2 text-center text-sm outline-none focus-visible:ring-[3px]",
                          INPUT_CLASS,
                          quantityInput.className,
                        )}
                        style={quantityInput.style}
                        onChange={(event) =>
                          setQuantity(line, event.target.valueAsNumber)
                        }
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        aria-label={text("quantityIncrease", {
                          name: line.name,
                        })}
                        aria-controls={inputId}
                        disabled={quantity >= line.availableQuantity}
                        data-bitsnap-returns-slot="quantityButton"
                        className={cn(
                          SECONDARY_BUTTON_CLASS,
                          quantityButton.className,
                        )}
                        style={quantityButton.style}
                        onClick={() => setQuantity(line, quantity + 1)}
                      >
                        <span aria-hidden="true">+</span>
                      </Button>
                      <span className="text-sm">
                        {text("quantityOfAvailable", {
                          available: line.availableQuantity,
                        })}
                      </span>
                    </div>
                  ) : (
                    <p
                      data-bitsnap-returns-slot="lineIneligibleReason"
                      className={cn("text-sm", ineligibleReason.className)}
                      style={ineligibleReason.style}
                    >
                      {line.exclusionReason !== ""
                        ? line.exclusionReason
                        : text("lineIneligibleFallback")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bitsnap-returns-note">{text("noteLabel")}</Label>
            <Textarea
              id="bitsnap-returns-note"
              name="note"
              rows={3}
              maxLength={1000}
              value={note}
              placeholder={text("notePlaceholder")}
              data-bitsnap-returns-slot="noteInput"
              className={cn(
                INPUT_CLASS,
                "dark:border-[color:var(--bitsnap-returns-border,#e4e4e7)] dark:placeholder:text-[color:var(--bitsnap-returns-muted-foreground,#71717a)] dark:focus-visible:ring-[color:var(--bitsnap-returns-focus-ring,#71717a)]",
                noteInput.className,
              )}
              style={noteInput.style}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {showEmptyError && <ErrorMessage errorKey="selectionEmpty" />}
          <Button
            type="submit"
            data-bitsnap-returns-slot="submitButton"
            className={cn(PRIMARY_BUTTON_CLASS, submitButton.className)}
            style={submitButton.style}
          >
            {text("selectionContinue")}
          </Button>
          {returnHistory.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                {text("previousReturnsTitle")}
              </h3>
              <ul
                data-bitsnap-returns-slot="history"
                className={cn("flex flex-col gap-2", history.className)}
                style={history.style}
              >
                {returnHistory.map((entry) => (
                  <li
                    key={entry.id}
                    data-bitsnap-returns-slot="historyEntry"
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 text-sm",
                      historyEntry.className,
                    )}
                    style={historyEntry.style}
                  >
                    <span>{entry.reference}</span>
                    <span>{formatDate(entry.createdAt, locale)}</span>
                    <StatusBadge status={entry.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      )}
    </StepFrame>
  );
}

export type ReturnsConfirmationProps = {
  /** Canonical order ID. */
  orderId: string;
  /** Lines chosen in the order detail step. */
  items: SelectedReturnLine[];
  note?: string;
  /** Called with the new return's ID and the created request. */
  onSubmitted?: (returnId: string, request: ReturnRequestView) => void;
  onBack?: () => void;
  className?: string;
};

/** Review of the selected lines and the submit action. */
export function ReturnsConfirmation({
  orderId,
  items,
  note,
  onSubmitted,
  onBack,
  className,
}: ReturnsConfirmationProps) {
  useReturnsContext("ReturnsConfirmation");
  const text = useReturnsText();
  const locale = useReturnsLocale();
  const { order, isLoading, errorKey: orderErrorKey, refetch } =
    useReturnableOrder(orderId);
  const create = useCreateReturn();
  const summary = useReturnsSlot("summary");
  const lineSlot = useReturnsSlot("line");
  const lineName = useReturnsSlot("lineName");
  const linePrice = useReturnsSlot("linePrice");
  const submitButton = useReturnsSlot("submitButton");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) {
      return;
    }
    const request = await create.submit({
      orderId,
      items: items.map((item) => ({
        lineId: item.lineId,
        quantity: item.quantity,
      })),
      note,
    });
    if (request != null) {
      onSubmitted?.(request.id, request);
    }
  }

  return (
    <StepFrame
      className={className}
      onBack={onBack}
      title={text("confirmationTitle")}
      description={text("confirmationDescription")}
    >
      {isLoading ? (
        <SkeletonRows rows={2} />
      ) : orderErrorKey != null ? (
        <ErrorMessage errorKey={orderErrorKey} onRetry={refetch} />
      ) : (
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div
            data-bitsnap-returns-slot="summary"
            className={cn("flex flex-col gap-3 border p-4", summary.className)}
            style={summary.style}
          >
            <h3 className="text-sm font-medium">
              {text("confirmationSummary")}
            </h3>
            <ul className="flex flex-col gap-3">
              {items.map((item) => {
                const line = order?.lines.find(
                  (candidate) => candidate.lineId === item.lineId,
                );

                return (
                  <li
                    key={item.lineId}
                    data-bitsnap-returns-slot="line"
                    className={cn(
                      "flex flex-wrap items-baseline justify-between gap-2",
                      lineSlot.className,
                    )}
                    style={lineSlot.style}
                  >
                    <span
                      data-bitsnap-returns-slot="lineName"
                      className={cn("font-medium", lineName.className)}
                      style={lineName.style}
                    >
                      {line?.name ?? item.lineId}
                    </span>
                    <span
                      data-bitsnap-returns-slot="linePrice"
                      className={cn("text-sm", linePrice.className)}
                      style={linePrice.style}
                    >
                      {text("confirmationQuantity", { quantity: item.quantity })}
                      {line != null &&
                        ` · ${formatMoney(
                          line.paidUnitMinor * BigInt(item.quantity),
                          line.currency,
                          locale,
                        )}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            {note != null && note !== "" && (
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{text("confirmationNote")}</span>
                <span className="whitespace-pre-wrap">{note}</span>
              </div>
            )}
          </div>
          {create.errorKey != null && <ErrorMessage errorKey={create.errorKey} />}
          <Button
            type="submit"
            disabled={create.isPending || items.length === 0}
            data-bitsnap-returns-slot="submitButton"
            className={cn(PRIMARY_BUTTON_CLASS, submitButton.className)}
            style={submitButton.style}
          >
            {create.isPending && <Spinner />}
            {text("confirmationSubmit")}
          </Button>
        </form>
      )}
    </StepFrame>
  );
}

export type ReturnsResultProps = {
  /** ID of the created return, as given to `onSubmitted`. */
  returnId: string;
  /** Called by the primary button, normally to go back to the orders. */
  onContinue?: () => void;
  /** Shows a "my returns" button that calls this. */
  onOpenMyReturns?: () => void;
  className?: string;
};

/** Success screen with the reference and the return instructions. */
export function ReturnsResult({
  returnId,
  onContinue,
  onOpenMyReturns,
  className,
}: ReturnsResultProps) {
  useReturnsContext("ReturnsResult");
  const text = useReturnsText();
  const { request, isLoading, errorKey, refetch } = useMyReturn(returnId);
  const success = useReturnsSlot("successState");
  const reference = useReturnsSlot("returnReference");
  const instructions = useReturnsSlot("returnInstructions");
  const submitButton = useReturnsSlot("submitButton");
  const secondaryButton = useReturnsSlot("secondaryButton");

  return (
    <section className={cn("flex flex-col gap-5", className)}>
      <div
        role="status"
        data-bitsnap-returns-slot="successState"
        className={cn("flex flex-col gap-4 border p-5", success.className)}
        style={success.style}
      >
        <h2 className="text-2xl font-semibold">{text("successTitle")}</h2>
        <p className="text-sm">{text("successDescription")}</p>
        {isLoading ? (
          <SkeletonRows rows={2} />
        ) : errorKey != null ? (
          <ErrorMessage errorKey={errorKey} onRetry={refetch} />
        ) : (
          request != null && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-sm">{text("successReference")}</span>
                <span
                  data-bitsnap-returns-slot="returnReference"
                  className={cn("text-lg font-semibold", reference.className)}
                  style={reference.style}
                >
                  {request.reference}
                </span>
              </div>
              {request.returnInstructions !== "" && (
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    {text("successInstructions")}
                  </span>
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
                </div>
              )}
            </>
          )
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          data-bitsnap-returns-slot="submitButton"
          className={cn(PRIMARY_BUTTON_CLASS, submitButton.className)}
          style={submitButton.style}
          onClick={onContinue}
        >
          {text("successDone")}
        </Button>
        {onOpenMyReturns != null && (
          <Button
            type="button"
            variant="secondary"
            data-bitsnap-returns-slot="secondaryButton"
            className={cn(SECONDARY_BUTTON_CLASS, secondaryButton.className)}
            style={secondaryButton.style}
            onClick={onOpenMyReturns}
          >
            {text("myReturnsLink")}
          </Button>
        )}
      </div>
    </section>
  );
}
