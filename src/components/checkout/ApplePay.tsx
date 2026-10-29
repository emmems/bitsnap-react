import ApplePayButtonModule from "apple-pay-button";
import { PublicApiClient } from "src/public.api.client";
import CartProvider, {
  getCheckoutSelection,
  getProjectID,
  useCartProvider,
} from "./CartProvider";
import { HOST } from "./constants";
import { isErr } from "./lib/err";
import { currentProjectID } from "./project-id";
import { round } from "./lib/round.number";
import { useQuery } from "@tanstack/react-query";
import { sendAnalyticEvent } from "./frontent.analytics";
import { useCheckoutText } from "./texts.context";
import {
  InstrumentProvider,
  useInstrument,
  useInstrumentContext,
  type AnalyticsOption,
} from "@/src/analytics/instrument";

// A CommonJS package with a `default` export: bundlers unwrap it, Node's own
// ESM loader (server rendering of the unbundled library) does not.
const ApplePayButton: typeof ApplePayButtonModule =
  (ApplePayButtonModule as unknown as { default?: typeof ApplePayButtonModule })
    .default ?? ApplePayButtonModule;

type AppleButtonType =
  | "plain"
  | "add-money"
  | "book"
  | "buy"
  | "check-out"
  | "continue"
  | "contribute"
  | "donate"
  | "order"
  | "pay"
  | "reload"
  | "rent"
  | "set-up"
  | "subscribe"
  | "support"
  | "tip"
  | "top-up";
type ColorType = "black" | "white" | "white-outline";

export type Props = {
  style?: {
    width?: string;
    height?: string;
    borderRadius?: string;
    padding?: string;
    boxSizing?: string;
  };
  buttonType?: AppleButtonType;
  colorType?: ColorType;
  items: {
    name: string;
    id: string;
    price: number;
    /** Currency of `price` (minor units); defaults to PLN. */
    currency?: string;
    quantity: number;
    isDeliverable?: boolean;
    metadata?: { [key: string]: string | undefined };
  }[];
  onClick?: () => Promise<void>;
  /**
   * Usage statistics for your Bitsnap dashboard (Apple Pay clicks and
   * results). On by default; `false` turns it off. Inside `<BitsnapCheckout>`
   * the checkout's setting applies unless this is given.
   */
  analytics?: AnalyticsOption;
};

