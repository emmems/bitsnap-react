import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { useInstrumentContext } from "@/src/analytics/instrument";
import { buyErrorText } from "./buy-error";
import {
  getCartLines,
  getProjectID,
  useCartProvider,
  type CartMethods,
} from "./CartProvider";
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

/**
 * The state and the logic of the cart, with no markup (PLAN.md D1).
 *
 * `CartControllerProvider` runs it once per cart and puts the result in a
 * context; the parts of the cart (`CartLines`, `CartCheckout`, ...) read it with
 * `useCartController()`. Presentation (slots, texts shown on screen, classes)
 * stays in the parts.
 */

export type CartLine = Extract<
  Awaited<ReturnType<CartMethods["getProducts"]>>,
  readonly unknown[]
>[number];

export type CartCountry = { name: string; code: string };

export type CartController = {
  locale: string;

  /** Where the lines are in their life; the parts pick their state from it. */
  status: "loading" | "error" | "empty" | "ready";
  isLoading: boolean;
  hasLoadFailed: boolean;
  /** `undefined` until the first load, and on a failed load. */
  products: CartLine[] | undefined;
  /** Sum of the lines in minor units, `0` when no line has details yet. */
  total: number;
  currency: string;
  isSomeProductDeliverable: boolean;
  /** Ids of the products `/buy` answered "not found" for. */
  missingItemIds: string[];
  /** Reloads the lines (today: refetch of the `/products` query). */
  retry(): void;
  /** Rejects when the cart could not be changed. `0` or less removes the line. */
  setQuantity(id: string, quantity?: number): Promise<void>;

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
  /** `isStartingCheckout`, or waiting for the payment options (the button shows a spinner). */
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
  children,
}: {
  locale?: string;
  children: React.ReactNode;
}) {
  const controller = useCartControllerState(locale);
  return (
    <CartControllerContext.Provider value={controller}>
      {children}
    </CartControllerContext.Provider>
  );
}

/**
 * The one place the lines come from. The next wave replaces the `/products`
 * query with the local snapshot and the revalidation (part 1's `useCartView`)
 * here; nothing else reads `provider.getProducts`.
 */
function useCartLines(locale: string) {
  const provider = useCartProvider();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["cart", locale],
    queryFn: provider.getProducts,
  });
  const products = isErr(data) ? undefined : data;
  const hasLoadFailed = !isLoading && (isError || isErr(data));
  const reload = React.useCallback(
    () => refetch().then(() => undefined),
    [refetch],
  );
  return { products, isLoading, hasLoadFailed, reload };
}

function useCartControllerState(localeProp?: string): CartController {
  const provider = useCartProvider();
  const instrument = useInstrumentContext();
  const locale = localeProp ?? getLocale();

  const unavailableProductsText = useCheckoutText("unavailableProducts");
  const resolveCheckoutText = useCheckoutTextResolver();
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
  const { products, isLoading, hasLoadFailed, reload } = useCartLines(locale);
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
      locale,
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
      await reload().catch(() => undefined);
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

  const isCheckingOut = isContinueToCheckoutLoading || isWaitingForChoice;
  const status: CartController["status"] = isLoading
    ? "loading"
    : hasLoadFailed
      ? "error"
      : products == null || products.length == 0
        ? "empty"
        : "ready";

  return {
    locale,
    status,
    isLoading,
    hasLoadFailed,
    products,
    total: sumOfProducts,
    currency,
    isSomeProductDeliverable,
    missingItemIds,
    retry: () => {
      reload().then().catch();
    },
    setQuantity: shouldUpdate,
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
    canCheckout: !(isLoading || isCheckingOut || selectedCountry == null),
    error: shownError,
    notice,
  };
}
