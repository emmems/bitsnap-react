import ApplePayButton from "apple-pay-button";
import { PublicApiClient } from "src/public.api.client";
import CartProvider, { getProjectID, useCartProvider } from "./CartProvider";
import { HOST } from "./constants";
import { isErr } from "./lib/err";
import { round } from "./lib/round.number";
import { useQuery } from "react-query";

type AppleButtonType = 'plain' | 'add-money' | 'book' | 'buy' | 'check-out' | 'continue' | 'contribute' | 'donate' | 'order' | 'pay' | 'reload' | 'rent' | 'set-up' | 'subscribe' | 'support' | 'tip' | 'top-up';
type ColorType = 'black' | 'white' | 'white-outline';

type Props = {
  style?: {
    width?: string;
    height?: string;
    borderRadius?: string;
    padding?: string;
    boxSizing?: string;
  };
  buttonType?: AppleButtonType;
  colorType?: ColorType;
  items: { name: string; id: string; price: number; quantity: number; isDeliverable?: boolean; metadata?: { [key: string]: string | undefined } }[];
  onClick?: () => Promise<void>;
};

function ApplePayButtonComponent({ style, buttonType, colorType, items, onClick }: Props) {
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
  } = useCartProvider();
  const { data: isApplePayAvailable } = useQuery("is-apple-pay-available", checkIfApplePayIsAvailable);
  if (isApplePayAvailable != true) {
    return null;
  }

  const expectedItems = items.map(el => ({
    productID: el.id,
    quantity: el.quantity,
    metadata: el.metadata,
  }));

  async function beginSession() {
    const requiresShipping = items.find(el => el.isDeliverable === true) != null;
    const session = new ApplePaySession(14, {
      countryCode: "PL",
      merchantCapabilities: ["supports3DS"],
      supportedNetworks: ["visa", "masterCard"],
      currencyCode: "PLN",
      total: {
        amount: `${round(items.reduce((acc, item) => acc + item.price * item.quantity, 0) / 100, 2)}`,
        label: "Płatność za koszyk",
        type: "pending",
      },
      lineItems: [
        ...items.map((item) => ({
          amount: `${round((item.price * item.quantity) / 100, 2)}`,
          label: item.name,
          type: "final",
        } as ApplePayJS.ApplePayLineItem)),
        requiresShipping ? {
          amount: `16.99`,
          type: "pending",
          label: "Dostawa",
        } as ApplePayJS.ApplePayLineItem : undefined
      ].filter(el => el != null),
      ...(
        requiresShipping ? {
          shippingMethods: [],
          supportsCouponCode: true,
          requiredBillingContactFields: ["name", "email", "postalAddress", "phone"],
          requiredShippingContactFields: ["name", "email", "postalAddress", "phone"],
        } : {}
      ),
    });
    await onClick?.();
    const apRequest = await getApplePayPaymentRequest({ expectedItems });
    if (isErr(apRequest)) {
      console.error("Error creating ApplePaySession:", apRequest.error);
      return;
    }

    session.oncancel = (event) => {
      console.log("ApplePaySession cancelled", event);
    };

    session.onvalidatemerchant = async (event) => {
      try {
        const result = await PublicApiClient.get(HOST).applePayValidateMerchant(
          {
            validationUrl: event.validationURL,
            projectId: getProjectID(),
          },
        );
        console.log("merchantSession", result.merchantSession);
        if (result.merchantSession.length > 0) {
          console.log('completing merchant session');
          session.completeMerchantValidation(
            JSON.parse(result.merchantSession),
          );
        } else {
          session.abort();
        }
      } catch (error) {
        session.abort;
      }
    };

    session.onshippingmethodselected = async (event) => {
      console.log("shipping method selected", event);
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

        console.log('apRequest', apRequest);
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
      try {
        const result = await completeApplePayPayment({
          token: event.payment.token,
          billingContact: event.payment.billingContact,
          shippingContact: event.payment.shippingContact,
        });
        if (isErr(result)) {
          console.log("apple pay error", result);
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
        session.completePayment({
          status: result.isSuccess ? ApplePaySession.STATUS_SUCCESS : ApplePaySession.STATUS_FAILURE,
        });

        result.isSuccess && clearCart();
      } catch (e) {
        session.completePayment({
          status: ApplePaySession.STATUS_FAILURE,
        });
      }
      // event.complete(ApplePaySession.STATUS_SUCCESS);
    };

    session.begin();
  }

  return <ApplePayButton style={style} buttonStyle={colorType} type={buttonType} onClick={beginSession} />;
}

function Wrapper(props: Props) {
  return (
    <>
      <CartProvider>
        <ApplePayButtonComponent {...props} />
      </CartProvider>
    </>
  );
}
export default Wrapper;
