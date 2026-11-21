import {
  ApplePayButton,
  Bitsnap,
  BitsnapCheckout,
  CHECKOUT_SLOT_NAMES,
  GooglePayButton,
  InPostPayButton,
  ITEM_IDS_NOT_FOUND,
  RevolutPayButton,
  createCheckout,
  createPaymentURL,
  getLocale,
  getPaymentMethodChoice,
  setCustomHost,
  setLocale,
  setProjectID,
  type ApplePayButtonProps,
  type BitsnapCartProps,
  type BuyErrorData,
  type CartPresentation,
  type CheckoutAppearance,
  type CheckoutSlotName,
  type CheckoutTexts,
  type CreateCheckoutResult,
  type ExpressItem,
  type GooglePayButtonProps,
  type InPostPayButtonProps,
  type LinkRequest,
  type RevolutPayButtonProps,
  type RevolutPaymentOutcome,
} from "bitsnap-react/cart";
import { BitsnapCheckout as FromMain, type LinkRequest as LinkRequestFromMain } from "bitsnap-react";
import "bitsnap-react/cart/cart.css";

/**
 * Consumer fixture for `bitsnap-react/cart` (1.32.0), compiled against the
 * built declarations by `pnpm test:types`: the cart, its `Bitsnap` API, the
 * express buttons and the request type, without the rest of the SDK.
 */

setProjectID("your-project-id");
setCustomHost("https://your-custom-host.com");
setLocale("pl");
const locale: string = getLocale();

const appearance: CheckoutAppearance = {
  theme: "light",
  tokens: { buttonBackground: "#111827", panelWidth: "480px", paymentLogoHeight: "24px" },
  elements: { checkoutButton: { className: "shop-checkout" } },
};
const texts: Partial<CheckoutTexts> = { checkoutFailed: "Payment failed" };
const presentation: CartPresentation = "dialog";
const slot: CheckoutSlotName = CHECKOUT_SLOT_NAMES[0];

export function CartOnlyStore() {
  const props: BitsnapCartProps = {
    projectID: "your-project-id",
    locale,
    appearance,
    texts,
    presentation,
    prefetch: false,
    analytics: false,
  };
  return (
    <BitsnapCheckout {...props} onVisibleChange={(visible) => console.log(slot, visible)}>
      <span>Cart</span>
    </BitsnapCheckout>
  );
}

// The same component as the main entry exports (one cart if an app mixes both).
export const sameComponent: typeof BitsnapCheckout = FromMain;

export async function cartApi() {
  await Bitsnap.addProductToCart("product-id", 2, { size: "M" });
  Bitsnap.showCart();
  Bitsnap.hideCart();
  Bitsnap.warmUp();
}

// `LinkRequest` has no zod in it: every field, with its optionality.
export const fullRequest: LinkRequest = {
  locale: "pl",
  askForAddress: true,
  askForPhone: true,
  askForNote: true,
  askForNip: true,
  delivery: [{ name: "Courier", desc: "1-2 days", min: 1, max: 2, price: 12.5 }],
  deliveryMethod: "courier",
  details: {
    email: "customer@example.com",
    name: "Ala",
    lastName: "Kowalska",
    phone: "+48123456789",
    address: { name: "Ala", line1: "Prosta 1", line2: "2", city: "Warszawa", zipCode: "00-001", country: "PL" },
    billingAddress: { nip: "1234567890", name: "Firma", line1: "Prosta 1", city: "Warszawa", zipCode: "00-001" },
  },
  countries: ["PL", "DE"],
  items: [
    {
      id: "product-id",
      quantity: 2,
      priceVersion: "v1",
      amount: 500,
      name: "Mug",
      description: "A mug",
      imageURL: "https://example.com/mug.png",
      price: 2500,
      currency: "PLN",
    },
  ],
  metadata: { source: "cart" },
  additionalAgreements: [{ id: "a1", name: "Terms", description: "Read them", required: true, answer: true }],
  blikCode: "123456",
  paymentMethod: "manual",
  couponCode: "SAVE",
  redirect: { successURL: "https://example.com/ok", cancelURL: "https://example.com/cancel" },
};
export const minimalRequest: LinkRequest = { items: [{ id: "product-id", quantity: 1 }] };
export const sameRequestType: LinkRequestFromMain = minimalRequest;

// @ts-expect-error `items` is required
export const noItems: LinkRequest = { askForAddress: true };
// @ts-expect-error a quantity is a number
export const stringQuantity: LinkRequest = { items: [{ id: "p", quantity: "1" }] };
// @ts-expect-error only online, manual and cod are payment methods
export const badMethod: LinkRequest = { items: [], paymentMethod: "crypto" };
// @ts-expect-error an agreement needs a name
export const nameless: LinkRequest = { items: [], additionalAgreements: [{ required: false }] };

export async function requests() {
  const choice = await getPaymentMethodChoice(minimalRequest);
  const url = await createPaymentURL(fullRequest);
  const checkout: CreateCheckoutResult = await createCheckout({ ...minimalRequest, testMode: true });
  if (checkout.status === "ok") window.location.href = checkout.redirectURL;
  return { choice, url };
}

export const notFound: string = ITEM_IDS_NOT_FOUND;
export const buyError = (data: BuyErrorData) => data;

// The express buttons the cart contains.
const items: ExpressItem[] = [{ id: "prodv2_1", quantity: 1 }];
const inpost: InPostPayButtonProps = { projectID: "p", items };
const revolut: RevolutPayButtonProps = { projectID: "p", items };
export const express = (apple: ApplePayButtonProps, google: GooglePayButtonProps) => (
  <div>
    <InPostPayButton {...inpost} />
    <RevolutPayButton {...revolut} onPaymentResult={(outcome: RevolutPaymentOutcome) => console.log(outcome.status)} />
    <ApplePayButton {...apple} />
    <GooglePayButton {...google} />
  </div>
);
