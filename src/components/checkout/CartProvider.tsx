import { setAllowedReturnOrigins, setPanelConfig } from "@/src/panel";
import { create } from "@bufbuild/protobuf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import {
  AddressSchema,
  BillingAddressSchema,
} from "src/gen/proto/common/v1/address_pb";
import {
  GetPreOrderDetailsRequestSchema,
  OneClickAuthorizePaymentRequest_Gateway,
  PreOrderItemSchema,
} from "src/gen/proto/public/v1/public_api_pb";
import { PublicApiClient } from "src/public.api.client";
import zod from "zod";
import { getCartInstrument, type Instrument } from "@/src/analytics/instrument";
import { withClientParam } from "@/src/lib/client-header";
import { HOST, setCustomHost } from "./constants";
import { sendAnalyticEvent } from "./frontent.analytics";
import { mapGooglePayConfiguration } from "./google.pay.mapper";
import { buildURL } from "./helper.methods";
import { Err, isErr } from "./lib/err";
import {
  cartItemURL,
  findMissingProductIDs,
  findProductForCartItem,
} from "./cart-items";
import { round } from "./lib/round.number";
import { LinkRequest } from "./link.request.schema";
import {
  createPaymentURL,
  getPaymentMethodChoice,
  getReferenceIfPossible,
  injectReferenceToRequestIfNeeded,
} from "./methods";
import { SingleProduct } from "./product.details.model";
import { useCheckoutStore } from "./state";
import { getLocale } from "./locale";
import { useCheckoutTextsConfig } from "./texts.context";
import { getCheckoutText, type CheckoutTexts } from "./texts";
import {
  orderStatusFromResponse,
  reconcilePendingOrder,
  subtractOrderLines,
  throttleOrderStatus,
  type PendingOrderLine,
  type PendingOrderOutcome,
} from "./pending-order";
import type { PaymentMethod, PaymentMethodChoice } from "./payment-method";

export const MARKETING_AGREEMENT_ID = "__m_a";

type CartProduct = {
  productID: string;
  quantity: number;
  metadata?: { [key: string]: string | undefined };
  /** Product page the cart item links to (image and name). */
  url?: string;

  // Those fields are used to send the price and currency to the analytics
  name?: string;
  price?: number;
  currency?: string;
  priceVersion?: string;

  /** Where `add_to_cart` is reported; defaults to the mounted `<BitsnapCheckout>`. */
  analytics?: Instrument;
};

export interface CartMethods {
  checkIfApplePayIsAvailable(): Promise<boolean>;
  getGooglePayConfiguration(args: { items: CartProduct[] }): Promise<
    | {
        isAvailable: true;
        config: google.payments.api.PaymentDataRequest;
      }
    | {
        isAvailable: false;
      }
  >;

  addProduct(args: CartProduct): Promise<Err | void>;

  getProducts: () => Promise<
    | Err
    | {
        id: string;
        productID: string;
        quantity: number;
        metadata?: { [key: string]: string | undefined };
        /** Product page given when the item was added. */
        url?: string;
        details?: SingleProduct;
        /** The catalog product, when `productID` is one of its variants. */
        catalogProductID?: string;
      }[]
  >;

  updateQuantity(args: { id: string; quantity: number }): Promise<Err | void>;

  removeProductFromCart: (args: { id: string }) => Promise<Err | void>;

  clearCart: () => Promise<Err | void>;

  getNumberOfElementsInCart: () => Promise<number>;

  setCouponCodeIfPossible: (couponCode?: string) => Promise<Err | void>;
  setDeliveryMethod: (deliveryMethod?: string) => Promise<Err | void>;
  setPostalCode: (postalCode?: string) => Promise<Err | void>;
  setEmail: (email?: string) => Promise<Err | void>;
  setCountry: (country: string) => Promise<Err | void>;
  getCountry: () => Promise<Err | string>;
  getAvailableCountries: () => Promise<Err | { name: string; code: string }[]>;

  /**
   * Whether the buyer may choose between paying online and paying the seller
   * by hand for the current cart. `null` (also on any failure) means nothing
   * to choose.
   */
  getPaymentMethodChoice: () => Promise<PaymentMethodChoice | null>;

  /**
   * Creates the order of the cart (`/buy`). `paymentMethod` is sent only when
   * given, that is when the buyer was offered the choice.
   */
  redirectToNextStep: (args?: { paymentMethod?: PaymentMethod }) => Promise<
    Err | { url: string; orderId?: string; projectId?: string }
  >;

