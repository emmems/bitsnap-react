import { useAutoAnimate } from "@formkit/auto-animate/react";
import React from "react";
import { useCartProvider } from "./CartProvider";
import CountrySelector from "./CountrySelector";
import { isErr } from "./lib/err";
import { formatCurrency } from "./lib/round.number";
import LoadingIndicator from "./LoadingIndicator";
import SingleProduct from "./SingleProduct";
import { Skeleton } from "./Skeleton";
import { ApplePayButton, GooglePayButton } from "..";
import { Spinner } from "@/src/ui/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { cn } from "@/src/lib/utils";
import { sendAnalyticEvent } from "./frontent.analytics";
import { getLocale, translate } from "./locale";
import { useCheckoutSlot } from "./appearance.context";

const CartComponentContent = ({
  className,
  locale,
}: {
  className: string;
  locale?: string;
}) => {
  const provider = useCartProvider();
  const currentLocale = locale ?? getLocale();

  const productList = useCheckoutSlot("productList");
  const summary = useCheckoutSlot("summary");
  const totalLabel = useCheckoutSlot("totalLabel");
  const totalValue = useCheckoutSlot("totalValue");
  const deliveryText = useCheckoutSlot("deliveryText");
  const countryLabel = useCheckoutSlot("countryLabel");
  const paymentButtons = useCheckoutSlot("paymentButtons");
  const checkoutButton = useCheckoutSlot("checkoutButton");
  const emptyState = useCheckoutSlot("emptyState");
  const error = useCheckoutSlot("error");
  const skeleton = useCheckoutSlot("skeleton");

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
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["cart", currentLocale],
    queryFn: provider.getProducts,
  });
  const { data: countryData, refetch: refetchCountry } = useQuery({
    queryKey: ["cart-country"],
    queryFn: provider.getCountry,
  });

  const [productsParent] = useAutoAnimate(/* optional config */);

  const products = isErr(data) ? undefined : data;

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

  const selectedCountry =
    countryData != null && !isErr(countryData) && countryData != ""
      ? countryData
      : undefined;

  async function shouldUpdate(id: string, newQuantity?: number) {
    if (newQuantity != null) {
      if (newQuantity <= 0) {
        await removeProduct({ id: id });
        await refetch();
        return;
      }

      await updateQuantity({
        id: id,
        quantity: newQuantity,
      });
      await refetch();
      return;
    }
  }

  async function continueToCheckout() {
    try {
      setErrMsg("");

      if (products != null) {
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

      const response = await continueToCheckoutAsync();

      if (isErr(response)) {
        if (response.error == "item-ids-not-found") {
          setErrMsg(translate("unavailableProducts", currentLocale));
          if ("data" in response && Array.isArray(response.data)) {
            setMissingItemIds(response.data as string[]);
          }
        } else {
          setErrMsg(`${response.error}`);
        }
        return;
      }

      await clearCart();
      window.location.href = response.url;
    } catch (e: unknown) {
      setErrMsg(`${e}`);
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

      {!isLoading && (products == null || products.length == 0) && (
        <div className={"flex flex-col gap-4 p-4"}>
          <p
            data-bitsnap-checkout-slot="emptyState"
            className={cn(emptyState.className)}
            style={emptyState.style}
          >
            {translate("emptyCart", currentLocale)}
          </p>
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
                      shouldUpdate={(newQuantity) => {
                        shouldUpdate(product.id, newQuantity).then().catch();
                      }}
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
                {translate("total", currentLocale)}
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
                    {translate("delivery", currentLocale)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {countries && countries?.length > 1 && (
            <div>
              <h4
                data-bitsnap-checkout-slot="countryLabel"
                className={cn("ml-3 text-sm", countryLabel.className)}
                style={countryLabel.style}
              >
                {translate("chooseCountry", currentLocale)}
              </h4>
              <CountrySelector
                id={Math.random().toString()}
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
            <button
              data-bitsnap-checkout-slot="checkoutButton"
              onClick={continueToCheckout}
              disabled={
                isLoading ||
                isContinueToCheckoutLoading ||
                selectedCountry == null
              }
              className={cn(
                "px-3 py-2 my-2 mx-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition font-bold",
                checkoutButton.className,
              )}
              style={checkoutButton.style}
            >
              {isContinueToCheckoutLoading ? (
                <Spinner />
              ) : (
                translate("nextStep", currentLocale)
              )}
            </button>
            {errMsg.length > 0 && (
              <p
                data-bitsnap-checkout-slot="error"
                className={cn("text-sm text-center", error.className)}
                style={error.style}
              >
                {errMsg}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CartComponentContent;
