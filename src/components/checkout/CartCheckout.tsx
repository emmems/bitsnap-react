import React from "react";
import { useCheckoutSlot } from "./appearance.context";
import { useCartController } from "./cart-controller";
import { catalogUnitPrice } from "./cart-view";
import CountrySelector from "./CountrySelector";
import { cx } from "./lib/cx";
import { AlertIcon } from "./icons";
import { formatCurrency } from "./lib/round.number";
import { PaymentMethodChoice } from "./PaymentMethodChoice";
import { FooterSkeleton } from "./Skeleton";
import { useCheckoutText } from "./texts.context";

type ExpressAreaModule = {
  default: (
    props: React.ComponentProps<typeof import("./CartExpressArea").default>,
  ) => React.ReactNode;
};
/** The express chunk's import. An object so a test can make it fail. */
export const expressAreaChunk = {
  load: (): Promise<ExpressAreaModule> => import("./CartExpressArea"),
};
let expressArea: Promise<ExpressAreaModule> | undefined;
let expressAreaLazy: React.LazyExoticComponent<ExpressAreaModule["default"]> | undefined;
/**
 * The express buttons' chunk, asked for once per page. A chunk that cannot
 * load (a 404 after a host deploy, a dropped network) leaves the express
 * buttons out of this drawer and is forgotten, so the next open asks again;
 * the cart and its "Next step" button keep working.
 */
function loadExpressArea(): Promise<ExpressAreaModule> {
  expressArea ??= expressAreaChunk.load().catch((error: unknown) => {
    forgetExpressArea();
    console.warn("cannot load the express buttons", error);
    return { default: () => null };
  });
  return expressArea;
}
/** Drops the cached chunk and its lazy component (`React.lazy` keeps its result). */
export function forgetExpressArea() {
  expressArea = undefined;
  expressAreaLazy = undefined;
}
/** One lazy component per page, a new one after a failed load. */
function expressAreaComponent() {
  expressAreaLazy ??= React.lazy(loadExpressArea);
  return expressAreaLazy;
}

/**
 * Whether the options and the footer show: only for a ready cart with a total.
 * A line still waiting for its price keeps them (and a mounted wallet sheet)
 * on screen; only the amount waits. Catalog prices as in 1.29, so a
 * pay-what-you-want `amount: 0` keeps the button.
 */
function useCheckoutBlock() {
  const controller = useCartController();
  const { status, lines, total, totalComplete } = controller;
  const catalogSum = lines.reduce(
    (sum, item) =>
      item.details == null
        ? sum
        : sum + catalogUnitPrice(item.details) * item.line.quantity,
    0,
  );
  const shown =
    status === "ready" && (total > 0 || catalogSum > 0 || !totalComplete);
  return { controller, shown };
}

/**
 * The options under the lines, in the scroll region (D12, R11): the express
 * row, the "or" divider (only while an express button takes space), the
 * delivery country and the payment methods.
 */
