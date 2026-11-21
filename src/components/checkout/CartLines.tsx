import { useCartController } from "./cart-controller";
import { useCheckoutSlot } from "./appearance.context";
import { AlertIcon, BagIcon } from "./icons";
import { cx } from "./lib/cx";
import SingleProduct from "./SingleProduct";
import { LineSkeleton } from "./Skeleton";
import { useCheckoutText } from "./texts.context";

/**
 * The lines of the cart, and the states that stand in for them (plan part 3
 * §3.7): a skeleton shaped like two lines (shown after 150 ms), the empty cart
 * with a way back to the shop, and a failed load with its own retry button.
 */
export function CartLines({
  onContinueShopping,
}: {
  /** Closes the cart from the empty state. */
  onContinueShopping?: () => void;
}) {
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
  const emptyAction = useCheckoutSlot("emptyAction");
  const error = useCheckoutSlot("error");
  const skeleton = useCheckoutSlot("skeleton");
  const retryButton = useCheckoutSlot("retryButton");

  const emptyCartText = useCheckoutText("emptyCart");
  const continueShoppingText = useCheckoutText("continueShopping");
  const loadFailedText = useCheckoutText("loadFailed");
  const retryText = useCheckoutText("retry");
  const unavailableText = useCheckoutText("unavailableProduct");

  const noticeAlert = notice != null && notice.length > 0 && (
    <p
      role="alert"
      data-bitsnap-checkout-slot="error"
      className={cx("bsc-state-notice", error.className)}
      style={error.style}
    >
      {notice}
    </p>
  );

  const retryControl = (
    <button
      type="button"
      data-bitsnap-checkout-slot="retryButton"
      data-bitsnap-checkout-retry=""
      onClick={retry}
      className={cx("bsc-btn-secondary", retryButton.className)}
      style={retryButton.style}
    >
      {retryText}
    </button>
  );

  return (
    <>
      {status === "loading" && (
        <>
          <LineSkeleton className={skeleton.className} style={skeleton.style} />
          <LineSkeleton className={skeleton.className} style={skeleton.style} />
        </>
      )}

      {status === "error" && (
        <div className="bsc-state">
          <AlertIcon className="bsc-icon bsc-state-icon bsc-state-icon-error" />
          <p
            role="alert"
            data-bitsnap-checkout-slot="error"
            className={cx("bsc-state-text", error.className)}
            style={error.style}
          >
            {loadFailedText}
          </p>
          {noticeAlert}
          {retryControl}
        </div>
      )}

      {status === "empty" && (
        <div className="bsc-state">
          <BagIcon />
          <p
            data-bitsnap-checkout-slot="emptyState"
            className={cx("bsc-state-text", emptyState.className)}
            style={emptyState.style}
          >
            {emptyCartText}
          </p>
          {noticeAlert}
          {onContinueShopping != null && (
            <button
              type="button"
              data-bitsnap-checkout-slot="emptyAction"
              onClick={onContinueShopping}
              className={cx("bsc-btn-secondary", emptyAction.className)}
              style={emptyAction.style}
            >
              {continueShoppingText}
            </button>
          )}
        </div>
      )}

      <div
        data-bitsnap-checkout-slot="productList"
        className={productList.className}
        style={productList.style}
      >
        {status === "ready" && (
          <ul className="bsc-lines">
            {lines.map((item) => (
              <li key={item.line.id} className="bsc-line-item">
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
                  <LineSkeleton
                    className={skeleton.className}
                    style={skeleton.style}
                  />
                )}
              </li>
            ))}
            {unavailable.map(({ line, details }) => (
              // Not returned by the server: kept until the buyer removes it (S15).
              <li key={line.id} className="bsc-line-item">
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
              </li>
            ))}
          </ul>
        )}
      </div>

      {refreshFailed && (
        // Lines from the device are on screen, the server could not be asked.
        <div className="bsc-refresh">
          <p
            role="alert"
            data-bitsnap-checkout-slot="error"
            className={cx("bsc-refresh-text", error.className)}
            style={error.style}
          >
            {loadFailedText}
          </p>
          {retryControl}
        </div>
      )}
    </>
  );
}