function ApplePayButtonComponent({
  style,
  buttonType,
  colorType,
  items,
  onClick,
}: Props) {
  const {
    checkIfApplePayIsAvailable,
    getApplePayPaymentRequest,
    completeApplePayPayment,
    setCountry,
    setCouponCodeIfPossible,
    setDeliveryMethod,
    setEmail,
    setPostalCode,
    clearCart,
    getApplePayPreview,
  } = useCartProvider();
  const instrument = useInstrumentContext();
  const paymentForCartText = useCheckoutText("paymentForCart");
  const { data: isApplePayAvailable } = useQuery({
    queryKey: ["is-apple-pay-available"],
    queryFn: checkIfApplePayIsAvailable,
  });
  const itemsKey = items.map((el) => `${el.id}:${el.quantity}`).join(",");
  const selection = getCheckoutSelection();
  const { data: preview } = useQuery({
    queryKey: [
      "apple-pay-preview",
      itemsKey,
      selection.country ?? "",
      selection.couponCode ?? "",
      selection.selectedDeliveryMethod ?? "",
      selection.postalCode ?? "",
    ],
    queryFn: () =>
      getApplePayPreview({
        items: items.map((el) => ({
          productID: el.id,
          quantity: el.quantity,
          metadata: el.metadata,
        })),
      }),
    enabled: isApplePayAvailable === true,
  });
  if (isApplePayAvailable != true) {
    return null;
  }
  // The backend's answer when it is there; else the cart's own currency and
  // total, with no delivery in it (it is added once the buyer picks a method).
  const loadedPreview =
    preview != null && !isErr(preview)
      ? preview
      : {
          countryCode: selection.country || "PL",
          currencyCode: items[0]?.currency ?? "PLN",
          totalAmount: `${round(
            items.reduce((acc, item) => acc + item.price * item.quantity, 0) /
              100,
            2,
          )}`,
        };

  const expectedItems = items.map((el) => ({
    productID: el.id,
    quantity: el.quantity,
    metadata: el.metadata,
  }));

  async function beginSession() {
    let reported = false;
    const report = (outcome: "success" | "fail" | "cancel") => {
      if (reported) {
        return;
      }
      reported = true;
      instrument.track("apple_pay_result", { outcome });
    };
    instrument.track("apple_pay_clicked", {});
    instrument.track("payment_method_selected", {
      gateway: "apple_pay",
      method: "apple_pay",
    });
    sendAnalyticEvent({
      event: "initiateCheckout",
      items: items.map((el) => ({
        id: el.id,
        name: el.name,
        price: el.price,
        quantity: el.quantity,
        currency: loadedPreview.currencyCode,
      })),
    });
    const requiresShipping =
      items.find((el) => el.isDeliverable === true) != null;
    // The session has to be created inside the click, so country, currency
    // and total come from the backend's answer that was loaded beforehand.
    const session = new ApplePaySession(14, {
      countryCode: loadedPreview.countryCode,
      merchantCapabilities: ["supports3DS"],
      supportedNetworks: ["visa", "masterCard"],
      currencyCode: loadedPreview.currencyCode,
      total: {
        amount: loadedPreview.totalAmount,
        label: paymentForCartText,
        type: "pending",
      },
      // Delivery is added once the buyer picks a contact and a method.
      lineItems: items.map(
        (item) =>
          ({
            amount: `${round((item.price * item.quantity) / 100, 2)}`,
            label: item.name,
            type: "final",
          } as ApplePayJS.ApplePayLineItem)
      ),
      ...(requiresShipping
        ? {
            shippingMethods: [],
            supportsCouponCode: true,
            requiredBillingContactFields: [
              "name",
              "email",
              "postalAddress",
              "phone",
            ],
            requiredShippingContactFields: [
              "name",
              "email",
              "postalAddress",
              "phone",
            ],
          }
        : {}),
    });
    await onClick?.();
    const apRequest = await getApplePayPaymentRequest({ expectedItems });
    if (isErr(apRequest)) {
      console.error("Error creating ApplePaySession:", apRequest.error);
      report("fail");
      return;
    }

    session.oncancel = (event) => {
      console.log("ApplePaySession cancelled", event);
      report("cancel");
    };

    session.onvalidatemerchant = async (event) => {
      try {
        const result = await PublicApiClient.get(HOST).applePayValidateMerchant(
          {
            validationUrl: event.validationURL,
            projectId: getProjectID(),
          }
        );
        console.log("merchantSession", result.merchantSession);
        if (result.merchantSession.length > 0) {
          console.log("completing merchant session");
          session.completeMerchantValidation(
            JSON.parse(result.merchantSession)
          );
        } else {
          session.abort();
        }
      } catch (error) {
        session.abort();
      }
    };

    session.onshippingmethodselected = async (event) => {
      console.log("shipping method selected", event);
      instrument.track("delivery_method_selected", {
        method: event.shippingMethod.identifier,
      });
      await setDeliveryMethod(event.shippingMethod.identifier);
      const apRequest = await getApplePayPaymentRequest({ expectedItems });
      console.log("apRequest", apRequest);
      if (isErr(apRequest)) {
        session.abort();
        throw new Error("Failed to get Apple Pay payment request");
      }

      session.completeShippingMethodSelection({
        newTotal: apRequest.total,
        newLineItems: apRequest.lineItems,
        newShippingMethods: apRequest.shippingMethods,
      });
    };
    session.onshippingcontactselected = async (event) => {
      try {
        if (event.shippingContact.countryCode != null) {
          await setCountry(event.shippingContact.countryCode);
        }
        if (event.shippingContact.postalCode != null) {
          await setPostalCode(event.shippingContact.postalCode);
        }
        if (event.shippingContact.phoneNumber != null) {
          await setEmail(event.shippingContact.emailAddress);
        }
        const apRequest = await getApplePayPaymentRequest({ expectedItems });
        if (isErr(apRequest)) {
          session.abort();
          throw new Error("Failed to get Apple Pay payment request");
        }

        console.log("apRequest", apRequest);
        session.completeShippingContactSelection({
          newLineItems: apRequest.lineItems,
          newTotal: apRequest.total,
          newShippingMethods: apRequest.shippingMethods,
        });
      } catch (error) {
        console.log("shipping contact selected error", error);
        session.abort();
      }
    };

    session.oncouponcodechanged = async (event) => {
      try {
        console.log("coupon code changed", event);
        const result = await setCouponCodeIfPossible(event.couponCode);
        const apRequest = await getApplePayPaymentRequest({ expectedItems });
        console.log("apRequest", apRequest);
        if (isErr(apRequest)) {
          session.abort();
          throw new Error("Failed to get Apple Pay payment request");
        }

        session.completeCouponCodeChange({
          errors: isErr(result)
            ? [new ApplePayError("couponCodeInvalid")]
            : undefined,
          newTotal: apRequest.total,
          newLineItems: apRequest.lineItems,
          newShippingMethods: apRequest.shippingMethods,
        });
      } catch (error) {
        console.log("coupon code changed error", error);
        session.abort();
      }
    };

    session.onpaymentauthorized = async (event) => {
      instrument.track("payment_submitted", {
        gateway: "apple_pay",
        method: "apple_pay",
      });
      try {
        const result = await completeApplePayPayment({
          token: event.payment.token,
          billingContact: event.payment.billingContact,
          shippingContact: event.payment.shippingContact,
        });
        if (isErr(result)) {
          console.log("apple pay error", result);
          report("fail");
          session.completePayment({
            status: ApplePaySession.STATUS_FAILURE,
          });
          return;
        }

        if (result.redirectURL) {
          setTimeout(() => {
            open(result.redirectURL, "_self");
          }, 2000);
        }
        report(result.isSuccess ? "success" : "fail");
        session.completePayment({
          status: result.isSuccess
            ? ApplePaySession.STATUS_SUCCESS
            : ApplePaySession.STATUS_FAILURE,
        });

        result.isSuccess && clearCart();
      } catch (e) {
        report("fail");
        session.completePayment({
          status: ApplePaySession.STATUS_FAILURE,
        });
      }
      // event.complete(ApplePaySession.STATUS_SUCCESS);
    };

    session.begin();
  }

  return (
    <ApplePayButton
      style={style}
      buttonStyle={colorType}
      type={buttonType}
      onClick={beginSession}
    />
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
        <ApplePayButtonComponent {...props} />
      </CartProvider>
    </InstrumentProvider>
  );
}
export default Wrapper;
