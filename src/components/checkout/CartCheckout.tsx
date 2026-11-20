import React from "react";
import { cn } from "@/src/lib/utils";
import { Spinner } from "@/src/ui/spinner";
import { useCheckoutSlot } from "./appearance.context";
import { useCartController } from "./cart-controller";
import { catalogUnitPrice } from "./cart-view";
import CountrySelector from "./CountrySelector";
import { formatCurrency } from "./lib/round.number";
import { PaymentMethodChoice } from "./PaymentMethodChoice";
import { useCheckoutText } from "./texts.context";

type ExpressAreaModule = {
  default: (
    props: React.ComponentProps<typeof import("./CartExpressArea").default>,
  ) => React.ReactNode;
};
let expressArea: Promise<ExpressAreaModule> | undefined;
/**
 * The express buttons' chunk, asked for once per page. A chunk that cannot
 * load leaves the express buttons out for the page; the cart and its "Next
 * step" button keep working.
 */
function loadExpressArea(): Promise<ExpressAreaModule> {
  expressArea ??= import("./CartExpressArea").catch(() => ({
    default: () => null,
  }));
  return expressArea;
}
const CartExpressArea = React.lazy(loadExpressArea);

/**
 * Everything under the lines: the total, the country, the express buttons, the
 * payment options and the "Next step" button with its errors. Nothing renders
 * while the cart has no total.
 *
 * The next wave splits this into `CartOptions` and `CartFooter`; that changes the
 * DOM order, so it is not part of the extraction.
 */
