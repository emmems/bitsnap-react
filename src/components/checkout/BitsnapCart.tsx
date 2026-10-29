import { useEffect, useId, useRef } from "react";
import zod from "zod";
import {
  InstrumentProvider,
  useCartInstrument,
  useInstrument,
  type AnalyticsOption,
} from "@/src/analytics/instrument";
import type { CheckoutAppearance } from "./appearance";
import type { CheckoutTexts } from "./texts";
import CartComponent from "./CartComponent";
import { getCheckoutMethods, getProjectID, setProjectID } from "./CartProvider";
import { sendAnalyticEvent } from "./frontent.analytics";
import { isErr } from "./lib/err";
import { useCheckoutStore } from "./state";
import { getLocale, setLocale } from "./locale";
import { getCheckoutText, type CheckoutTextKey } from "./texts";

enum CartEvent {
  ADD_TO_CART = "ADD_TO_CART",
}

const cartAddToCartSchema = zod.object({
  id: zod.string(),
  isSubscription: zod.boolean().default(false),
  quantity: zod.number(),
  metadata: zod.record(zod.string(), zod.string().optional()).optional(),
  url: zod.string().optional(),
});

type CartAddToCartEvent = zod.infer<typeof cartAddToCartSchema>;

export type BitsnapCartProps = {
  projectID: string;
  locale?: string;
  children?: React.ReactNode;
  onVisibleChange?: (isVisible: boolean) => void;
  className?: string;
  numberOfProductsInCartOptions?: {
    style?: React.CSSProperties;
    isVisible?: boolean;
  };
  /**
   * Optional checkout appearance. Omitting it (or passing `{}`) keeps the
   * current presentation; every token and element slot is partial.
   */
  appearance?: CheckoutAppearance;
  /**
   * Optional text overrides. Any key given here replaces the built-in string
   * whatever the locale; omitted keys keep the `pl`/`en` defaults.
   */
  texts?: Partial<CheckoutTexts>;
  /**
   * Usage statistics for your Bitsnap dashboard (cart opened, checkout
   * started, add to cart). On by default; `false` turns it off. An object
   * lets you forward every event: `{ onEvent }`. Nothing is stored on the
   * visitor's device.
   */
  analytics?: AnalyticsOption;
};

const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