  getApplePayPaymentRequest: (args?: {
    expectedItems?: CartProduct[];
  }) => Promise<Err | ApplePayJS.ApplePayPaymentRequest>;
  /**
   * Country, currency and total of the cart as the backend calculates them,
   * for an Apple Pay session that has to be created before any request.
   */
  getApplePayPreview: (args: { items: CartProduct[] }) => Promise<
    | Err
    | {
        countryCode: string;
        currencyCode: string;
        /** Major units, as Apple Pay wants them. */
        totalAmount: string;
      }
  >;
  completeApplePayPayment: (args: {
    token: ApplePayJS.ApplePayPaymentToken;
    shippingContact?: ApplePayJS.ApplePayPaymentContact;
    billingContact?: ApplePayJS.ApplePayPaymentContact;
  }) => Promise<
    | Err
    | {
        isSuccess: boolean;
        redirectURL?: string;
      }
  >;
  completeGooglePayPayment: (args: {
    paymentData: google.payments.api.PaymentData;
  }) => Promise<
    | Err
    | {
        isSuccess: boolean;
        redirectURL?: string;
      }
  >;

  justRedirectToPayment: (args: {
    email?: string;
    productID: string;
    name?: string;
    country?: string;
    marketingAgreement?: boolean;
    locale?: string;
  }) => Promise<
    | Err
    | {
        url: string;
      }
  >;
}

const CartProviderContext = createContext<CartMethods | undefined>(undefined);

export var bitsnapProjectID: string | undefined = undefined;
export function setProjectID(projectID: string) {
  setPanelConfig({
    projectID,
  });
  bitsnapProjectID = projectID;
  if (typeof window !== "undefined") {
    setAllowedReturnOrigins([window.location.origin]);
  }
}

export function getProjectID(): string | undefined {
  if (bitsnapProjectID != null) {
    return bitsnapProjectID;
  }
  const me = document.querySelector(
    'script[data-id][data-name="internal-cart"]',
  );
  const projectID = me?.getAttribute("data-id");
  return projectID ?? undefined;
}

export { getLocale, setLocale } from "./locale";

function getNewHostIfExist(): string | undefined {
  const me = document.querySelector(
    'script[data-id][data-name="internal-cart"]',
  );
  const customHost = me?.getAttribute("data-custom-host");
  return customHost ?? undefined;
}