export function CartCheckout() {
  const {
    locale,
    status,
    lines,
    unavailable,
    total,
    totalComplete,
    wallets,
    showReviewPrices,
    currency,
    isSomeProductDeliverable,
    countries,
    country,
    isCountryMissing,
    setCountry,
    countrySelectorId,
    countryHintId,
    isApplePayAvailable,
    paymentChoice,
    selectMethod,
    paymentMethodsRef,
    checkout,
    isStartingCheckout,
    isCheckingOut,
    canCheckout,
    error: shownError,
  } = useCartController();

  const [isCountryOpen, setIsCountryOpen] = React.useState(false);

  // The express chunk loads while `/products` is asked, not after it: the
  // buttons mount once the server confirmed the cart (slice 5).
  const hasLines = lines.length > 0;
  React.useEffect(() => {
    if (hasLines) {
      void loadExpressArea();
    }
  }, [hasLines]);

  const summary = useCheckoutSlot("summary");
  const totalLabel = useCheckoutSlot("totalLabel");
  const totalValue = useCheckoutSlot("totalValue");
  const deliveryText = useCheckoutSlot("deliveryText");
  const summaryNote = useCheckoutSlot("summaryNote");
  const countryLabel = useCheckoutSlot("countryLabel");
  const checkoutButton = useCheckoutSlot("checkoutButton");
  const error = useCheckoutSlot("error");

  const totalText = useCheckoutText("total");
  const deliveryCopy = useCheckoutText("delivery");
  const chooseCountryText = useCheckoutText("chooseCountry");
  const nextStepText = useCheckoutText("nextStep");
  const countryRequiredText = useCheckoutText("countryRequired");
  const extrasCalculatedNextText = useCheckoutText("extrasCalculatedNext");
  const walletsUpdatingText = useCheckoutText("walletsUpdating");
  const reviewPricesText = useCheckoutText("reviewPrices");

  // A line still waiting for its price keeps the block (and a mounted wallet
  // sheet) on screen; only the amount waits. Catalog prices as in 1.29, so a
  // pay-what-you-want `amount: 0` keeps the button.
  const catalogSum = lines.reduce(
    (sum, item) =>
      item.details == null
        ? sum
        : sum + catalogUnitPrice(item.details) * item.line.quantity,
    0,
  );
  if (status !== "ready" || !(total > 0 || catalogSum > 0 || !totalComplete)) {
    return null;
  }

  return (
    <>
      <div
        data-bitsnap-checkout-slot="summary"
        className={cn("mx-3 flex flex-col", summary.className)}
        style={summary.style}
      >
        <div className={"flex flex-row justify-between text-lg"}>
          <p
            data-bitsnap-checkout-slot="totalLabel"
            className={cn("text-xl", totalLabel.className)}
            style={totalLabel.style}
          >
            {totalText}
          </p>
          <div className={"flex flex-col items-end"}>
            <p
              data-bitsnap-checkout-slot="totalValue"
              className={cn("font-medium", totalValue.className)}
              style={totalValue.style}
            >
              {totalComplete ? formatCurrency(total, currency, locale) : "…"}
            </p>
            {isSomeProductDeliverable && (
              <p
                data-bitsnap-checkout-slot="deliveryText"
                className={cn(
                  "opacity-70 text-right text-base",
                  deliveryText.className,
                )}
                style={deliveryText.style}
              >
                {deliveryCopy}
              </p>
            )}
          </div>
        </div>
        <p
          data-bitsnap-checkout-slot="summaryNote"
          className={cn("opacity-70 text-sm", summaryNote.className)}
          style={summaryNote.style}
        >
          {extrasCalculatedNextText}
        </p>
      </div>

      {countries && countries?.length > 1 && (
        <div>
          <h4
            data-bitsnap-checkout-slot="countryLabel"
            className={cn("ml-3 text-sm", countryLabel.className)}
            style={countryLabel.style}
          >
            {chooseCountryText}
          </h4>
          <CountrySelector
            id={countrySelectorId}
            open={isCountryOpen}
            onToggle={() => {
              setIsCountryOpen(!isCountryOpen);
            }}
            onChange={setCountry}
            selectedValue={country ?? ""}
            countries={countries}
          />
        </div>
      )}

      <div className={"mb-3 flex flex-col"}>
        {wallets.mounted && (
          // Inert while a line is unconfirmed or price-marked (D12, N1): no
          // click or key starts a wallet; an open wallet sheet is untouched.
          <div
            data-bitsnap-checkout-wallets=""
            aria-disabled={wallets.inert ? "true" : undefined}
            inert={wallets.inert}
            className={"flex flex-col"}
            style={
              wallets.inert ? { pointerEvents: "none", opacity: 0.5 } : undefined
            }
          >
            <React.Suspense fallback={null}>
              <CartExpressArea
                locale={locale}
                isApplePayAvailable={isApplePayAvailable}
                oneClick={wallets.oneClick}
                items={wallets.items}
              />
            </React.Suspense>
          </div>
        )}
        {wallets.mounted && wallets.inert && unavailable.length === 0 && (
          <p
            role="status"
            data-bitsnap-checkout-notice="wallets-updating"
            className={"text-sm text-center opacity-70"}
          >
            {walletsUpdatingText}
          </p>
        )}
        {paymentChoice != null && (
          <div ref={paymentMethodsRef} className="contents">
            <PaymentMethodChoice
              choice={paymentChoice.choice}
              selected={paymentChoice.selected}
              onChange={selectMethod}
              disabled={isStartingCheckout}
            />
          </div>
        )}
        {showReviewPrices && (
          <p
            role="status"
            data-bitsnap-checkout-notice="review-prices"
            className={"mx-2 text-sm text-center font-semibold"}
          >
            {reviewPricesText}
          </p>
        )}
        <button
          data-bitsnap-checkout-slot="checkoutButton"
          onClick={checkout}
          disabled={!canCheckout}
          aria-describedby={isCountryMissing ? countryHintId : undefined}
          className={cn(
            "px-3 py-2 my-2 mx-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition font-bold",
            checkoutButton.className,
          )}
          style={checkoutButton.style}
        >
          {isCheckingOut ? <Spinner /> : nextStepText}
        </button>
        {isCountryMissing && (
          <p id={countryHintId} className={"text-sm text-center opacity-70"}>
            {countryRequiredText}
          </p>
        )}
        {shownError.length > 0 && (
          <p
            role="alert"
            data-bitsnap-checkout-slot="error"
            className={cn("text-sm text-center", error.className)}
            style={error.style}
          >
            {shownError}
          </p>
        )}
      </div>
    </>
  );
}
