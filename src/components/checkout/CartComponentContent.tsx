import { useAutoAnimate } from "@formkit/auto-animate/react";
import React from "react";
import { useInstrumentContext } from "@/src/analytics/instrument";
import { getCartLines, getProjectID, useCartProvider } from "./CartProvider";
import CountrySelector from "./CountrySelector";
import { isErr } from "./lib/err";
import { formatCurrency } from "./lib/round.number";
import LoadingIndicator from "./LoadingIndicator";
import SingleProduct from "./SingleProduct";
import { Skeleton } from "./Skeleton";
import { ApplePayButton, GooglePayButton } from "..";
import { Spinner } from "@/src/ui/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/src/lib/utils";
import { sendAnalyticEvent } from "./frontent.analytics";
import { getLocale } from "./locale";
import { buyErrorText } from "./buy-error";
import { useCheckoutText, useCheckoutTextResolver } from "./texts.context";
import { useCheckoutSlot } from "./appearance.context";
import { rememberPendingOrder } from "./pending-order";
import { useCheckoutStore } from "./state";
import { PaymentMethodChoice } from "./PaymentMethodChoice";
import {
  effectivePaymentMethod,
  withoutCod,
  type PaymentMethod,
  type PaymentMethodChoice as Choice,
} from "./payment-method";

