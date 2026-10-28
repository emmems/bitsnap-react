import GooglePayButton from "@google-pay/button-react";
import CartProvider, { useCartProvider } from "./CartProvider";
import { isErr } from "./lib/err";
import { currentProjectID } from "./project-id";
import { Spinner } from "@/src/ui/spinner";
import { useQuery, useMutation } from "@tanstack/react-query";
import { sendAnalyticEvent } from "./frontent.analytics";
import {
  InstrumentProvider,
  useInstrument,
  useInstrumentContext,
  type AnalyticsOption,
} from "@/src/analytics/instrument";

export type Props = {
  test?: boolean;
  buttonSizeMode?: "static" | "fill";
  buttonColor?: "white" | "black";
  style?: {
    width?: string;
  };
  items: {
    name: string;
    id: string;
    price: number;
    quantity: number;
    isDeliverable?: boolean;
    metadata?: { [key: string]: string | undefined };
  }[];
  /**
   * Usage statistics for your Bitsnap dashboard. On by default; `false` turns
   * it off. Inside `<BitsnapCheckout>` the checkout's setting applies unless
   * this is given.
   */
  analytics?: AnalyticsOption;
};

function GooglePayButtonComponent({
  items,
  style,
  buttonColor,
  buttonSizeMode,
  test,
}: Props) {
  const {
    getGooglePayConfiguration,
    completeGooglePayPayment,
    setCountry,
    setCouponCodeIfPossible,
    setDeliveryMethod,
    setEmail,
    setPostalCode,
    clearCart,
  } = useCartProvider();

  const instrument = useInstrumentContext();
  const { data: googlePayConfiguration } = useQuery({
    queryKey: [
      "get-google-pay-configuration",
      items.map((el) => el.id).join(","),
    ],
    queryFn: () =>
      getGooglePayConfiguration({
        items: items.map((el) => ({
          ...el,
          id: undefined,
          productID: el.id,
        })),
      }),
  });

  const { mutateAsync: completeGooglePayPaymentAsync, isPending } = useMutation(
    {
      mutationFn: completeGooglePayPayment,
    }
  );
  if (
    googlePayConfiguration == null ||
    googlePayConfiguration.isAvailable != true
  ) {
    console.log(
      "google pay configuration is not available",
      googlePayConfiguration
    );
    return null;
  }

  return (
    <>
      <GooglePayButton
        buttonSizeMode={buttonSizeMode}
        buttonColor={buttonColor}
        style={style}
        existingPaymentMethodRequired={true}
        onClick={() =>
          instrument.track("payment_method_selected", {
            gateway: "google_pay",
            method: "google_pay",
          })
        }
        environment={test === true ? "TEST" : "PRODUCTION"}
        onPaymentDataChanged={async (paymentData) => {
          sendAnalyticEvent({
            event: "initiateCheckout",
            items: items.map((el) => ({
              id: el.id,
              name: el.name,
              price: el.price,
              quantity: el.quantity,
              currency: "PLN",
            })),
          });
          console.log("payment data changed", paymentData);
          if (paymentData.shippingAddress?.postalCode != null) {
            await setPostalCode(paymentData.shippingAddress?.postalCode);
          }
          if (paymentData.shippingAddress?.countryCode != null) {
            await setCountry(paymentData.shippingAddress?.countryCode);
          }
          if (paymentData.shippingOptionData?.id != null) {
            await setDeliveryMethod(paymentData.shippingOptionData.id);
          }

          const config = await getGooglePayConfiguration({ items: [] });
          console.log("PAYMENT DATA CHANGED CONFIG", config);
          if (config.isAvailable) {
            return {
              error: undefined,
              newShippingOptionParameters:
                config.config.shippingOptionParameters,
              newTransactionInfo: config.config.transactionInfo,
            };
          }

          return {
            error: undefined,
          };
        }}
        paymentRequest={googlePayConfiguration.config}
        onLoadPaymentData={async (paymentRequest) => {
          instrument.track("payment_submitted", {
            gateway: "google_pay",
            method: "google_pay",
          });
          try {
            const result = await completeGooglePayPaymentAsync({
              paymentData: paymentRequest,
            });
            if (isErr(result)) {
              console.log("apple pay error", result);
              return;
            }

            result.isSuccess && clearCart();
            if (result.redirectURL) {
              open(result.redirectURL, "_self");
            }
          } catch (e) {
            console.warn("error completing google pay payment", e);
          }
        }}
      />
      {isPending ? <Spinner /> : null}
    </>
  );
}

function Wrapper(props: Props) {
  const instrument = useInstrument(
    currentProjectID(),
    props.analytics,
    "cart",
  );
  return (
    <InstrumentProvider value={instrument}>
      <CartProvider>
        <GooglePayButtonComponent {...props} />
      </CartProvider>
    </InstrumentProvider>
  );
}

export default Wrapper;
