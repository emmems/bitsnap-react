import {
  Bitsnap,
  BitsnapCheckout,
  createCheckout,
  createPaymentURL,
  Panel,
  PanelLogin,
  PanelProvider,
  setCustomHost,
  setProjectID,
  setTheme,
  type CheckoutAppearance,
  type CheckoutSlotName,
  type CheckoutTheme,
  type LinkRequest,
} from "bitsnap-react";
import "bitsnap-react/dist/index.css";

/**
 * Consumer fixture.
 *
 * It is compiled against the built declaration files (see tsconfig.json), so
 * it fails when the packaged output drops an export, changes a legacy prop or
 * breaks the CSS subpath import.
 */

setProjectID("your-project-id");
setCustomHost("https://your-custom-host.com");
setTheme({ logoURL: "/logo.png" });

/** Unchanged integration: no `appearance` at all. */
export function LegacyStore() {
  return (
    <BitsnapCheckout
      projectID="your-project-id"
      locale="pl"
      className="custom-class"
      onVisibleChange={(isVisible) => console.log("visible", isVisible)}
      numberOfProductsInCartOptions={{ isVisible: true, style: { top: 0 } }}
    >
      <span>My Custom Cart Button</span>
    </BitsnapCheckout>
  );
}

const appearance: CheckoutAppearance = {
  theme: "light" satisfies CheckoutTheme,
  tokens: {
    fontFamily: '"Inter", sans-serif',
    background: "#ffffff",
    foreground: "#202020",
    buttonBackground: "#635bff",
    buttonForeground: "#ffffff",
    radius: "12px",
  },
  elements: {
    title: { style: { fontFamily: '"Georgia", serif', fontSize: "28px" } },
    checkoutButton: { className: "store-checkout-button" },
    countryOption: { style: { paddingLeft: "12px" } },
  },
};

/** New integration: partial tokens and individual element overrides. */
export function ThemedStore() {
  return (
    <BitsnapCheckout projectID="your-project-id" appearance={appearance} />
  );
}

/** An empty appearance must stay valid. */
export function DefaultStore() {
  return <BitsnapCheckout projectID="your-project-id" appearance={{}} />;
}

/** An appearance object may be built incrementally. */
export function partialAppearance(): CheckoutAppearance {
  const slot: CheckoutSlotName = "productName";
  const elements: CheckoutAppearance["elements"] = {
    [slot]: { className: "font-bold" },
  };

  return { elements };
}

export async function legacyCartFlow() {
  await Bitsnap.addProductToCart("product-id", 2, { customField: "value" });
  Bitsnap.showCart();
  Bitsnap.hideCart();
}

export async function legacyCheckoutFlow() {
  const request: LinkRequest = {
    items: [{ id: "product-id", quantity: 1 }],
    askForAddress: true,
    details: { email: "customer@example.com" },
  };

  const result = await createCheckout({ ...request, testMode: true });

  if (result.status === "ok") {
    window.location.href = result.redirectURL;
  }
}

export async function legacyPaymentUrl() {
  const result = await createPaymentURL({
    items: [{ id: "product-id", quantity: 1 }],
    askForAddress: true,
  });

  return result;
}

export function legacyPanel() {
  return (
    <PanelProvider>
      <Panel />
      <PanelLogin />
    </PanelProvider>
  );
}
