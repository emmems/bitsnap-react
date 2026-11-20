import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { useInstrumentContext } from "@/src/analytics/instrument";
import { buyErrorText } from "./buy-error";
import {
  getCartLines,
  getProjectID,
  readLocalCartLines,
  readLocalCartSignature,
  useCartProvider,
  type LocalCartLine,
} from "./CartProvider";
import { cartCountriesQuery, cartPaymentMethodsQuery } from "./cart-queries";
import {
  catalogUnitPrice,
  hasPayWhatYouWantLine,
  walletItems,
  walletsInert,
  type CartViewLine,
  type WalletItem,
} from "./cart-view";
import { sendAnalyticEvent } from "./frontent.analytics";
import { isErr } from "./lib/err";
import { getLocale } from "./locale";
import {
  effectivePaymentMethod,
  withoutCod,
  type PaymentMethod,
  type PaymentMethodChoice as Choice,
} from "./payment-method";
import { rememberPendingOrder } from "./pending-order";
import { useCheckoutStore } from "./state";
import { useCheckoutText, useCheckoutTextResolver } from "./texts.context";
import {
  useCartView,
  type CartViewState,
  type PriceCheck,
} from "./useCartView";

/**
 * The state and the logic of the cart, with no markup (PLAN.md D1).
 *
 * `CartControllerProvider` runs it once per cart and puts the result in a
 * context; the parts of the cart (`CartLines`, `CartCheckout`, ...) read it with
 * `useCartController()`. Presentation (slots, texts shown on screen, classes)
 * stays in the parts.
 *
 * The lines come from `useCartView()`: painted at once from the local snapshot,
 * revalidated in the background, and gated on the server's `priceVersion`
 * before `/buy` (part 1 §3.3-3.6, D2, D12, D18).
 */

export type CartCountry = { name: string; code: string };

export type CartController = {
  locale: string;

  /**
   * - `loading`: there are lines but nothing to show for any of them yet;
   * - `error`: that, and the server could not be asked;
   * - `empty`: no lines;
   * - `ready`: at least one line can be shown.
   */
  status: "loading" | "error" | "empty" | "ready";
  /** The lines in local order; a line without `details` waits for the server. */
  lines: CartViewLine[];
  /** Lines the server did not return: shown as unavailable, out of the total, block checkout (S15). */
  unavailable: CartViewState["unavailable"];
  /** Lines are shown from the device but the server could not be asked (inline row with retry). */
  refreshFailed: boolean;
  /** Sum of the lines in minor units. */
  total: number;
  /** False while some line has no known price (the total is not shown). */
  totalComplete: boolean;
  currency: string;
  isSomeProductDeliverable: boolean;
  /** Ids of the products `/buy` answered "not found" for. */
  missingItemIds: string[];
  /** Asks the server again. */
  retry(): void;
  /** Rejects when the cart could not be changed. `0` or less removes the line. */
  setQuantity(id: string, quantity?: number): Promise<void>;
  /** The unit price a line showed before its price changed while the drawer was open. */
  priceWas(lineId: string): number | undefined;
  /** The line shows an older snapshot price while the server is asked. */
  isRefreshing(productID: string): boolean;
  /** Some price changed: the buyer checks the total and clicks again. */
  showReviewPrices: boolean;

  /** Express buttons (D12, N1, N2). */
  wallets: {
    /** Mounted once the server confirmed the cart; kept until it is empty or the drawer closes. */
    mounted: boolean;
    /** No click or key starts a wallet while a line is unconfirmed or price-marked. */
    inert: boolean;
    /** Apple Pay and Google Pay are hidden while a line is pay-what-you-want. */
    oneClick: boolean;
    /** Always the whole local cart. */
    items: WalletItem[];
  };

  countries: CartCountry[] | undefined;
  /** The country the cart is for, `undefined` until the stored one is read or when there is none. */
  country: string | undefined;
  /** The hint waits for the answer: the country is read asynchronously. */
  isCountryMissing: boolean;
  setCountry(code: string): void;
  countrySelectorId: string;
  countryHintId: string;

  isApplePayAvailable: boolean | undefined;

  /**
   * What the seller offers for this cart and the method shown as selected (the
   * buyer's pick, or the first offered); `null` when there is nothing to choose.
   */
  paymentChoice: { choice: Choice; selected: PaymentMethod } | null;
  selectMethod(method: PaymentMethod): void;
  /** Wraps the options, so that focus can move to the selected one. */
  paymentMethodsRef: React.RefObject<HTMLDivElement | null>;

  checkout(): Promise<void>;
  /** The order is being created (the payment options are locked meanwhile). */
  isStartingCheckout: boolean;
  /** `isStartingCheckout`, or waiting for prices or the payment options (the button shows a spinner). */
  isCheckingOut: boolean;
  canCheckout: boolean;

  /** The error of the last action, else the notice raised outside of the drawer; `""` for none. */
  error: string;
  /** Raised outside of the drawer (for example a failed redirect of `window.cart.buyProduct`). */
  notice: string | undefined;
};

