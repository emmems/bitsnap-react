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
import { sendAnalyticEvent } from "./frontent.analytics";
import { getLocale, translate } from "./locale";

const CartComponentContent = ({
  className,
  locale,
}: {
  className: string;
  locale?: string;
}) => {
  const provider = useCartProvider();
  const currentLocale = locale ?? getLocale();

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
      return prev + curr.details.price * curr.quantity;
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
          <Skeleton className={"w-full h-32"} />
          <Skeleton className={"w-full h-32"} />
        </div>
      )}

      {!isLoading && (products == null || products.length == 0) && (
        <div className={"flex flex-col gap-4 p-4"}>
          <p className={"dark:text-neutral-400 text-neutral-700"}>
            {translate("emptyCart", currentLocale)}
          </p>
        </div>
      )}

      <div className={"max-h-[70vh] overflow-clip overflow-y-scroll"}>
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
                    <hr className="h-1 dark:border-neutral-700 border-neutral-400" />
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
          <div className="mx-3 flex flex-col">
            <div className={"flex flex-row justify-between text-lg"}>
              <p className={"dark:text-neutral-200 text-neutral-800 text-xl"}>
                {translate("total", currentLocale)}
              </p>
              <div className={"flex flex-col items-end"}>
                <p
                  className={
                    "dark:text-neutral-200 text-neutral-800 font-medium"
                  }
                >
                  {formatCurrency(sumOfProducts, currency)}
                </p>
                {isSomeProductDeliverable && (
                  <p className={"opacity-70 text-right text-base"}>
                    {translate("delivery", currentLocale)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {countries && countries?.length > 1 && (
            <div>
              <h4
                className={
                  "ml-3 text-sm dark:text-neutral-400 text-neutral-700"
                }
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
              <div className="w-full px-2">
                <ApplePayButton
                  colorType="white"
                  style={{ width: "100%" }}
                  items={products?.map((el) => ({
                    name: el.details?.name ?? "",
                    id: el.productID,
                    price: el.details?.price ?? 0,
                    quantity: el.quantity,
                    isDeliverable: el.details?.isDeliverable ?? false,
                    metadata: el.metadata,
                  }))}
                />
              </div>
            )}
            {products != null && products.length > 0 && (
              <div className="w-full px-2">
                <GooglePayButton
                  buttonSizeMode="fill"
                  buttonColor="white"
                  style={{ width: "100%" }}
                  items={products?.map((el) => ({
                    name: el.details?.name ?? "",
                    id: el.productID,
                    price: el.details?.price ?? 0,
                    quantity: el.quantity,
                    isDeliverable: el.details?.isDeliverable ?? false,
                    metadata: el.metadata,
                  }))}
                />
              </div>
            )}
            <button
              onClick={continueToCheckout}
              disabled={
                isLoading ||
                isContinueToCheckoutLoading ||
                selectedCountry == null
              }
              className={
                "px-3 py-2 my-2 mx-2 rounded-md disabled:opacity-40 disabled:cursor-not-allowed dark:bg-neutral-300 dark:hover:bg-neutral-100 dark:text-neutral-800 hover:bg-neutral-900 text-neutral-200 bg-neutral-800 transition font-bold"
              }
            >
              {isContinueToCheckoutLoading ? (
                <Spinner />
              ) : (
                translate("nextStep", currentLocale)
              )}
            </button>
            {errMsg.length > 0 && (
              <p className={"text-red-500 text-sm text-center"}>{errMsg}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CartComponentContent;