const CartProvider = ({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale?: string;
}) => {
  const [queryClient] = useState(() => new QueryClient());
  const textsConfig = useCheckoutTextsConfig();

  useEffect(() => {
    updateNumberOfProductsInCart();
  }, []);

  const projectID = getProjectID();

  // An order that was left for the payment page clears the cart once it is paid.
  useEffect(() => {
    if (projectID == null) {
      return;
    }
    const reconcile = () => {
      void reconcileOrderOfLastPayment(projectID).then((outcome) => {
        // An open drawer refetches on focus before the order answers.
        if (outcome === "paid") {
          void queryClient.invalidateQueries({ queryKey: ["cart"] });
        }
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reconcile();
      }
    };
    reconcile();
    window.addEventListener("pageshow", reconcile);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", reconcile);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [projectID, queryClient]);

  if (projectID == null) {
    return <></>;
  }

  const checkoutMethods = getCheckoutMethods(
    projectID,
    locale ?? textsConfig.locale,
    textsConfig.texts,
  );

  return (
    <QueryClientProvider client={queryClient}>
      <CartProviderContext.Provider value={checkoutMethods}>
        {children}
      </CartProviderContext.Provider>
    </QueryClientProvider>
  );
};

let reconciling: Promise<PendingOrderOutcome | undefined> | undefined;

const askAboutOrder = throttleOrderStatus(async (order) =>
  orderStatusFromResponse(
    await PublicApiClient.get(HOST).getOrder({
      id: order.orderId,
      projectId: order.projectId,
    }),
  ),
);

/** What the buyer picked that changes the totals (for cache keys of wallet previews). */
export function getCheckoutSelection() {
  const { country, couponCode, selectedDeliveryMethod, postalCode } =
    getCheckout() ?? emptyCheckout;
  return { country, couponCode, selectedDeliveryMethod, postalCode };
}

/** The lines of the cart right now, for the order that is about to be paid. */
export function getCartLines(): PendingOrderLine[] {
  return (getCheckout()?.products ?? []).map((el) => ({
    id: el.id,
    quantity: el.quantity,
  }));
}

/** Removes the lines of a paid order from the cart; what was added since stays. */
function removeOrderLinesFromCart(lines: PendingOrderLine[]) {
  const checkout = getCheckout();
  saveCheckout({
    ...checkout,
    products: subtractOrderLines(checkout?.products ?? [], lines),
  });
  updateNumberOfProductsInCart();
}

/** Asks the backend about the order the buyer left for, once at a time. */
export function reconcileOrderOfLastPayment(
  projectID: string,
): Promise<PendingOrderOutcome | undefined> {
  reconciling ??= reconcilePendingOrder({
    projectId: projectID,
    fetchStatus: askAboutOrder,
    removeLines: removeOrderLinesFromCart,
  })
    .catch((e) => {
      console.warn("cannot check the pending order", e);
      return undefined;
    })
    .finally(() => {
      reconciling = undefined;
    });
  return reconciling;
}

// @ts-ignore
const getProducts: (
  projectID: string,
  args?: { items?: CheckoutProduct[]; locale?: string },
) => Promise<
  | Err
  | {
      id: string;
      productID: string;
      quantity: number;
      metadata?: { [key: string]: string | undefined };
      url?: string;
      details?: SingleProduct;
      /** The catalog product, when `productID` is one of its variants. */
      catalogProductID?: string;
    }[]
> = async (
  projectID: string,
  args?: { items?: CheckoutProduct[]; locale?: string },
) => {
  let products: CheckoutProduct[] = [];

  if (args?.items != null && args.items.length > 0) {
    products = args.items;
  } else {
    products = getCheckout()?.products ?? [];
  }

  const productIds = Array.from(
    new Set(products.map((product) => product.productID)),
  );

  if (productIds.length === 0) {
    return [];
  }

  const params = new URLSearchParams();
  params.set("ids", productIds.join(","));
  params.set("locale", args?.locale ?? getLocale());

  let payload: {
    success: boolean;
    message?: string | undefined;
    result?: SingleProduct[] | undefined;
  };
  try {
    const result = await fetch(
      withClientParam(buildURL(projectID, `/products?${params.toString()}`)),
      {
        method: "GET",
      },
    );

    // A backend failure is not an empty cart.
    if (result.status != 200) {
      return Err("products-load-failed", "internal");
    }

    payload = await result.json();
  } catch (e) {
    console.warn("cannot load the products of the cart", e);
    return Err("products-load-failed", "internal");
  }

  // Items the backend does not know (removed product, wrong id) are dropped.
  return products.flatMap((product) => {
    const details = findProductForCartItem(product.productID, payload.result);
    if (details == null) {
      return [];
    }
    return [
      {
        ...product,
        details: resolveProductDetailsFromSingleProduct(
          product.productID,
          details,
        ),
        catalogProductID: details.id,
      },
    ];
  });
};

export const useCartProvider = () => {
  const context = useContext(CartProviderContext);

  if (context === undefined) {
    throw new Error("useCartProvider must be used within a CartProvider");
  }

  return context;
};

export default CartProvider;

const googlePayConfigSchema = zod.object({
  isAvailable: zod.boolean(),
  merchantId: zod.string(),
  merchantName: zod.string(),
  gateway: zod.string(),
  gatewayId: zod.string(),
});
const checkoutProduct = zod.object({
  id: zod.string(),
  productID: zod.string(),
  quantity: zod.number(),
  priceVersion: zod.string().optional(),
  metadata: zod.record(zod.string(), zod.string().optional()).optional(),
  url: zod.string().optional(),
});
type CheckoutProduct = zod.infer<typeof checkoutProduct>;
const checkoutSchema = zod.object({
  country: zod.string().optional(),
  couponCode: zod.string().optional(),
  selectedDeliveryMethod: zod.string().optional(),
  postalCode: zod.string().optional(),
  email: zod.string().optional(),
  products: zod.array(checkoutProduct).optional(),
  googlePayConfig: googlePayConfigSchema.optional(),
});
export type GooglePayConfig = zod.infer<typeof googlePayConfigSchema>;
const emptyCheckout: Checkout = {
  country: undefined,
  couponCode: undefined,
  email: undefined,
  selectedDeliveryMethod: undefined,
  postalCode: undefined,
  products: [],
  googlePayConfig: undefined,
};
export type Checkout = zod.infer<typeof checkoutSchema>;

const checkoutKey = "checkout";

function getCheckout(): Checkout {
  try {
    const value = localStorage.getItem(checkoutKey);
    if (value == null) {
      return emptyCheckout;
    }
    return checkoutSchema.parse(JSON.parse(value));
  } catch (e) {
    return emptyCheckout;
  }
}

async function addProducts(projectID: string, products: CartProduct[]) {
  const latestProducts = await getProducts(projectID, {
    items: products.map((item, index) => ({ ...item, id: `price-check-${index}` })),
  });
  if (isErr(latestProducts)) return latestProducts;
  const missingIDs = findMissingProductIDs(
    products.map((el) => el.productID),
    latestProducts,
  );
  if (missingIDs.length > 0) {
    return Err("item-ids-not-found", "notFound", missingIDs);
  }

  const checkout = getCheckout();
  if (checkout.products == null) {
    checkout.products = [];
  }
  checkout.products.push(
    ...products.map((el) => ({
      id: Math.random().toString(36).substring(7),
      productID: el.productID,
      quantity: el.quantity,
      priceVersion: latestProducts.find((product) => product.productID === el.productID)?.details?.pricing?.priceVersion,
      metadata: el.metadata,
      url: cartItemURL(
        el.url,
        typeof window !== "undefined" ? window.location.href : undefined,
      ),
    })),
  );
  trackCartAdd(products, latestProducts);
  sendAnalyticEvent({
    event: "addToCart",
    currency: "PLN",
    items: products.map((el) => ({
      id: el.productID,
      name: el.name ?? "",
      price: el.price ?? 0,
      quantity: el.quantity,
      currency: el.currency ?? "PLN",
    })),
  });
  saveCheckout(checkout);
  updateNumberOfProductsInCart();
  return undefined;
}

/** `add_to_cart` per added line, priced by the backend's answer. */
function trackCartAdd(
  added: CartProduct[],
  latest: { productID: string; details?: SingleProduct; catalogProductID?: string }[],
) {
  for (const item of added) {
    try {
      const found = latest.find((el) => el.productID === item.productID);
      const price = found?.details?.pricing?.effectivePrice ?? found?.details?.price ?? item.price;
      const currency = found?.details?.currency ?? item.currency;
      if (price == null || currency == null) continue;
      const productID = found?.catalogProductID ?? item.productID;
      (item.analytics ?? getCartInstrument()).track(
        "add_to_cart",
        { qty: item.quantity, value_minor: Math.round(price * item.quantity), currency },
        { product_id: productID, variant_id: productID !== item.productID ? item.productID : null },
      );
    } catch {}
  }
}

function removeProductFromCheckout(ids: string[]) {
  const checkout = getCheckout();
  const newCheckout = {
    ...checkout,
    products: checkout?.products?.filter(
      (product) =>
        !ids.includes(product.productID) && !ids.includes(product.id),
    ),
  };
  sendAnalyticEvent({
    event: "removeFromCart",
    items: ids.map((id) => ({
      id: id,
      name: "",
      price: 0,
      quantity: 1,
      currency: "PLN",
    })),
  });
  saveCheckout(newCheckout);
  updateNumberOfProductsInCart();
}

function saveCheckout(model: Checkout) {
  localStorage.setItem(checkoutKey, JSON.stringify(model));
}

/** The `/buy` body of the cart (also sent to `payment-methods`); `undefined` when it is empty. */
function cartLinkRequest(
  checkout: Checkout,
  locale: string,
): LinkRequest | undefined {
  if (checkout.products == null || checkout.products.length == 0) {
    return undefined;
  }
  const mergedMetadata = checkout.products.reduce(
    (acc, product) => {
      if (product.metadata != null) {
        Object.keys(product.metadata).forEach((key) => {
          const value = product.metadata?.[key];
          if (value != null) {
            acc[key] = value;
          }
        });
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  return {
    items: checkout.products.map((el) => {
      return {
        id: el.productID,
        quantity: el.quantity,
        priceVersion: el.priceVersion,
      };
    }),
    askForNote: true,
    countries: checkout.country ? [checkout.country] : undefined,
    metadata: mergedMetadata,
    locale,
  };
}

export const getCheckoutMethods: (
  projectID: string,
  locale?: string,
  texts?: Partial<CheckoutTexts>,
) => CartMethods = (projectID, locale = getLocale(), texts) => {
  const newHost = getNewHostIfExist();
  if (newHost != null) {
    setCustomHost(newHost);
  }
  return {
    async checkIfApplePayIsAvailable(): Promise<boolean> {
      if (typeof window == "undefined" || typeof document == "undefined") {
        return false;
      }
      if ("ApplePaySession" in window === false) {
        return false;
      }

      try {
        const result = await PublicApiClient.get(
          HOST,
        ).isOneClickPaymentAvailable({
          projectId: projectID,
        });

        return result.applePay;
      } catch (e) {
        console.error("Error checking if Apple Pay is available", e);
        return false;
      }
    },
    async getGooglePayConfiguration(args: { items: CartProduct[] }): Promise<
      | {
          isAvailable: true;
          config: google.payments.api.PaymentDataRequest;
        }
      | {
          isAvailable: false;
        }
    > {
      if (typeof window == "undefined" || typeof document == "undefined") {
        return {
          isAvailable: false,
        };
      }

      try {
        const googlePayConfig = await resolveGooglePayConfiguration(projectID);
        if (googlePayConfig?.isAvailable != true) {
          return {
            isAvailable: false,
          };
        }

        const checkout = getCheckout();
        if (checkout == null) {
          console.log("checkout is null");
          return {
            isAvailable: false,
          };
        }

        const products = await getProducts(projectID, {
          locale,
          items: args.items.map((el) => {
            return {
              id: Math.random().toString(36).substring(7),
              quantity: el.quantity,
              metadata: el.metadata,
              productID: el.productID,
            };
          }),
        });

        if (isErr(products)) {
          return {
            isAvailable: false,
          };
        }
        const result = await PublicApiClient.get(HOST).getPreOrderDetails({
          items: products.map((el) =>
            create(PreOrderItemSchema, {
              id: el.productID,
              quantity: el.quantity,
            }),
          ),
          projectId: projectID,
          // we can detect 5 the closest inpost pickup point based on shipping address.
          postCode: checkout.postalCode,
          couponCode: checkout.couponCode,
          countryCode: checkout.country,
          selectedDeliveryMethod: checkout.selectedDeliveryMethod,
        });
        if (result.totalAmount == null) {
          return {
            isAvailable: false,
          };
        }
        const cartRequiresShipping =
          products.find((el) => el.details?.isDeliverable == true) != null;

        const mappedPaymentRequest = await mapGooglePayConfiguration({
          items: products,
          googlePayConfig: googlePayConfig,
          checkout: checkout,
          cartRequiresShipping: cartRequiresShipping,
          result: result,
          locale,
          texts,
        });
        if (mappedPaymentRequest == null) {
          return {
            isAvailable: false,
          };
        }

        return {
          isAvailable: true,
          config: mappedPaymentRequest,
        };
      } catch (e) {
        console.error("Error resolving Google Pay configuration", e);
        return {
          isAvailable: false,
        };
      }
    },
    async clearCart(): Promise<Err | void> {
      const empty = structuredClone(emptyCheckout);
      empty.country = getCheckout()?.country;
      saveCheckout(empty);
      updateNumberOfProductsInCart();
    },

    async getAvailableCountries(): Promise<
      Err | { name: string; code: string }[]
    > {
      const result = await fetch(
        withClientParam(buildURL(projectID, "/countries")),
        {
          method: "GET",
        },
      );

      if (result.status != 200) {
        return [];
      }

      try {
        return zod
          .array(
            zod.object({
              name: zod.string(),
              code: zod.string(),
            }),
          )
          .parse(await result.json());
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        return Err(e.toString(), "internal");
      }
    },

    async getCountry(): Promise<Err | string> {
      let country = getCheckout()?.country;
      if (country == null) {
        country = "PL";
        const checkout = getCheckout();
        checkout.country = country;
        saveCheckout(checkout);
      }

      return country;
    },

    async getNumberOfElementsInCart(): Promise<number> {
      return (
        getCheckout()?.products?.reduce(
          (acc, product) => acc + product.quantity,
          0,
        ) ?? 0
      );
    },

    async getProducts(): Promise<
      | Err
      | {
          id: string;
          productID: string;
          quantity: number;
          metadata?: {
            [p: string]: string | undefined;
          };
          details?: SingleProduct;
          catalogProductID?: string;
        }[]
    > {
      return await getProducts(projectID, { locale });
    },

    async removeProductFromCart(args: { id: string }): Promise<Err | void> {
      return removeProductFromCheckout([args.id]);
    },

    async setCountry(country: string): Promise<Err | void> {
      const checkout = getCheckout();
      checkout.country = country;
      saveCheckout(checkout);
    },

    async setCouponCodeIfPossible(couponCode?: string): Promise<Err | void> {
      const checkout = getCheckout();
      checkout.couponCode = couponCode;
      saveCheckout(checkout);
    },

    async setPostalCode(postalCode?: string): Promise<Err | void> {
      const checkout = getCheckout();
      checkout.postalCode = postalCode;
      saveCheckout(checkout);
    },

    async setDeliveryMethod(deliveryMethod?: string): Promise<Err | void> {
      const checkout = getCheckout();
      checkout.selectedDeliveryMethod = deliveryMethod;
      saveCheckout(checkout);
    },

    async setEmail(email?: string): Promise<Err | void> {
      const checkout = getCheckout();
      checkout.email = email;
      saveCheckout(checkout);
    },

    async addProduct(args: CartProduct): Promise<Err | void> {
      return await addProducts(projectID, [args]);
    },

    async updateQuantity(args: {
      id: string;
      quantity: number;
    }): Promise<Err | void> {
      const checkout = getCheckout();
      checkout.products = checkout.products?.map((product) => {
        if (product.id === args.id) {
          product.quantity = args.quantity;
        }
        return product;
      });
      saveCheckout(checkout);
      updateNumberOfProductsInCart();
    },

    async getPaymentMethodChoice(): Promise<PaymentMethodChoice | null> {
      const payload = cartLinkRequest(getCheckout(), locale);
      return payload == null ? null : getPaymentMethodChoice(payload);
    },

    async redirectToNextStep(args?: {
      paymentMethod?: PaymentMethod;
    }): Promise<Err | { url: string; orderId?: string; projectId?: string }> {
      const payload = cartLinkRequest(getCheckout(), locale);
      if (payload == null) {
        return Err("cart-is-empty", "badInput");
      }
      if (args?.paymentMethod != null) {
        payload.paymentMethod = args.paymentMethod;
      }

      const paymentResponse = await createPaymentURL(payload);

      if (isErr(paymentResponse)) {
        console.warn("cannot create payment URL", paymentResponse.error);
        return paymentResponse;
      }

      return {
        url: paymentResponse.url,
        ...(paymentResponse.orderId != null
          ? { orderId: paymentResponse.orderId }
          : {}),
        ...(paymentResponse.projectId != null
          ? { projectId: paymentResponse.projectId }
          : {}),
      };
    },

    async justRedirectToPayment(args: {
      email?: string;
      productID: string;
      name?: string;
      country?: string;
      marketingAgreement?: boolean;
      locale?: string;
    }): Promise<Err | { url: string }> {
      let payload: LinkRequest = {
        items: [
          {
            id: args.productID,
            quantity: 1,
          },
        ],
        askForNote: false,
        details:
          args.email || args.name
            ? {
                name: args.name,
                email: args.email,
              }
            : undefined,
        locale: args.locale ?? locale,
      };

      payload = injectReferenceToRequestIfNeeded(payload);

      if (args.country == null) {
        args.country = "pl";
      }

      if (payload.details == null) {
        payload.details = {};
      }
      if (payload.details.address == null) {
        payload.details.address = {};
      }
      payload.details.address.country = args.country;

      if (args.marketingAgreement === true) {
        payload.additionalAgreements = [
          {
            id: MARKETING_AGREEMENT_ID,
            name: "",
            required: true,
            answer: true,
          },
        ];
      }

      const result = await createPaymentURL(payload);

      if (isErr(result)) {
        return result;
      } else {
        return {
          url: result.url,
        };
      }
    },

    async getApplePayPreview(args: {
      items: CartProduct[];
    }): Promise<
      | Err
      | { countryCode: string; currencyCode: string; totalAmount: string }
    > {
      const checkout = getCheckout();
      try {
        const result = await PublicApiClient.get(HOST).getPreOrderDetails({
          items: args.items.map((el) =>
            create(PreOrderItemSchema, {
              id: el.productID,
              quantity: el.quantity,
            }),
          ),
          projectId: projectID,
          postCode: checkout.postalCode,
          couponCode: checkout.couponCode,
          countryCode: checkout.country,
          selectedDeliveryMethod: checkout.selectedDeliveryMethod,
        });
        if (result.totalAmount == null || result.currency.length === 0) {
          return Err("pre-order-unavailable", "internal");
        }
        return {
          countryCode: result.country || checkout.country || "PL",
          currencyCode: result.currency,
          totalAmount: `${round(result.totalAmount / 100, 2)}`,
        };
      } catch (e) {
        console.warn("cannot load the Apple Pay preview", e);
        return Err("pre-order-unavailable", "internal");
      }
    },

    async completeApplePayPayment(args: {
      token: ApplePayJS.ApplePayPaymentToken;
      shippingContact?: ApplePayJS.ApplePayPaymentContact;
      billingContact?: ApplePayJS.ApplePayPaymentContact;
    }): Promise<
      | Err
      | {
          isSuccess: boolean;
          redirectURL?: string;
        }
    > {
      const checkout = getCheckout();
      if (checkout == null) {
        return Err("Checkout not found");
      }

      const products = await getProducts(projectID, { locale });

      if (isErr(products)) {
        return products;
      }

      try {
        let shippingName = args.shippingContact?.givenName;
        if (args.shippingContact?.familyName != null) {
          shippingName += " " + args.shippingContact?.familyName;
        } else if (args.billingContact?.familyName != null) {
          shippingName += " " + args.billingContact?.familyName;
        }

        let metadata: Record<string, string> = {};

        const ref = getReferenceIfPossible();
        if (ref != null) {
          metadata["ref"] = ref;
        }

        const result = await PublicApiClient.get(HOST).authorizeOneClickPayment(
          {
            gateway: OneClickAuthorizePaymentRequest_Gateway.APPLE_PAY,
            paymentData: JSON.stringify(args.token.paymentData),
            paymentMethod: JSON.stringify(args.token.paymentMethod),
            transactionIdentifier: args.token.transactionIdentifier,
            order: create(GetPreOrderDetailsRequestSchema, {
              items: products.map((el) => ({
                id: el.productID,
                quantity: el.quantity,
              })),
              couponCode: checkout.couponCode,
              email:
                args.shippingContact?.emailAddress ??
                args.billingContact?.emailAddress ??
                checkout.email ??
                undefined,
              phone:
                args.shippingContact?.phoneNumber ??
                args.billingContact?.phoneNumber ??
                undefined,
              selectedDeliveryMethod: checkout.selectedDeliveryMethod,
              postCode: checkout.postalCode,
              projectId: projectID,
            }),
            shippingAddress: create(AddressSchema, {
              line1: args.shippingContact?.addressLines?.[0] ?? "",
              city: args.shippingContact?.locality ?? "",
              country: args.shippingContact?.countryCode ?? "",
              zipCode: args.shippingContact?.postalCode ?? "",
              name: shippingName,
            }),
            billingAddress: create(BillingAddressSchema, {
              name:
                args.billingContact?.givenName ??
                "" + " " + (args.billingContact?.familyName ?? ""),
              line1: args.billingContact?.addressLines?.[0] ?? "",
              city: args.billingContact?.locality ?? "",
              country: args.billingContact?.countryCode ?? "",
              zipCode: args.billingContact?.postalCode ?? "",
            }),
            metadata:
              Object.keys(metadata).length > 0
                ? JSON.stringify(metadata)
                : undefined,
          },
        );

        return {
          isSuccess: result.isSuccess,
          redirectURL: result.redirectUrl,
        };
      } catch (error) {
        console.error(error);
        return Err("Failed to authorize payment");
      }
    },

    async completeGooglePayPayment(args: {
      paymentData: google.payments.api.PaymentData;
    }): Promise<
      | Err
      | {
          isSuccess: boolean;
          redirectURL?: string;
        }
    > {
      const checkout = getCheckout();
      if (checkout == null) {
        return Err("Checkout not found");
      }

      const products = await getProducts(projectID, { locale });

      if (isErr(products)) {
        return products;
      }

      try {
        let shippingName = args.paymentData.shippingAddress?.name;

        let metadata: Record<string, string> = {};

        const ref = getReferenceIfPossible();
        if (ref != null) {
          metadata["ref"] = ref;
        }

        const result = await PublicApiClient.get(HOST).authorizeOneClickPayment(
          {
            gateway: OneClickAuthorizePaymentRequest_Gateway.GOOGLE_PAY,
            paymentData:
              args.paymentData.paymentMethodData.tokenizationData.token,
            paymentMethod: args.paymentData.paymentMethodData.type,
            transactionIdentifier: "",
            order: create(GetPreOrderDetailsRequestSchema, {
              items: products.map((el) => ({
                id: el.productID,
                quantity: el.quantity,
              })),
              couponCode: checkout.couponCode,
              email: args.paymentData.email ?? undefined,
              phone: args.paymentData.shippingAddress?.phoneNumber ?? undefined,
              selectedDeliveryMethod:
                args.paymentData.shippingOptionData?.id ??
                checkout.selectedDeliveryMethod,
              postCode: args.paymentData.shippingAddress?.postalCode,
              projectId: projectID,
            }),
            shippingAddress: create(AddressSchema, {
              line1: args.paymentData.shippingAddress?.address1 ?? "",
              city: args.paymentData.shippingAddress?.locality ?? "",
              country: args.paymentData.shippingAddress?.countryCode ?? "",
              zipCode: args.paymentData.shippingAddress?.postalCode ?? "",
              name: shippingName,
            }),
            billingAddress: create(BillingAddressSchema, {
              name: args.paymentData.paymentMethodData.info?.billingAddress
                ?.name,
              line1:
                args.paymentData.paymentMethodData.info?.billingAddress
                  ?.address1 ?? "",
              city:
                args.paymentData.paymentMethodData.info?.billingAddress
                  ?.locality ?? "",
              country:
                args.paymentData.paymentMethodData.info?.billingAddress
                  ?.countryCode ?? "",
              zipCode:
                args.paymentData.paymentMethodData.info?.billingAddress
                  ?.postalCode ?? "",
            }),
            metadata:
              Object.keys(metadata).length > 0
                ? JSON.stringify(metadata)
                : undefined,
          },
        );

        return {
          isSuccess: result.isSuccess,
          redirectURL: result.redirectUrl,
        };
      } catch (error) {
        console.error(error);
        return Err("Failed to authorize payment");
      }

      return {
        isSuccess: true,
      };
    },

    async getApplePayPaymentRequest(args?: {
      expectedItems?: CartProduct[];
    }): Promise<Err | ApplePayJS.ApplePayPaymentRequest> {
      const checkout = getCheckout();
      if (checkout == null) {
        return Err("Checkout not found");
      }
      if (args && args.expectedItems != null && args.expectedItems.length > 0) {
        if (checkout.products) {
          removeProductFromCheckout(
            checkout.products.map((el) => el.productID),
          );
        }
        await addProducts(projectID, args.expectedItems);
      }

      const products = await getProducts(projectID, { locale });

      if (isErr(products)) {
        return products;
      }

      const result = await PublicApiClient.get(HOST).getPreOrderDetails({
        items: products.map((el) =>
          create(PreOrderItemSchema, {
            id: el.productID,
            quantity: el.quantity,
          }),
        ),
        projectId: projectID,
        // we can detect 5 the closest inpost pickup point based on shipping address.
        postCode: checkout.postalCode,
        couponCode: checkout.couponCode,
        countryCode: checkout.country,
        selectedDeliveryMethod: checkout.selectedDeliveryMethod,
      });

      const items = products.map((el) => {
        return {
          amount: `${round(
            (el.quantity *
              (el.details?.pricing?.effectivePrice ?? el.details?.price ?? 0)) /
              100,
            2,
          )}`,
          label: el.details?.name + " - " + el.quantity,
          type: "final" as ApplePayJS.ApplePayLineItemType,
        };
      });

      if (result.selectedDeliveryMethod != null) {
        const deliveryMethod = result.methods.find(
          (el) => el.id == result.selectedDeliveryMethod,
        );
        if (deliveryMethod != null) {
          items.push({
            amount: `${round(deliveryMethod.amount / 100, 2)}`,
            label: deliveryMethod.name,
            type: "final" as ApplePayJS.ApplePayLineItemType,
          });
        }
      }

      if (result.couponCode != null && result.couponValue != null) {
        items.push({
          amount: `-${round(result.couponValue / 100, 2)}`,
          label: result.couponCode,
          type: "final" as ApplePayJS.ApplePayLineItemType,
        });
      }

      return {
        countryCode: result.country || checkout.country || "PL",
        merchantCapabilities: [
          "supports3DS",
          "supportsCredit",
          "supportsDebit",
        ],
        supportedNetworks: ["visa", "masterCard"],
        total: {
          amount: `${round((result.totalAmount ?? 0) / 100, 2)}`,
          label: getCheckoutText("paymentForCart", locale, texts),
          type: "final",
        },
        shippingMethods: result.methods.map((el) => ({
          amount: `${round(el.amount / 100, 2)}`,
          detail: el.description ?? "",
          identifier: el.id,
          label: el.name,
          dateComponentsRange: {
            startDateComponents: {
              days: el.minDays ?? 1,
              hours: 0,
              months: 0,
              years: 0,
            } satisfies ApplePayJS.ApplePayDateComponents,
            endDateComponents: {
              days: el.maxDays ?? 14,
              hours: 0,
              months: 0,
              years: 0,
            } satisfies ApplePayJS.ApplePayDateComponents,
          },
        })),
        lineItems: items,
        currencyCode:
          result.currency || products[0]?.details?.currency || "PLN",
      };
    },
  };
};

async function resolveGooglePayConfiguration(projectID: string) {
  const checkout = getCheckout();
  if (checkout.googlePayConfig?.isAvailable != true) {
    const result = await PublicApiClient.get(HOST).isOneClickPaymentAvailable({
      projectId: projectID,
    });
    if (result.googlePay == true && result.googlePayConfig != null) {
      checkout.googlePayConfig = {
        isAvailable: true,
        gateway: result.googlePayConfig.gateway,
        gatewayId: result.googlePayConfig.gatewayMerchantId,
        merchantName: result.googlePayConfig.merchantName,
        merchantId: result.googlePayConfig.merchantId,
      };
    } else {
      checkout.googlePayConfig = {
        isAvailable: false,
        gateway: "",
        gatewayId: "",
        merchantName: "",
        merchantId: "",
      };
    }
  }
  saveCheckout(checkout);
  return checkout.googlePayConfig;
}

function resolveProductDetailsFromSingleProduct(
  id: string,
  product: SingleProduct,
) {
  if (id == product.id) {
    const variantIndex = product.variants?.findIndex((v) => v.id === id);
    if (variantIndex != null && variantIndex != -1) {
      const variant = product.variants![variantIndex];
      return {
        ...product,
        availableQuantity: variant.availableQuantity,
        isDeliverable: variant.isDeliverable,
        images: variant.images ?? product.images,
        name: product.name + " " + variant.name,
        baseName: product.name,
        variantName: variant.name,
        price: variant.price,
        currency: variant.currency,
        pricing: variant.pricing,
      };
    }
    return product;
  }

  const variant = product.variants?.find((v) => v.id === id);
  if (variant == null) {
    return product;
  }

  return {
    ...product,
    id: variant.id,
    name: product.name + " " + variant.name,
    baseName: product.name,
    variantName: variant.name,
    price: variant.price,
    currency: variant.currency,
    pricing: variant.pricing,
    metadata: product.metadata,
    availableQuantity: variant.availableQuantity,
    isDeliverable: variant.isDeliverable,
    images: variant.images ?? product.images,
  };
}

type ApplePaySessionArgs = {
  postCode?: string;
  email?: string;
  couponCode?: string;
};

function updateNumberOfProductsInCart() {
  const checkout = getCheckout();
  let numberOfProductsInCart = 0;
  if (checkout == null) {
    useCheckoutStore.setState((state) => ({
      ...state,
      numberOfProductsInCart,
    }));
    return;
  }
  numberOfProductsInCart =
    checkout.products?.reduce((acc, product) => acc + product.quantity, 0) ?? 0;
  useCheckoutStore.setState((state) => ({ ...state, numberOfProductsInCart }));
}