const CartControllerContext = React.createContext<CartController | null>(null);

export function useCartController(): CartController {
  const controller = React.useContext(CartControllerContext);
  if (controller == null) {
    throw new Error("useCartController must be used inside CartControllerProvider");
  }
  return controller;
}

export function CartControllerProvider({
  locale,
  open,
  children,
}: {
  locale?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  const controller = useCartControllerState(locale, open);
  return (
    <CartControllerContext.Provider value={controller}>
      {children}
    </CartControllerContext.Provider>
  );
}

/** How long the `/payment-methods` key lags behind quick quantity changes (P12). */
const PAYMENT_METHODS_DEBOUNCE_MS = 300;
/** `cart_opened` waits this long for the server before it reports what it has. */
const CART_OPENED_FALLBACK_MS = 2000;

/** What `/buy` prices per line: id, quantity, amount, stored version (N5). */
const contentOf = (lines: LocalCartLine[]) =>
  JSON.stringify(lines.map((l) => [l.id, l.quantity, l.amount, l.priceVersion]));
const amountsOf = (lines: LocalCartLine[]) =>
  JSON.stringify(lines.map((l) => [l.id, l.amount]));

/**
 * `value`, following it with a delay. The first defined value is not delayed;
 * `flush()` catches up at once.
 */
function useDebounced(value: string | undefined, ms: number) {
  const [debounced, setDebounced] = React.useState(value);
  const latest = React.useRef(value);
  latest.current = value;
  React.useEffect(() => {
    if (value === debounced) {
      return;
    }
    if (value === undefined || debounced === undefined) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(latest.current), ms);
    return () => clearTimeout(timer);
  }, [value]);
  const flush = React.useCallback(() => setDebounced(latest.current), []);
  return [debounced, flush] as const;
}

