import React from "react";
import { cn } from "@/src/lib/utils";
import { useCartController } from "./cart-controller";
import { useCheckoutSlot } from "./appearance.context";
import SingleProduct from "./SingleProduct";
import { Skeleton } from "./Skeleton";
import { useCheckoutText } from "./texts.context";

/** The lines of the cart, and the loading, failed and empty states that stand in for them. */
export function CartLines() {
  const {
    status,
    lines,
    unavailable,
    refreshFailed,
    missingItemIds,
    notice,
    retry,
    setQuantity,
    priceWas,
    isRefreshing,
  } = useCartController();

  const productList = useCheckoutSlot("productList");
  const emptyState = useCheckoutSlot("emptyState");
  const error = useCheckoutSlot("error");
  const skeleton = useCheckoutSlot("skeleton");
  const checkoutButton = useCheckoutSlot("checkoutButton");

  const emptyCartText = useCheckoutText("emptyCart");
  const loadFailedText = useCheckoutText("loadFailed");
  const retryText = useCheckoutText("retry");
  const unavailableText = useCheckoutText("unavailableProduct");

  return (
    <>
      {status === "loading" && (
        <div className={"relative flex w-full justify-center flex-col gap-4"}>
          <Skeleton
            data-bitsnap-checkout-slot="skeleton"
            className={cn("w-full h-32", skeleton.className)}
            style={skeleton.style}
          />
          <Skeleton
            data-bitsnap-checkout-slot="skeleton"
            className={cn("w-full h-32", skeleton.className)}
            style={skeleton.style}
          />
        </div>
      )}

      {status === "error" && (
        <div className={"flex flex-col items-start gap-3 p-4"}>
          <p
            role="alert"
            data-bitsnap-checkout-slot="error"
            className={cn(error.className)}
            style={error.style}
          >
            {loadFailedText}
          </p>
          {notice != null && notice.length > 0 && (
            <p
              role="alert"
              data-bitsnap-checkout-slot="error"
              className={cn("text-sm", error.className)}
              style={error.style}
            >
              {notice}
            </p>
          )}
          <button
            type="button"
            data-bitsnap-checkout-slot="checkoutButton"
            data-bitsnap-checkout-retry=""
            onClick={retry}
            className={cn(
              "px-3 py-2 rounded-md transition font-bold",
              checkoutButton.className,
            )}
            style={checkoutButton.style}
          >
            {retryText}
          </button>
        </div>
      )}

      {status === "empty" && (
        <div className={"flex flex-col gap-4 p-4"}>
          <p
            data-bitsnap-checkout-slot="emptyState"
            className={cn(emptyState.className)}
            style={emptyState.style}
          >
            {emptyCartText}
          </p>
          {notice != null && notice.length > 0 && (
            <p
              role="alert"
              data-bitsnap-checkout-slot="error"
              className={cn("text-sm", error.className)}
              style={error.style}
            >
              {notice}
            </p>
          )}
        </div>
      )}

      <div
        data-bitsnap-checkout-slot="productList"
        className={cn(
          "max-h-[70vh] overflow-clip overflow-y-scroll",
          productList.className,
        )}
        style={productList.style}
      >
        {status === "ready" && (
          <ul className={"mt-5"}>
            {lines.map((item) => (
              <li key={item.line.id} className={"mb-3"}>
                {item.details != null ? (
                  <SingleProduct
                    isNotAvailable={missingItemIds.includes(
                      item.line.productID,
                    )}
                    quantity={item.line.quantity}
                    details={item.details}
                    unitPrice={item.unitPrice}
                    pricing={
                      // A pay-what-you-want line is charged its own or the
                      // suggested price, never a sale price.
                      item.payWhatYouWant === "none"
                        ? item.details.pricing
                        : undefined
                    }
                    priceWas={priceWas(item.line.id)}
                    marked={item.marked}
                    refreshing={isRefreshing(item.line.productID)}
                    url={item.line.url}
                    shouldUpdate={(newQuantity) =>
                      setQuantity(item.line.id, newQuantity)
                    }
                  />
                ) : (
                  // A line the server has not described yet (another tab added it).
                  <Skeleton
                    data-bitsnap-checkout-slot="skeleton"
                    className={cn("mx-3 h-20", skeleton.className)}
                    style={skeleton.style}
                  />
                )}
                <hr className="h-1" />
              </li>
            ))}
            {unavailable.map(({ line, details }) => (
              // Not returned by the server: kept until the buyer removes it (S15).
              <li key={line.id} className={"mb-3"}>
                <SingleProduct
                  isNotAvailable
                  quantity={line.quantity}
                  details={
                    details ?? {
                      id: line.productID,
                      name: unavailableText,
                      price: 0,
                      currency: "",
                      image_url: null,
                    }
                  }
                  url={line.url}
                  shouldUpdate={(newQuantity) =>
                    setQuantity(line.id, newQuantity)
                  }
                />
                <hr className="h-1" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {refreshFailed && (
        <div className={"flex flex-row items-center justify-between gap-3 mx-3"}>
          <p
            role="alert"
            data-bitsnap-checkout-slot="error"
            className={cn("text-sm", error.className)}
            style={error.style}
          >
            {loadFailedText}
          </p>
          <button
            type="button"
            data-bitsnap-checkout-slot="checkoutButton"
            data-bitsnap-checkout-retry=""
            onClick={retry}
            className={cn(
              "px-3 py-2 rounded-md transition font-bold",
              checkoutButton.className,
            )}
            style={checkoutButton.style}
          >
            {retryText}
          </button>
        </div>
      )}
    </>
  );
}
