import { create } from "@bufbuild/protobuf";
import { createContext, useContext } from "react";
import { QueryClient, QueryClientProvider } from "react-query";
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
import { HOST, setCustomHost } from "./constants";
import { buildURL } from "./helper.methods";
import { Err, isErr } from "./lib/err";
import { formatCurrency, round } from "./lib/round.number";
import { LinkRequest } from "./link.request.schema";
import { createPaymentURL, getReferenceIfPossible, injectReferenceToRequestIfNeeded } from "./methods";
import { SingleProduct } from "./product.details.model";
import { mapGooglePayConfiguration } from "./google.pay.mapper";

export const MARKETING_AGREEMENT_ID = "__m_a";

type CartProduct = {
  productID: string;
  quantity: number;
  metadata?: { [key: string]: string | undefined };
}

export interface CartMethods {
  checkIfApplePayIsAvailable(): Promise<boolean>;
  getGooglePayConfiguration(args: { items: CartProduct[] }): Promise<{
    isAvailable: true;
    config: google.payments.api.PaymentDataRequest;
  } | {
    isAvailable: false;
  }>;

  addProduct(args: CartProduct): Promise<Err | void>;

  getProducts: () => Promise<
    | Err
    | {
      id: string;
      productID: string;
      quantity: number;
      metadata?: { [key: string]: string | undefined };
      details?: SingleProduct;
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

  redirectToNextStep: () => Promise<Err | { url: string }>;

  getApplePayPaymentRequest: (args?: { expectedItems?: CartProduct[]; }) => Promise<
    Err | ApplePayJS.ApplePayPaymentRequest
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
    paymentData: google.payments.api.PaymentData
  }) => Promise<Err | {
    isSuccess: boolean;
    redirectURL?: string;
  }>;

  justRedirectToPayment: (args: {
    email?: string;
    productID: string;
    name?: string;
    country?: string;
    marketingAgreement?: boolean;
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
  bitsnapProjectID = projectID;
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

function getNewHostIfExist(): string | undefined {
  const me = document.querySelector(
    'script[data-id][data-name="internal-cart"]',
  );
  const customHost = me?.getAttribute("data-custom-host");
  return customHost ?? undefined;
}

const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient();

  const projectID = getProjectID();
  if (projectID == null) {
    return <></>;
  }

  const checkoutMethods = getCheckoutMethods(projectID);

  return (
    <QueryClientProvider client={queryClient}>
      <CartProviderContext.Provider value={checkoutMethods}>
        {children}
      </CartProviderContext.Provider>
    </QueryClientProvider>
  );
};

// @ts-ignore
const getProducts: (projectID: string) => Promise<
  | Err
  | {
    id: string;
    productID: string;
    quantity: number;
    metadata?: { [key: string]: string | undefined };
    details?: SingleProduct;
  }[]
> = async (projectID: string) => {
  const products = getCheckout()?.products ?? [];

  const productIds = Array.from(
    new Set(products.map((product) => product.productID)),
  );

  const params = new URLSearchParams();
  params.set("ids", productIds.join(","));

  const result = await fetch(
    buildURL(projectID, `/products?${params.toString()}`),
    {
      method: "GET",
    },
  );

  if (result.status != 200) {
    return [];
  }

  const payload: {
    success: boolean;
    message?: string | undefined;
    result?: SingleProduct[] | undefined;
  } = await result.json();

  products.forEach((product) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    product["details"] = payload.result?.find((el) => {
      if (el.id === product.productID) {
        return true;
      }
      if (el.variants != null && el.variants.length > 0) {
        const index = el.variants.findIndex(
          (variant) => variant.id === product.productID,
        );
        return index !== -1;
      }
      return false;
    });
  });

  // @ts-ignore
  return products
    .filter((el) => "details" in el)
    .map((el) => {
      el.details = resolveProductDetailsFromSingleProduct(
        el.productID,
        el.details as SingleProduct,
      );
      return el;
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
const checkoutSchema = zod.object({
  country: zod.string().optional(),
  couponCode: zod.string().optional(),
  selectedDeliveryMethod: zod.string().optional(),
  postalCode: zod.string().optional(),
  email: zod.string().optional(),
  products: zod
    .array(
      zod.object({
        id: zod.string(),
        productID: zod.string(),
        quantity: zod.number(),
        metadata: zod.record(zod.string(), zod.string().optional()).optional(),
      }),
    )
    .optional(),
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

function addProducts(products: CartProduct[]) {
  const checkout = getCheckout();
  if (checkout.products == null) {
    checkout.products = [];
  }
  checkout.products.push(...products.map(el => ({
    id: Math.random().toString(36).substring(7),
    productID: el.productID,
    quantity: el.quantity,
    metadata: el.metadata,
  })));
  saveCheckout(checkout);
}

function removeProductFromCheckout(ids: string[]) {
  const checkout = getCheckout();
  const newCheckout = {
    ...checkout,
    products: checkout?.products?.filter(
      (product) => !ids.includes(product.productID) && !ids.includes(product.id),
    ),
  };
  saveCheckout(newCheckout);
}

function saveCheckout(model: Checkout) {
  localStorage.setItem(checkoutKey, JSON.stringify(model));
}

export const getCheckoutMethods: (projectID: string) => CartMethods = (
  projectID,
) => {
  const newHost = getNewHostIfExist();
  if (newHost != null) {
    setCustomHost(newHost);
  }
  return {
    async checkIfApplePayIsAvailable(): Promise<boolean> {
      if (typeof window == "undefined" || typeof document == 'undefined') {
        return false;
      }
      if ("ApplePaySession" in window === false) {
        return false;
      }

      try {
        const result = await PublicApiClient.get(HOST).isOneClickPaymentAvailable({
          projectId: projectID,
        });

        return result.applePay;
      } catch (e) {
        console.error("Error checking if Apple Pay is available", e);
        return false;
      }
    },
    async getGooglePayConfiguration(args: { items: CartProduct[] }): Promise<{
      isAvailable: true;
      config: google.payments.api.PaymentDataRequest;
    } | {
      isAvailable: false;
    }> {
      if (typeof window == "undefined" || typeof document == 'undefined') {
        return {
          isAvailable: false,
        }
      }

      try {
        const googlePayConfig = await resolveGooglePayConfiguration(projectID);
        if (googlePayConfig?.isAvailable != true) {
          return {
            isAvailable: false,
          }
        }

        const checkout = getCheckout();
        if (checkout == null) {
          console.log('checkout is null');
          return {
            isAvailable: false,
          }
        }
        if (args && args.items != null && args.items.length > 0) {
          if (checkout.products) {
            removeProductFromCheckout(checkout.products.map(el => el.productID));
          }
          addProducts(args.items);
        }

        const products = await getProducts(projectID);

        if (isErr(products)) {
          return {
            isAvailable: false,
          };
        }
        const result = await PublicApiClient.get(HOST).getPreOrderDetails({
          items: products.map((el) =>
            create(PreOrderItemSchema, { id: el.productID, quantity: el.quantity }),
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
          }
        }
        const cartRequiresShipping = products.find(el => el.details?.isDeliverable == true) != null;

        const mappedPaymentRequest = await mapGooglePayConfiguration({
          items: products,
          googlePayConfig: googlePayConfig,
          checkout: checkout,
          cartRequiresShipping: cartRequiresShipping,
          result: result,
        });
        if (mappedPaymentRequest == null) {
          return {
            isAvailable: false,
          }
        }

        return {
          isAvailable: true,
          config: mappedPaymentRequest,
        }
      } catch (e) {
        console.error("Error resolving Google Pay configuration", e);
        return {
          isAvailable: false,
        }
      }
    },
    async clearCart(): Promise<Err | void> {
      const empty = structuredClone(emptyCheckout);
      empty.country = getCheckout()?.country;
      saveCheckout(empty);
    },

    async getAvailableCountries(): Promise<
      Err | { name: string; code: string }[]
    > {
      const result = await fetch(buildURL(projectID, "/countries"), {
        method: "GET",
      });

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
          [p: string]: string | undefined
        };
        details?: SingleProduct;
      }[]
    > {
      return await getProducts(projectID);
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
      return addProducts([args]);
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
    },

    async redirectToNextStep(): Promise<Err | { url: string }> {
      const checkout = getCheckout();

      if (checkout.products == null || checkout.products.length == 0) {
        return Err("cart-is-empty", "badInput");
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

      const payload: LinkRequest = {
        items: checkout.products.map((el) => {
          return {
            id: el.productID,
            quantity: el.quantity,
          };
        }),
        askForNote: true,
        countries: checkout.country ? [checkout.country] : undefined,
        metadata: mergedMetadata,
      };

      const paymentResponse = await createPaymentURL(payload);

      if (isErr(paymentResponse)) {
        console.warn("cannot create payment URL", paymentResponse.error);
        return paymentResponse;
      }

      return {
        url: paymentResponse.url,
      };
    },

    async justRedirectToPayment(args: {
      email?: string;
      productID: string;
      name?: string;
      country?: string;
      marketingAgreement?: boolean;
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

      const result = await fetch(buildURL(projectID, "/buy"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      console.log("CODE", result.status);

      if (result.status != 200) {
        console.warn(
          "result",
          await result.text(),
          result.status,
          result.statusText,
        );
        return Err("internal-error", "internal");
      }

      const response: { url: string; sessionID: string } = await result.json();

      console.log(response.url);
      return {
        url: response.url,
      };
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

      const products = await getProducts(projectID);

      if (isErr(products)) {
        return products;
      }

      try {
        let shippingName = args.shippingContact?.givenName;
        if (args.shippingContact?.familyName != null) {
          shippingName += ' ' + args.shippingContact?.familyName;
        } else if (args.billingContact?.familyName != null) {
          shippingName += ' ' + args.billingContact?.familyName;
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
              email: args.shippingContact?.emailAddress ?? args.billingContact?.emailAddress ?? checkout.email ?? undefined,
              phone: args.shippingContact?.phoneNumber ?? args.billingContact?.phoneNumber ?? undefined,
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
              name: args.billingContact?.givenName ?? '' + ' ' + (args.billingContact?.familyName ?? ''),
              line1: args.billingContact?.addressLines?.[0] ?? "",
              city: args.billingContact?.locality ?? "",
              country: args.billingContact?.countryCode ?? "",
              zipCode: args.billingContact?.postalCode ?? "",
            }),
            metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined,
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
      paymentData: google.payments.api.PaymentData
    }): Promise<Err | {
      isSuccess: boolean;
      redirectURL?: string;
    }> {
      const checkout = getCheckout();
      if (checkout == null) {
        return Err("Checkout not found");
      }

      const products = await getProducts(projectID);

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
            paymentData: args.paymentData.paymentMethodData.tokenizationData.token,
            paymentMethod: args.paymentData.paymentMethodData.type,
            transactionIdentifier: '',
            order: create(GetPreOrderDetailsRequestSchema, {
              items: products.map((el) => ({
                id: el.productID,
                quantity: el.quantity,
              })),
              couponCode: checkout.couponCode,
              email: args.paymentData.email ?? undefined,
              phone: args.paymentData.shippingAddress?.phoneNumber ?? undefined,
              selectedDeliveryMethod: args.paymentData.shippingOptionData?.id ?? checkout.selectedDeliveryMethod,
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
              name: args.paymentData.paymentMethodData.info?.billingAddress?.name,
              line1: args.paymentData.paymentMethodData.info?.billingAddress?.address1 ?? "",
              city: args.paymentData.paymentMethodData.info?.billingAddress?.locality ?? "",
              country: args.paymentData.paymentMethodData.info?.billingAddress?.countryCode ?? "",
              zipCode: args.paymentData.paymentMethodData.info?.billingAddress?.postalCode ?? "",
            }),
            metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined,
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
      }
    },

    async getApplePayPaymentRequest(args?: { expectedItems?: CartProduct[]; }): Promise<
      Err | ApplePayJS.ApplePayPaymentRequest
    > {
      const checkout = getCheckout();
      if (checkout == null) {
        return Err("Checkout not found");
      }
      if (args && args.expectedItems != null && args.expectedItems.length > 0) {
        if (checkout.products) {
          removeProductFromCheckout(checkout.products.map(el => el.productID));
        }
        addProducts(args.expectedItems);
      }

      const products = await getProducts(projectID);

      if (isErr(products)) {
        return products;
      }

      const result = await PublicApiClient.get(HOST).getPreOrderDetails({
        items: products.map((el) =>
          create(PreOrderItemSchema, { id: el.productID, quantity: el.quantity }),
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
          amount: `${round((el.quantity * (el.details?.price ?? 0)) / 100, 2)}`,
          label: el.details?.name + " - " + el.quantity,
          type: "final" as ApplePayJS.ApplePayLineItemType,
        };
      });

      if (result.selectedDeliveryMethod != null) {
        const deliveryMethod = result.methods.find(el => el.id == result.selectedDeliveryMethod);
        if (deliveryMethod != null) {
          items.push({
            amount: `${round(deliveryMethod.amount / 100, 2)}`,
            label: deliveryMethod.name,
            type: "final" as ApplePayJS.ApplePayLineItemType,
          })
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
        countryCode: checkout.country ?? "PL",
        merchantCapabilities: [
          "supports3DS",
          "supportsCredit",
          "supportsDebit",
        ],
        supportedNetworks: ["visa", "masterCard"],
        total: {
          amount: `${round(((result.totalAmount ?? 0) / 100), 2)}`,
          label: "Płatność za koszyk",
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
        currencyCode: "PLN",
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
      }
    } else {
      checkout.googlePayConfig = {
        isAvailable: false,
        gateway: '',
        gatewayId: '',
        merchantName: '',
        merchantId: '',
      }
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
        price: variant.price,
        currency: variant.currency
      }
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
    price: variant.price,
    currency: variant.currency,
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