const CartComponentContent = ({
  className,
  locale,
}: {
  className: string;
  locale?: string;
}) => {
  const provider = useCartProvider();
  const instrument = useInstrumentContext();
  const currentLocale = locale ?? getLocale();

  const productList = useCheckoutSlot("productList");
  const summary = useCheckoutSlot("summary");
  const totalLabel = useCheckoutSlot("totalLabel");
  const totalValue = useCheckoutSlot("totalValue");
  const deliveryText = useCheckoutSlot("deliveryText");
  const summaryNote = useCheckoutSlot("summaryNote");
  const countryLabel = useCheckoutSlot("countryLabel");
  const paymentButtons = useCheckoutSlot("paymentButtons");
  const checkoutButton = useCheckoutSlot("checkoutButton");
  const emptyState = useCheckoutSlot("emptyState");
  const error = useCheckoutSlot("error");
  const skeleton = useCheckoutSlot("skeleton");

  const unavailableProductsText = useCheckoutText("unavailableProducts");
  const resolveCheckoutText = useCheckoutTextResolver();
  const emptyCartText = useCheckoutText("emptyCart");
  const totalText = useCheckoutText("total");
  const deliveryCopy = useCheckoutText("delivery");
  const chooseCountryText = useCheckoutText("chooseCountry");
  const nextStepText = useCheckoutText("nextStep");
  const loadFailedText = useCheckoutText("loadFailed");
  const retryText = useCheckoutText("retry");
  const countryRequiredText = useCheckoutText("countryRequired");
  const extrasCalculatedNextText = useCheckoutText("extrasCalculatedNext");
  const countrySelectorId = React.useId();
  const countryHintId = React.useId();

  const { mutateAsync: removeProduct } = useMutation({
    mutationFn: provider.removeProductFromCart,
  });
  const { mutateAsync: updateQuantity } = useMutation({
    mutationFn: provider.updateQuantity,
  });
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
  const shownError = errMsg.length > 0 ? errMsg : (notice ?? "");
  const [missingItemIds, setMissingItemIds] = React.useState<string[]>([]);

  const [isCountryOpen, setIsCountryOpen] = React.useState(false);

  const {
    mutateAsync: continueToCheckoutAsync,
    isPending: isContinueToCheckoutLoading,
  } = useMutation({
    mutationFn: provider.redirectToNextStep,
  });

  const { data: availableCountries } = useQuery({
    queryKey: ["cart-available-countries"],
    queryFn: provider.getAvailableCountries,
  });
  const { data: isApplePayAvailable } = useQuery({
    queryKey: ["cart-one-click-payment"],
    queryFn: provider.checkIfApplePayIsAvailable,
  });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["cart", currentLocale],
    queryFn: provider.getProducts,
  });
  const { data: countryData, refetch: refetchCountry } = useQuery({
    queryKey: ["cart-country"],
    queryFn: provider.getCountry,
  });

  const [productsParent] = useAutoAnimate(/* optional config */);

  const products = isErr(data) ? undefined : data;

  const selectedCountry =
    countryData != null && !isErr(countryData) && countryData != ""
      ? countryData
      : undefined;

  // Whether the shop lets the buyer pay by hand (transfer / BLIK to a phone)
  // or on delivery for this cart. Asked once per cart content and country
  // (cash on delivery is for Poland only); any failure means "no choice".
  // Without a country "Next step" is disabled, so there is nothing to ask yet.
  // Until a new country or cart is answered, the last choice stays on screen
  // without cash on delivery, which the new answer may not offer.
  const queryClient = useQueryClient();
  const cartSignature =
    products == null || products.length === 0 || selectedCountry == null
      ? undefined
      : products
          .map((el) => `${el.productID}:${el.quantity}`)
          .sort()
          .join(",");
  const paymentMethodsQuery = {
    queryKey: [
      "cart-payment-methods",
      getProjectID(),
      currentLocale,
      selectedCountry,
      cartSignature,
    ],
    queryFn: async (): Promise<Choice | null> =>
      provider.getPaymentMethodChoice().catch(() => null),
    staleTime: 60_000,
    retry: false,
  } as const;
  const {
    data: paymentMethodChoiceData,
    isPlaceholderData: isPaymentMethodChoicePlaceholder,
  } = useQuery({
    ...paymentMethodsQuery,
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
  const hasLoadFailed = !isLoading && (isError || isErr(data));

  const countries = isErr(availableCountries) ? [] : availableCountries;

  const sumOfProducts =
    products?.reduce((prev, curr) => {
      if (curr.details == null) {
        return prev;
      }
      return prev + (curr.details.pricing?.effectivePrice ?? curr.details.price) * curr.quantity;
    }, 0) ?? 0;
  const currency = products?.[0]?.details?.currency ?? "PLN";

  const isSomeProductDeliverable =
    products?.some((product) => product.details?.isDeliverable === true) ??
    false;

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

  // One `cart_opened` per opening of the drawer, once the cart is loaded.
  const opened = React.useRef(false);
  React.useEffect(() => {
    if (opened.current || isLoading) {
      return;
    }
    opened.current = true;
    instrument.track("cart_opened", {
      item_count: products?.reduce((sum, el) => sum + el.quantity, 0) ?? 0,
      value_minor: sumOfProducts,
      currency,
    });
  }, [isLoading, instrument, products, sumOfProducts, currency]);

  const reportedQuantity = React.useRef(new Map<string, number>());
  React.useEffect(() => {
    reportedQuantity.current.clear();
  }, [products]);

  /** `add_to_cart` / `remove_from_cart` for a quantity change in the drawer. */
  function trackQuantityChange(id: string, newQuantity: number) {
    const line = products?.find((el) => el.id === id);
    if (line?.details == null) {
      return;
    }
    // Quick clicks arrive before the cart is reloaded: count from the last reported quantity.
    const delta = newQuantity - (reportedQuantity.current.get(id) ?? line.quantity);
    reportedQuantity.current.set(id, newQuantity);
    if (delta === 0) {
      return;
    }
    const price = line.details.pricing?.effectivePrice ?? line.details.price;
    const productID = line.catalogProductID ?? line.productID;
    instrument.track(
      delta > 0 ? "add_to_cart" : "remove_from_cart",
      {
        qty: Math.abs(delta),
        value_minor: Math.round(price * Math.abs(delta)),
        currency: line.details.currency,
      },
      {
        product_id: productID,
        variant_id: productID !== line.productID ? line.productID : null,
      },
    );
  }

  const startedCheckout = React.useRef(false);

  /** Rejects when the cart could not be changed; the cart is reloaded either way. */
  async function shouldUpdate(id: string, newQuantity?: number) {
    if (newQuantity == null) {
      return;
    }
    trackQuantityChange(id, Math.max(0, newQuantity));
    try {
      const result =
        newQuantity <= 0
          ? await removeProduct({ id: id })
          : await updateQuantity({ id: id, quantity: newQuantity });
      if (isErr(result)) {
        throw new Error(`cannot change the cart: ${result.error}`);
      }
    } finally {
      await refetch().catch(() => undefined);
    }
  }

  async function continueToCheckout() {
    try {
      setErrMsg("");
      setMissingItemIds([]);
      useCheckoutStore.getState().setNotice(undefined);

      // A click before the choice arrived waits for it (at most the request
      // timeout); a choice the buyer has not seen yet is shown, not used. The
      // last choice shown in the meantime is used if the new one still offers
      // the selected method.
      let choice = paymentMethodChoice;
      let paymentMethod =
        choice != null
          ? effectivePaymentMethod(choice, selectedPaymentMethod)
          : undefined;
      if (
        cartSignature != null &&
        (paymentMethodChoiceData === undefined || isPaymentMethodChoicePlaceholder)
      ) {
        setIsWaitingForChoice(true);
        try {
          choice = await queryClient
            .fetchQuery(paymentMethodsQuery)
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

      if (products != null) {
        if (!startedCheckout.current && products.length > 0) {
          startedCheckout.current = true;
          instrument.track("checkout_started", {
            item_count: products.reduce((sum, el) => sum + el.quantity, 0),
            checkout_type: "cart",
            value_minor: sumOfProducts,
            currency,
          });
        }
        try {
          sendAnalyticEvent({
            event: "initiateCheckout",
            items: products?.map((el) => ({
              id: el.productID,
              name: el.details?.name ?? "",
              price: el.details?.price ?? 0,
              quantity: el.quantity,
              currency: el.details?.currency ?? "PLN",
            })),
          });
        } catch (e) {}
      }

      // What this order is made of; only these lines go once it is paid.
      const cartLinesBeforeBuy = getCartLines();
      const response = await continueToCheckoutAsync(
        paymentMethod != null ? { paymentMethod } : undefined,
      );

      if (isErr(response)) {
        // The seller may have changed the payment methods in the meantime.
        void queryClient.invalidateQueries({ queryKey: ["cart-payment-methods"] });
        if (response.error == "item-ids-not-found") {
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

  return (
    <div className={`${className} flex flex-col`} ref={productsParent}>
      {isLoading && (
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

      {hasLoadFailed && (
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
            onClick={() => {
              refetch().then().catch();
            }}
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

      {!isLoading && !hasLoadFailed && (products == null || products.length == 0) && (
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
        {products != null && products.length > 0 && (
          <ul className={"mt-5"}>
            {products.map((product) => (
              <React.Fragment key={product.id}>
                {product.details != null && (
                  <li className={"mb-3"}>
                    <SingleProduct
                      isNotAvailable={missingItemIds.includes(
                        product.productID,
                      )}
                      quantity={product.quantity}
                      details={product.details}
                      url={product.url}
                      shouldUpdate={(newQuantity) =>
                        shouldUpdate(product.id, newQuantity)
                      }
                    />
                    <hr className="h-1" />
                  </li>
                )}
              </React.Fragment>
            ))}
          </ul>
        )}
      </div>

      <div className="grow"></div>

      {sumOfProducts > 0 && currency != null && (
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
                  {formatCurrency(sumOfProducts, currency)}
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
                onChange={(newValue) => {
                  setCountryAsync(newValue).then(() => {
                    refetchCountry().then().catch();
                  });
                }}
                selectedValue={selectedCountry ?? ""}
                countries={countries}
              />
            </div>
          )}

          <div className={"mb-3 flex flex-col"}>
            {isApplePayAvailable && products != null && products.length > 0 && (
              <div
                data-bitsnap-checkout-slot="paymentButtons"
                className={cn("w-full px-2", paymentButtons.className)}
                style={paymentButtons.style}
              >
                <ApplePayButton
                  colorType="white"
                  style={{ width: "100%" }}
                  items={products?.map((el) => ({
                    name: el.details?.name ?? "",
                    id: el.productID,
                    price: el.details?.pricing?.effectivePrice ?? el.details?.price ?? 0,
                    currency: el.details?.currency,
                    quantity: el.quantity,
                    isDeliverable: el.details?.isDeliverable ?? false,
                    metadata: el.metadata,
                  }))}
                />
              </div>
            )}
            {products != null && products.length > 0 && (
              <div
                data-bitsnap-checkout-slot="paymentButtons"
                className={cn("w-full px-2", paymentButtons.className)}
                style={paymentButtons.style}
              >
                <GooglePayButton
                  buttonSizeMode="fill"
                  buttonColor="white"
                  style={{ width: "100%" }}
                  items={products?.map((el) => ({
                    name: el.details?.name ?? "",
                    id: el.productID,
                    price: el.details?.pricing?.effectivePrice ?? el.details?.price ?? 0,
                    quantity: el.quantity,
                    isDeliverable: el.details?.isDeliverable ?? false,
                    metadata: el.metadata,
                  }))}
                />
              </div>
            )}
            {paymentMethodChoice != null && (
              <div ref={paymentMethodsRef} className="contents">
                <PaymentMethodChoice
                  choice={paymentMethodChoice}
                  selected={effectivePaymentMethod(
                    paymentMethodChoice,
                    selectedPaymentMethod,
                  )}
                  onChange={setSelectedPaymentMethod}
                  disabled={isContinueToCheckoutLoading}
                />
              </div>
            )}
            <button
              data-bitsnap-checkout-slot="checkoutButton"
              onClick={continueToCheckout}
              disabled={
                isLoading ||
                isContinueToCheckoutLoading ||
                isWaitingForChoice ||
                selectedCountry == null
              }
              aria-describedby={isCountryMissing ? countryHintId : undefined}
              className={cn(
                "px-3 py-2 my-2 mx-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition font-bold",
                checkoutButton.className,
              )}
              style={checkoutButton.style}
            >
              {isContinueToCheckoutLoading || isWaitingForChoice ? (
                <Spinner />
              ) : (
                nextStepText
              )}
            </button>
            {isCountryMissing && (
              <p
                id={countryHintId}
                className={"text-sm text-center opacity-70"}
              >
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
      )}
    </div>
  );
};

export default CartComponentContent;