function useCartControllerState(
  localeProp?: string,
  open?: boolean,
): CartController {
  const provider = useCartProvider();
  const instrument = useInstrumentContext();
  const locale = localeProp ?? getLocale();
  const cart = useCartView(locale, open);
  const { view } = cart;

  const unavailableProductsText = useCheckoutText("unavailableProducts");
  const updateFailedText = useCheckoutText("updateFailed");
  const resolveCheckoutText = useCheckoutTextResolver();
  const countrySelectorId = React.useId();
  const countryHintId = React.useId();

  const { mutateAsync: setCountryAsync } = useMutation({
    mutationFn: provider.setCountry,
  });
  const { mutateAsync: clearCart } = useMutation({
    mutationFn: provider.clearCart,
  });

  const [errMsg, setErrMsg] = React.useState("");
  // Raised outside of the drawer (for example a failed redirect of `window.cart.buyProduct`).
  const notice = useCheckoutStore((state) => state.notice);
  React.useEffect(
    () => () => useCheckoutStore.getState().setNotice(undefined),
    [],
  );
  const { unavailable } = cart;
  const shownError =
    errMsg || notice || (unavailable.length > 0 ? unavailableProductsText : "");
  const [missingItemIds, setMissingItemIds] = React.useState<string[]>([]);
  const [showReviewPrices, setShowReviewPrices] = React.useState(false);
  const [gateFailed, setGateFailed] = React.useState(false);
  const [isCheckingPrices, setIsCheckingPrices] = React.useState(false);

  const {
    mutateAsync: continueToCheckoutAsync,
    isPending: isContinueToCheckoutLoading,
  } = useMutation({
    mutationFn: provider.redirectToNextStep,
    // Offline fails like any network error: a paused mutation would resume
    // later, maybe after the drawer closed (S12).
    networkMode: "always",
  });

  const { data: availableCountries } = useQuery(
    cartCountriesQuery(provider.getAvailableCountries),
  );
  const { data: isApplePayAvailable } = useQuery({
    queryKey: ["cart-one-click-payment"],
    queryFn: provider.checkIfApplePayIsAvailable,
  });
  const { data: countryData, refetch: refetchCountry } = useQuery({
    queryKey: ["cart-country"],
    queryFn: provider.getCountry,
  });

  const selectedCountry =
    countryData != null && !isErr(countryData) && countryData != ""
      ? countryData
      : undefined;

  // Whether the shop lets the buyer pay by hand (transfer / BLIK to a phone)
  // or on delivery for this cart. Asked once per cart content and country
  // (cash on delivery is for Poland only); any failure means "no choice".
  // Without a country "Next step" is disabled, so there is nothing to ask yet.
  // Until a new country or cart is answered, the last choice stays on screen
  // without cash on delivery, which the new answer may not offer. The key
  // follows the local lines (the request body is built from them), debounced
  // so quick quantity changes send one request (P12).
  const queryClient = useQueryClient();
  const [cartSignature, flushCartSignature] = useDebounced(
    cart.localSignature.length === 0 || selectedCountry == null
      ? undefined
      : cart.localSignature,
    PAYMENT_METHODS_DEBOUNCE_MS,
  );
  const paymentMethodsQuery = (signature: string | undefined) =>
    cartPaymentMethodsQuery(
      getProjectID(),
      locale,
      selectedCountry,
      signature,
      provider.getPaymentMethodChoice,
    );
  const {
    data: paymentMethodChoiceData,
    isPlaceholderData: isPaymentMethodChoicePlaceholder,
  } = useQuery({
    ...paymentMethodsQuery(cartSignature),
    enabled: cartSignature != null,
    placeholderData: (previous: Choice | null | undefined) =>
      previous === undefined ? undefined : withoutCod(previous),
  });
  const paymentMethodChoice =
    cartSignature != null ? (paymentMethodChoiceData ?? null) : null;
  const [selectedPaymentMethod, setSelectedPaymentMethod] = React.useState<
    PaymentMethod | undefined
  >(undefined);
  const [isWaitingForChoice, setIsWaitingForChoice] = React.useState(false);
  const paymentMethodsRef = React.useRef<HTMLDivElement>(null);

  const countries = isErr(availableCountries) ? [] : availableCountries;

  const lines = view.lines;
  const itemCount = lines.reduce((sum, item) => sum + item.line.quantity, 0);

  // The hint waits for the answer: the country is read asynchronously.
  const isCountryMissing = countryData !== undefined && selectedCountry == null;

  // A stored country the shop does not ship to (or none at all) would leave the checkout button disabled.
  const autoSelectedCountry = React.useRef(false);
  React.useEffect(() => {
    if (
      autoSelectedCountry.current ||
      countries == null ||
      countries.length === 0 ||
      countryData == null ||
      (selectedCountry != null &&
        countries.some((el) => el.code === selectedCountry))
    ) {
      return;
    }
    autoSelectedCountry.current = true;
    setCountryAsync(countries[0].code)
      .then(() => refetchCountry())
      .catch(() => {});
  }, [countries, countryData, selectedCountry]);

  // One `cart_opened` per opening of the drawer: when the server confirmed the
  // cart, or after 2 s with what is known then (offline).
  const opened = React.useRef(false);
  const latestView = React.useRef(view);
  latestView.current = view;
  const reportOpened = React.useCallback(() => {
    if (opened.current) {
      return;
    }
    opened.current = true;
    const current = latestView.current;
    instrument.track("cart_opened", {
      item_count: current.lines.reduce((sum, item) => sum + item.line.quantity, 0),
      value_minor: current.sum,
      currency: current.currency,
    });
  }, [instrument]);
  React.useEffect(() => {
    if (view.status === "fresh" || view.status === "empty") {
      reportOpened();
    }
  }, [view.status, reportOpened]);
  React.useEffect(() => {
    const timer = setTimeout(reportOpened, CART_OPENED_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [reportOpened]);

  /** `add_to_cart` / `remove_from_cart` for a quantity change in the drawer. */
  function trackQuantityChange(
    item: CartViewLine,
    previousQuantity: number,
    newQuantity: number,
  ) {
    const details = item.details;
    const delta = newQuantity - previousQuantity;
    if (details == null || delta === 0) {
      return;
    }
    const price = item.unitPrice ?? catalogUnitPrice(details);
    const productID =
      cart.catalogProductID(item.line.productID) ?? item.line.productID;
    instrument.track(
      delta > 0 ? "add_to_cart" : "remove_from_cart",
      {
        qty: Math.abs(delta),
        value_minor: Math.round(price * Math.abs(delta)),
        currency: details.currency,
      },
      {
        product_id: productID,
        variant_id: productID !== item.line.productID ? item.line.productID : null,
      },
    );
  }

  const startedCheckout = React.useRef(false);

  /**
   * A local, synchronous write (D2): the line, the total and the count follow
   * in the same render, nothing is refetched. Rejects (and shows
   * `updateFailed`) when the storage refused the write; the stored cart, and
   * so the view, stays as it was.
   */
  async function shouldUpdate(id: string, newQuantity?: number) {
    if (newQuantity == null) {
      return;
    }
    const item = lines.find((entry) => entry.line.id === id);
    const previousQuantity =
      readLocalCartLines().find((line) => line.id === id)?.quantity ??
      item?.line.quantity ??
      0;
    try {
      const result =
        newQuantity <= 0
          ? await provider.removeProductFromCart({ id })
          : await provider.updateQuantity({ id, quantity: newQuantity });
      if (isErr(result)) {
        throw new Error(`cannot change the cart: ${result.error}`);
      }
    } catch (e) {
      setErrMsg(updateFailedText);
      throw e;
    }
    setErrMsg((message) => (message === updateFailedText ? "" : message));
    if (item != null) {
      trackQuantityChange(item, previousQuantity, Math.max(0, newQuantity));
    }
  }

  async function continueToCheckout() {
    try {
      setErrMsg("");
      setMissingItemIds([]);
      setGateFailed(false);
      useCheckoutStore.getState().setNotice(undefined);

      // The buyer must have seen every price they pay (D18): "Next step" never
      // sends `/buy` on snapshot data or on a price shown too briefly. `/buy`
      // is built from storage, so a change from another tab while the payment
      // options load runs the gate again, and a second one stops (N5). A
      // changed `amount` stops at once: it was not on screen when approved.
      const opening = cart.opening();
      let paymentMethod: PaymentMethod | undefined;
      let shownAmounts: Record<string, number> = {};
      let content = "";
      for (let attempt = 0; ; attempt++) {
        setIsCheckingPrices(true);
        let gate: PriceCheck;
        try {
          gate = await cart.checkPrices();
        } finally {
          setIsCheckingPrices(false);
        }
        if (gate.result === "cancelled") {
          return;
        }
        if (gate.result === "failed") {
          setGateFailed(true);
          return;
        }
        if (gate.result === "marked") {
          setShowReviewPrices(true);
          return;
        }
        if (gate.result !== "pass") {
          return;
        }
        shownAmounts = gate.shownAmounts;
        setShowReviewPrices(false);
        // What the gate approved, not a later read: a write in between must not
        // become the accepted content (S12).
        const gated = gate.lines;

        // A click before the choice arrived waits for it (at most the request
        // timeout); a choice the buyer has not seen yet is shown, not used. The
        // last choice shown in the meantime is used if the new one still offers
        // the selected method. A key that still lags behind a quantity change
        // is caught up first (N7).
        const signature = readLocalCartSignature();
        const localSignature =
          signature.length === 0 || selectedCountry == null ? undefined : signature;
        let choice = paymentMethodChoice;
        paymentMethod =
          choice != null
            ? effectivePaymentMethod(choice, selectedPaymentMethod)
            : undefined;
        if (
          localSignature != null &&
          (paymentMethodChoiceData === undefined ||
            isPaymentMethodChoicePlaceholder ||
            cartSignature !== localSignature)
        ) {
          flushCartSignature();
          setIsWaitingForChoice(true);
          try {
            choice = await queryClient
              .fetchQuery(paymentMethodsQuery(localSignature))
              .catch(() => null);
          } finally {
            setIsWaitingForChoice(false);
          }
          if (choice == null) {
            paymentMethod = undefined;
          } else if (paymentMethod == null || !choice.methods.includes(paymentMethod)) {
            // Let the buyer see the options first; focus moves to the selected one.
            window.setTimeout(() => {
              paymentMethodsRef.current
                ?.querySelector<HTMLInputElement>("input:checked")
                ?.focus();
            }, 0);
            return;
          }
        }
        const current = readLocalCartLines();
        content = contentOf(current);
        if (content === contentOf(gated)) {
          break;
        }
        if (attempt > 0 || amountsOf(current) !== amountsOf(gated)) {
          setShowReviewPrices(true);
          return;
        }
      }

      if (lines.length > 0) {
        if (!startedCheckout.current) {
          startedCheckout.current = true;
          instrument.track("checkout_started", {
            item_count: itemCount,
            checkout_type: "cart",
            value_minor: view.sum,
            currency: view.currency,
          });
        }
        try {
          sendAnalyticEvent({
            event: "initiateCheckout",
            items: lines.map((item) => ({
              id: item.line.productID,
              name: item.details?.name ?? "",
              price: item.unitPrice ?? 0,
              quantity: item.line.quantity,
              currency: item.details?.currency ?? "PLN",
            })),
          });
        } catch (e) {}
      }

      // Closed since the click (S3).
      if (opening == null || cart.opening() !== opening) {
        return;
      }
      // What this order is made of; only these lines go once it is paid.
      const cartLinesBeforeBuy = getCartLines();
      const response = await continueToCheckoutAsync({
        ...(paymentMethod != null ? { paymentMethod } : {}),
        shownAmounts,
        // Checked again right before the request (S12).
        accept: (stored) =>
          cart.opening() === opening && contentOf(stored) === content,
      });

      if (isErr(response)) {
        if (response.error == "cart-changed") {
          setShowReviewPrices(cart.opening() === opening);
          return;
        }
        // The seller may have changed the payment methods in the meantime.
        void queryClient.invalidateQueries({ queryKey: ["cart-payment-methods"] });
        if (response.error == "price-changed") {
          // The server won the race: ask again past the HTTP cache, mark what
          // changed and let the next click go through the gate (D18, N3).
          setShowReviewPrices(true);
          if ((await cart.recheckPrices()) === "failed") {
            setGateFailed(true);
          }
        } else if (response.error == "item-ids-not-found") {
          setErrMsg(unavailableProductsText);
          if ("data" in response && Array.isArray(response.data)) {
            setMissingItemIds(response.data as string[]);
          }
        } else if (
          paymentMethod === "cod" &&
          response.error == "gateway-not-configured"
        ) {
          // The shop turned cash on delivery off, or this cart does not qualify.
          setErrMsg(resolveCheckoutText("paymentMethodCodUnavailable"));
        } else {
          setErrMsg(buyErrorText(response, resolveCheckoutText));
        }
        return;
      }

      // The cart stays until the order is paid (or placed, for cash on
      // delivery); without an order to ask about it is cleared now.
      if (
        !rememberPendingOrder(response, {
          cartProjectId: getProjectID(),
          lines: cartLinesBeforeBuy,
        })
      ) {
        await clearCart();
      }
      window.location.href = response.url;
    } catch (e: unknown) {
      console.warn("checkout failed", e);
      setErrMsg(resolveCheckoutText("checkoutFailed"));
    }
  }

  // Express buttons mount the first time the server confirmed the cart and
  // stay mounted (an open wallet sheet is never unmounted) until it is empty.
  const walletsMounted = React.useRef(false);
  if (lines.length === 0) {
    walletsMounted.current = false;
  } else if (view.status === "fresh") {
    walletsMounted.current = true;
  }

  const hasDetails = lines.some((item) => item.details != null);
  const status: CartController["status"] =
    lines.length + unavailable.length === 0
      ? "empty"
      : !hasDetails && unavailable.length === 0
        ? view.failed
          ? "error"
          : "loading"
        : "ready";

  const isCheckingOut =
    isContinueToCheckoutLoading || isWaitingForChoice || isCheckingPrices;

  return {
    locale,
    status,
    lines,
    unavailable,
    refreshFailed:
      status === "ready" && (view.status === "unavailable-refresh" || gateFailed),
    total: view.sum,
    totalComplete: view.sumComplete,
    currency: view.currency,
    isSomeProductDeliverable: view.isSomeProductDeliverable,
    missingItemIds,
    retry: () => {
      setGateFailed(false);
      cart.retry();
    },
    setQuantity: shouldUpdate,
    priceWas: cart.priceWas,
    isRefreshing: cart.isRefreshing,
    showReviewPrices: showReviewPrices && lines.length > 0,
    wallets: {
      mounted: walletsMounted.current,
      inert: walletsInert(view) || unavailable.length > 0,
      oneClick: !hasPayWhatYouWantLine(view),
      items: walletItems(view),
    },
    countries,
    country: selectedCountry,
    isCountryMissing,
    setCountry: (code) => {
      setCountryAsync(code).then(() => {
        refetchCountry().then().catch();
      });
    },
    countrySelectorId,
    countryHintId,
    isApplePayAvailable,
    paymentChoice:
      paymentMethodChoice != null
        ? {
            choice: paymentMethodChoice,
            selected: effectivePaymentMethod(
              paymentMethodChoice,
              selectedPaymentMethod,
            ),
          }
        : null,
    selectMethod: setSelectedPaymentMethod,
    paymentMethodsRef,
    checkout: continueToCheckout,
    isStartingCheckout: isContinueToCheckoutLoading,
    isCheckingOut,
    canCheckout: !(
      status !== "ready" ||
      isCheckingOut ||
      selectedCountry == null ||
      unavailable.length > 0
    ),
    error: shownError,
    notice,
  };
}