export function CartOptions() {
  const {
    controller: {
      locale,
      lines,
      unavailable,
      wallets,
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
      isStartingCheckout,
    },
    shown,
  } = useCheckoutBlock();

  // Taken once per mount: the drawer mounts this at each open, so a failed
  // chunk is retried at the next open, not at every render.
  const [CartExpressArea] = React.useState(expressAreaComponent);

  // The express chunk loads while `/products` is asked, not after it: the
  // buttons mount once the server confirmed the cart (slice 5).
  const hasLines = lines.length > 0;
  React.useEffect(() => {
    if (hasLines) {
      void loadExpressArea();
    }
  }, [hasLines]);

  const options = useCheckoutSlot("options");
  const countryLabel = useCheckoutSlot("countryLabel");
  const chooseCountryText = useCheckoutText("chooseCountry");
  const walletsUpdatingText = useCheckoutText("walletsUpdating");
  const orText = useCheckoutText("orDivider");

  if (!shown) {
    return null;
  }
  const hasCountries = countries != null && countries.length > 1;
  const showWalletsNote = wallets.inert && unavailable.length === 0;

  return (
    <div
      data-bitsnap-checkout-slot="options"
      className={cx("bsc-options", options.className)}
      style={options.style}
    >
      {wallets.mounted && (
        // cart.css collapses this block when it shows nothing and shows the
        // "or" divider only under a real express button (`:has()`, N1, N2).
        <div className="bsc-express">
          {/* Inert while a line is unconfirmed or price-marked (D12, N1): no
              click or key starts a wallet; an open wallet sheet is untouched. */}
          <div
            data-bitsnap-checkout-wallets=""
            aria-disabled={wallets.inert ? "true" : undefined}
            inert={wallets.inert}
            className="bsc-wallets"
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
          {showWalletsNote && (
            <p
              role="status"
              data-bitsnap-checkout-notice="wallets-updating"
              className="bsc-wallets-note"
            >
              <span className="bsc-spinner" aria-hidden="true" />
              {walletsUpdatingText}
            </p>
          )}
          <p className="bsc-or" data-bitsnap-checkout-divider="">
            <span className="bsc-or-line" aria-hidden="true" />
            {orText}
            <span className="bsc-or-line" aria-hidden="true" />
          </p>
        </div>
      )}

      {hasCountries && (
        <div className="bsc-field">
          <label
            htmlFor={countrySelectorId}
            data-bitsnap-checkout-slot="countryLabel"
            className={cx("bsc-label", countryLabel.className)}
            style={countryLabel.style}
          >
            {chooseCountryText}
          </label>
          <CountrySelector
            id={countrySelectorId}
            onChange={setCountry}
            selectedValue={country ?? ""}
            countries={countries}
            describedBy={isCountryMissing ? countryHintId : undefined}
            locale={locale}
          />
        </div>
      )}

      {paymentChoice != null && (
        <div ref={paymentMethodsRef} className="bsc-contents">
          <PaymentMethodChoice
            choice={paymentChoice.choice}
            selected={paymentChoice.selected}
            onChange={selectMethod}
            disabled={isStartingCheckout}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The footer, the panel's last grid row and always visible (D7): the total
 * (small label, large amount, F-07), the note, the review notice, the plain
 * "Go to checkout" button (D10), "Continue shopping" in the dialog, and the
 * button's hint and error.
 */
export function CartFooter({
  onContinueShopping,
}: {
  /** Renders "Continue shopping" under the checkout button; it closes the cart (the dialog). */
  onContinueShopping?: () => void;
} = {}) {
  const {
    controller: {
      status,
      locale,
      total,
      totalComplete,
      showReviewPrices,
      currency,
      isCountryMissing,
      countryHintId,
      checkout,
      isCheckingOut,
      canCheckout,
      error: shownError,
    },
    shown,
  } = useCheckoutBlock();

  const footer = useCheckoutSlot("footer");
  const skeleton = useCheckoutSlot("skeleton");
  const summary = useCheckoutSlot("summary");
  const totalLabel = useCheckoutSlot("totalLabel");
  const totalValue = useCheckoutSlot("totalValue");
  const summaryNote = useCheckoutSlot("summaryNote");
  const checkoutButton = useCheckoutSlot("checkoutButton");
  const error = useCheckoutSlot("error");
  const continueButton = useCheckoutSlot("continueShopping");

  const totalText = useCheckoutText("total");
  const continueShoppingText = useCheckoutText("continueShopping");
  const nextStepText = useCheckoutText("nextStep");
  const countryRequiredText = useCheckoutText("countryRequired");
  const extrasCalculatedNextText = useCheckoutText("extrasCalculatedNext");
  const reviewPricesText = useCheckoutText("reviewPrices");

  if (status === "loading") {
    return <FooterSkeleton footer={footer} skeleton={skeleton} />;
  }
  if (!shown) {
    return null;
  }

  return (
    <div
      data-bitsnap-checkout-slot="footer"
      className={cx("bsc-footer", footer.className)}
      style={footer.style}
    >
      <div
        data-bitsnap-checkout-slot="summary"
        className={cx("bsc-summary", summary.className)}
        style={summary.style}
      >
        <p
          data-bitsnap-checkout-slot="totalLabel"
          className={cx("bsc-total-label", totalLabel.className)}
          style={totalLabel.style}
        >
          {totalText}
        </p>
        <p
          data-bitsnap-checkout-slot="totalValue"
          className={cx("bsc-total-value", totalValue.className)}
          style={totalValue.style}
        >
          {totalComplete ? formatCurrency(total, currency, locale) : "…"}
        </p>
        <p
          data-bitsnap-checkout-slot="summaryNote"
          className={cx("bsc-note", summaryNote.className)}
          style={summaryNote.style}
        >
          {extrasCalculatedNextText}
        </p>
      </div>
      {showReviewPrices && (
        <p
          role="status"
          data-bitsnap-checkout-notice="review-prices"
          className="bsc-notice"
        >
          <AlertIcon />
          <span>{reviewPricesText}</span>
        </p>
      )}
      <button
        type="button"
        data-bitsnap-checkout-slot="checkoutButton"
        onClick={checkout}
        disabled={!canCheckout}
        aria-busy={isCheckingOut ? "true" : undefined}
        aria-describedby={isCountryMissing ? countryHintId : undefined}
        className={cx("bsc-cta", checkoutButton.className)}
        style={checkoutButton.style}
      >
        {isCheckingOut && <span className="bsc-spinner" aria-hidden="true" />}
        <span className="bsc-cta-label">{nextStepText}</span>
      </button>
      {onContinueShopping != null && (
        <button
          type="button"
          data-bitsnap-checkout-slot="continueShopping"
          onClick={onContinueShopping}
          className={cx("bsc-continue", continueButton.className)}
          style={continueButton.style}
        >
          {continueShoppingText}
        </button>
      )}
      {isCountryMissing && (
        <p id={countryHintId} className="bsc-hint">
          {countryRequiredText}
        </p>
      )}
      {shownError.length > 0 && (
        <p
          role="alert"
          data-bitsnap-checkout-slot="error"
          className={cx("bsc-error-text", error.className)}
          style={error.style}
        >
          {shownError}
        </p>
      )}
    </div>
  );
}
