/**
 * The JSON contract of the cart-aware express API of Bitsnap, as consumed by
 * this package.
 *
 * Routes (all under `<host>/api/integrations/<project>/public-commerce/express/`):
 *
 * - `POST availability` — which express providers may render for this cart,
 *   their public widget configuration and why an unavailable one is hidden.
 * - `POST cart` — create or replace the durable, server-priced cart.
 * - `POST cart-snapshot` — read the canonical cart of a token holder.
 * - `POST inpost/start`, `POST revolut/start` — bind the cart to a provider and
 *   return the public configuration the official browser widget needs.
 * - `POST revolut/status` — the server-confirmed Revolut Pay status; a browser
 *   success event never decides a payment.
 * - `POST inpost/status` — the same server-confirmed status for InPost Pay; a
 *   browser `orderCreated` event is only a hint to ask it.
 *
 * Security: no field here is a merchant API key or a webhook secret. The cart
 * capability travels in the `x-bitsnap-cart-token` header, is returned only when
 * a cart is created and is never put in a URL or in a body.
 */

/** Providers this SDK knows. Adyen keeps using the ordinary redirect checkout. */
export const EXPRESS_PROVIDERS = ["inpostPay", "revolutPay", "adyen"] as const;
export type ExpressProviderName = (typeof EXPRESS_PROVIDERS)[number];

export type CartEnvironment = "test" | "production";

/** Public availability of one express provider. */
export type ProviderAvailability = {
  available: boolean;
  environment: CartEnvironment;
  /** Safe reasons such as `provider-checkout-not-implemented`. */
  reasons: string[];
  /**
   * Public widget configuration only. InPost Pay: `merchantClientId`,
   * optionally `apiBaseUrl`. Revolut Pay: `publicKey` and `mode`.
   */
  publicConfig?: Record<string, string>;
};

export type ExpressAvailability = {
  success: true;
  environment: CartEnvironment;
  providers: Record<ExpressProviderName, ProviderAvailability>;
};

export type CartSnapshotLine = {
  lineId: string;
  /** The id the cart was uploaded with; the same id `/buy` takes. */
  productId: string;
  variantId: string;
  quantity: number;
  name: string;
  imageUrl?: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
  tax?: number;
  currency: string;
};

export type CartSnapshot = {
  cartId: string;
  revision: number;
  status: "open" | "bound" | "checkout" | "ordered" | "expired";
  environment: CartEnvironment;
  currency: string;
  locale: string;
  lines: CartSnapshotLine[];
  subtotalMinor: number;
  deliveryMinor: number;
  discountMinor: number;
  totalMinor: number;
  couponCode?: string;
  expiresAt: number;
};

/**
 * A delivery option as the backend `linkRequestSchema` takes it. `price` is in
 * major units (the backend converts it to minor units), unlike snapshot totals.
 */
export type ExpressDeliveryOption = {
  name: string;
  desc?: string;
  min: number;
  max: number;
  price: number;
};

/** The part of the SDK cart that is uploaded; item prices stay server-side. */
export type ExpressCartUpload = {
  items: { id: string; quantity: number; priceVersion?: string }[];
  countries?: string[];
  /**
   * The shop's delivery methods for this cart. Omitting them would price a
   * deliverable cart with zero shipping, so the SDK resolves them before an
   * availability call or a provider start.
   */
  delivery?: ExpressDeliveryOption[];
  deliveryMethod?: string;
  couponCode?: string;
  locale?: string;
};

/** A line both sides changed differently during a revision conflict. */
export type CartLineConflict = {
  id: string;
  /** The quantity the server last confirmed. */
  base: number;
  /** The quantity in the browser cart. */
  local: number;
  /** The quantity the canonical server cart has now. */
  server: number;
};

export type CartWriteFailureCode =
  | "invalid-request"
  | "cart-not-found"
  | "cart-forbidden"
  | "cart-locked"
  | "revision-conflict"
  | "product-not-available"
  | "currency-unsupported"
  | "internal";

export type CartWriteResult =
  | {
      ok: true;
      /** Present only when the cart was created. */
      cartToken?: string;
      snapshot: CartSnapshot;
    }
  | {
      ok: false;
      code: CartWriteFailureCode;
      message: string;
      /** Present on `revision-conflict`. */
      currentRevision?: number;
      snapshot?: CartSnapshot;
      /**
       * Lines whose local and server quantities changed differently. The SDK
       * never guesses: the cart is not uploaded until the buyer resolves them.
       */
      conflicts?: CartLineConflict[];
    };

export type StartFailureCode =
  | "not-implemented"
  | "not-configured"
  | "cart-not-found"
  | "cart-forbidden"
  | "cart-locked"
  | "invalid-cart"
  | "provider-error";

export type ProviderStart = {
  ok: true;
  provider: ExpressProviderName;
  /** Where the generic redirect checkout may navigate. */
  redirectUrl: string;
  /** Public provider order/basket id. */
  providerOrderId: string;
  publicConfig?: Record<string, string>;
  cartRevision: number;
};

export type StartFailure = {
  ok: false;
  provider: ExpressProviderName;
  code: StartFailureCode;
  message: string;
};

export type RevolutPayStatus =
  | {
      ok: true;
      status: "pending" | "completed" | "failed" | "cancelled";
      /** The Bitsnap order id once the verified webhook settled the payment. */
      orderId?: string;
    }
  | {
      ok: false;
      code: "not-implemented" | "cart-not-found" | "cart-forbidden" | "provider-error" | "network";
      message: string;
    };

/**
 * InPost Pay status has the same shape as Revolut Pay: only the server-side
 * order state (signed provider callbacks) may report `completed`. A browser
 * `orderCreated` event is only a hint to ask this endpoint.
 */
export type InpostPayStatus = RevolutPayStatus;

/** Every provider status the SDK polls; a browser callback never decides it. */
export type ExpressPayStatus = RevolutPayStatus | InpostPayStatus;

/** Every request failure of this package, including transport ones. */
export type ExpressFailureCode =
  | CartWriteFailureCode
  | StartFailureCode
  | "not-implemented"
  | "network"
  | "invalid-response";

export type ExpressResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: ExpressFailureCode;
      message: string;
      status?: number;
      /** Present on `revision-conflict`: the revision the server holds. */
      currentRevision?: number;
      /** Present on a revision conflict: the canonical server snapshot. */
      snapshot?: CartSnapshot;
      /** Present on a revision conflict: the same-item quantity conflicts. */
      conflicts?: CartLineConflict[];
    };