function BitsnapCart({
  projectID,
  locale,
  children,
  onVisibleChange,
  className,
  numberOfProductsInCartOptions,
  appearance,
  texts,
  analytics,
}: BitsnapCartProps) {
  const instrument = useInstrument(projectID, analytics, "cart");
  // Cart changes made outside of components (`Bitsnap.addProductToCart`) are reported here.
  useCartInstrument(instrument);
  const { isCartVisible, showCart, hideCart, numberOfProductsInCart } =
    useCheckoutStore();
  const panelId = `bitsnap-cart-${useId()}`;
  const text = (key: CheckoutTextKey) =>
    getCheckoutText(key, locale ?? getLocale(), texts);
  // The `window.cart` handlers are created once and must read the latest props.
  const textRef = useRef(text);
  textRef.current = text;

  /** Shows a message through the error area of the cart drawer. */
  function showCartNotice(key: CheckoutTextKey) {
    useCheckoutStore.getState().setNotice(textRef.current(key));
    showCart();
  }

  function sentPostMessageToIframe(msg: unknown) {
    const iframes = document.querySelectorAll("iframe");

    iframes.forEach((iframe) => {
      iframe.contentWindow?.postMessage(msg, "*");
    });
  }

  useEffect(() => {
    onVisibleChange?.(isCartVisible);
    if (isCartVisible) {
      sendAnalyticEvent({
        event: "viewCart",
      });
    }
  }, [isCartVisible]);

  useEffect(() => {
    setProjectID(projectID);
  }, [projectID]);

  useEffect(() => {
    setLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (!("cart" in window)) {
      const projectID = getProjectID();
      if (projectID == null) {
        console.warn("There is no project ID configured.");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      window["cart"] = {
        buyProduct: async (args: unknown) => {
          try {
            const payload = zod
              .object({
                productID: zod.string(),
                email: zod.string().optional(),
                name: zod.string().optional(),
                country: zod.string().optional(),
                marketingAgreement: zod.boolean().optional(),
                locale: zod.string().optional(),
              })
              .parse(args);
            const methods = getCheckoutMethods(projectID);
            try {
              const products = await methods.getProducts();
              if (isErr(products) == false) {
                sendAnalyticEvent({
                  event: "initiateCheckout",
                  items: products.map((el) => ({
                    id: el.productID,
                    name: el.details?.name ?? "",
                    price: el.details?.price ?? 0,
                    quantity: el.quantity,
                    currency: el.details?.currency ?? "PLN",
                  })),
                });
              }
            } catch (e) {}

            const result = await methods.justRedirectToPayment(payload);

            if (isErr(result) == false) {
              window.location.href = result.url;
            } else {
              showCartNotice("redirectFailed");
            }
          } catch (e) {
            console.warn(e);
          }
        },
      };
    }
  }, []);

  async function handleAddingToCart(id: string, payload?: unknown) {
    const projectID = getProjectID();
    if (projectID == null) {
      console.warn("There is no project ID configured.");
      return;
    }

    try {
      const data = cartAddToCartSchema.parse(payload);

      if (data.isSubscription) {
        await handleAddingSubscriptionToCart(projectID, data);
        return;
      }

      const methods = getCheckoutMethods(projectID);

      await methods.addProduct({
        productID: data.id,
        quantity: data.quantity,
        metadata: data.metadata,
        url: data.url,
      });

      sentPostMessageToIframe({
        id: id,
        type: CartEvent.ADD_TO_CART,
        success: true,
      });
      showCart();
    } catch (e) {
      console.warn("cannot add item to cart", e);
    }
  }

  async function handleAddingSubscriptionToCart(
    projectID: string,
    event: CartAddToCartEvent,
  ) {
    console.warn(
      "subscriptions cannot be added to the cart yet",
      projectID,
      event.id,
    );
    showCartNotice("subscriptionUnsupported");
  }

  function setupEventListener() {
    if ("__cart_is_listening" in window) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    window["__cart_is_listening"] = true;
    window.addEventListener("message", (event) => {
      if (
        typeof event.data["id"] != "undefined" &&
        typeof event.data["type"] != "undefined"
      ) {
        const { id, type } = event.data;
        switch (type) {
          case CartEvent.ADD_TO_CART.toString():
            handleAddingToCart(id, event.data["payload"]).then().catch();
            break;
          default:
            break;
        }
      }
    });
  }

  useEffect(() => {
    setupEventListener();

    if (typeof window !== "undefined") {
      try {
        const parsedParams = new URLSearchParams(window.location.search);
        const refLink =
          parsedParams.get("ref") ?? parsedParams.get("utm-source");
        if (
          typeof localStorage != "undefined" &&
          refLink &&
          refLink.length > 0
        ) {
          localStorage.setItem("bitsnap-ref", refLink);
        }
      } catch (e) {
        return;
      }
    }
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => (isCartVisible ? hideCart() : showCart())}
        aria-label={
          children
            ? undefined
            : numberOfProductsInCart > 0
              ? `${text("openCart")}. ${text("cartItemsCount")}: ${numberOfProductsInCart}`
              : text("openCart")
        }
        aria-expanded={isCartVisible}
        aria-haspopup="dialog"
        aria-controls={isCartVisible ? panelId : undefined}
        style={{ position: "relative" }}
        className={[
          "bitsnap-react",
          className ?? "rounded-full hover:bg-neutral-300 transition p-1",
        ].join(" ")}
      >
        {children ? (
          <>{children}</>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-shopping-cart"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="8" cy="21" r="1" />
            <circle cx="19" cy="21" r="1" />
            <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
          </svg>
        )}
        {numberOfProductsInCart > 0 && (
          <span style={visuallyHidden}>
            {text("cartItemsCount")}: {numberOfProductsInCart}
          </span>
        )}
        {numberOfProductsInCartOptions?.isVisible != false &&
          numberOfProductsInCart > 0 && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                bottom: -5,
                right: -5,
                background: "black",
                color: "white",
                borderRadius: "50%",
                width: "22px",
                height: "22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 600,
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
                ...numberOfProductsInCartOptions?.style,
              }}
            >
              {numberOfProductsInCart}
            </div>
          )}
      </button>
      <InstrumentProvider value={instrument}>
        <CartComponent
          isVisible={isCartVisible}
          locale={locale}
          appearance={appearance}
          texts={texts}
          panelId={panelId}
          shouldHide={() => {
            hideCart();
          }}
        />
      </InstrumentProvider>
    </>
  );
}

export default BitsnapCart;
