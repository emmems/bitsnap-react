import type { Instrument } from "@/src/analytics/instrument";
import { visitorHeaders } from "@/src/analytics/core";
import { clientHeaders } from "@/src/lib/client-header";
import { getCheckoutMethods, getLocale, getProjectID } from "./CartProvider";
import { HOST } from "./constants";
import { buyErrorFromResponse } from "./buy-error";
import { buildURL } from "./helper.methods";
import { Err } from "./lib/err";
import { LinkRequest } from "./link.request.schema";
import {
  fetchPaymentMethodChoice,
  type PaymentMethodChoice,
} from "./payment-method";
import { useCheckoutStore } from "./state";

export namespace Bitsnap {
  /**
   * Adds a product or variant to the cart. Returns an `Err` instead of adding
   * anything when the backend does not know the id
   * (`item-ids-not-found`, with the unknown ids in `data`).
   *
   * `args.url` is the product page: the cart links the item's image and name
   * to it. A relative URL is resolved against the current page; only `http`
   * and `https` links are kept.
   */
  export async function addProductToCart(
    id: string,
    quantity: number = 1,
    metadata?: Record<string, string | undefined>,
    // Those fields are used to send the price and currency to the analytics
    args?: {
      /** Product page the cart item links to. */
      url?: string;
      name?: string;
      price?: number;
      currency?: string;
      /** Where `add_to_cart` is reported. Defaults to the mounted `<BitsnapCheckout>`. */
      analytics?: Instrument;
    },
  ) {
    const projectID = getProjectID();
    if (projectID == null) {
      throw new Error("No project ID found");
    }

    const methods = getCheckoutMethods(projectID);

    const err = await methods.addProduct({
      productID: id,
      quantity: quantity,
      metadata: metadata,
      ...args,
    });
    if (err != null) {
      return err;
    }

    return undefined;
  }

  export function showCart() {
    useCheckoutStore.setState({ isCartVisible: true });
  }

  export function hideCart() {
    useCheckoutStore.setState({ isCartVisible: false });
  }
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/** Headers and body of a cart request, as `/buy` and `/payment-methods` send them. */
function cartRequestInit(projectID: string, request: LinkRequest) {
  request = injectReferenceToRequestIfNeeded(request);
  request.locale ??= getLocale();
  return {
    headers: {
      ...clientHeaders,
      ...visitorHeaders(projectID),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  };
}

/**
 * Whether the buyer may choose between paying online, paying the seller by
 * transfer / BLIK to a phone number and paying on delivery, for the cart
 * `/buy` would get. `null`
 * means nothing to choose, also when the request fails.
 */
export async function getPaymentMethodChoice(
  request: LinkRequest,
): Promise<PaymentMethodChoice | null> {
  const projectID = getProjectID();
  if (projectID == null) {
    return null;
  }
  return fetchPaymentMethodChoice(
    buildURL(projectID, "/payment-methods"),
    cartRequestInit(projectID, request),
  );
}

export async function createPaymentURL(request: LinkRequest) {
  const projectID = getProjectID();
  if (projectID == null) {
    throw new Error("No project ID found");
  }

  const result = await fetch(buildURL(projectID, "/buy"), {
    method: "POST",
    ...cartRequestInit(projectID, request),
  });

  if (result.status != 200) {
    const err = buyErrorFromResponse(result.status, await readBody(result));
    console.warn("cannot create payment URL", result.status, err.error);
    return err;
  }

  const response: {
    url: string;
    sessionID: string;
    orderId?: string;
    projectId?: string;
  } = await result.json();

  return {
    url: response.url,
    ...(response.orderId != null ? { orderId: response.orderId } : {}),
    ...(response.projectId != null ? { projectId: response.projectId } : {}),
  };
}

/**
 * What `createCheckout` resolves to. A failed response is an `Err` that also
 * has `status: "error"`, so `result.status === "ok"` narrows to the success.
 */
export type CreateCheckoutResult =
  | { status: "ok"; redirectURL: string }
  | (Err & { status: "error" });

/**
 * Creates a checkout link.
 *
 * @warning SERVER-SIDE ONLY. When `apiKey` is set, this sends it as an
 * `Authorization: Bearer` header to the Bitsnap API. Calling it from a client
 * component, browser bundle, island or any code shipped to the browser exposes
 * the project API key to every visitor and to anyone reading the bundle or its
 * source maps. Use it only in a server route, server action or backend module
 * that reads the key from a server-only environment variable.
 *
 * The safe default is to omit `apiKey` entirely: a normal checkout for a public
 * product needs no key and can be created from the browser. For a keyed server
 * test checkout use `Bitsnap.createCheckout(projectID, request)` from
 * `bitsnap-js` instead. See AGENTS.md.
 */
export async function createCheckout(
  request: LinkRequest & { apiKey?: string; testMode?: boolean },
): Promise<CreateCheckoutResult> {
  const projectID = getProjectID();
  if (projectID == null) {
    throw new Error("No project ID found");
  }

  const headers = {
    ...clientHeaders,
    ...visitorHeaders(projectID),
    "Content-Type": "application/json",
    ...(request.apiKey != null
      ? { Authorization: `Bearer ${request.apiKey}` }
      : {}),
  };

  const path = request.testMode
    ? `/api/payment/link/auto/${projectID}/test`
    : `/api/payment/link/auto/${projectID}`;

  delete request.apiKey;
  delete request.testMode;
  request.locale ??= getLocale();

  const response = await fetch(HOST + path, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    // `status` keeps `result.status === "ok"` narrowing for existing callers.
    return {
      ...buyErrorFromResponse(response.status, await readBody(response)),
      status: "error" as const,
    };
  }

  const payload: {
    url: string;
  } = await response.json();

  return {
    status: "ok" as const,
    redirectURL: payload.url,
  };
}

export function getReferenceIfPossible(): string | undefined {
  if (typeof localStorage == "undefined") {
    return undefined;
  }
  const refLink = localStorage.getItem("bitsnap-ref");
  if (refLink == null) {
    return undefined;
  }
  return refLink;
}

export function injectReferenceToRequestIfNeeded(
  request: LinkRequest,
): LinkRequest {
  const ref = getReferenceIfPossible();
  if (ref == null) {
    return request;
  }

  if (request.metadata == null) {
    request.metadata = {};
  }
  request.metadata["ref"] = ref;
  return request;
}
