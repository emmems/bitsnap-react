import { getCheckoutSelection } from "@/src/components/checkout/CartProvider";
import { PublicApiClient } from "@/src/public.api.client";
import type {
  ExpressCartUpload,
  ExpressDeliveryOption,
} from "./contracts";

/**
 * The delivery quote of one express cart.
 *
 * The express upload can carry `delivery` options, but only the Bitsnap public
 * API knows the shop's methods and their prices (`getPreOrderDetails`). Without
 * them the backend prices the cart with zero shipping, which is not a total a
 * buyer may pay. This module resolves the quote once per cart content and
 * remembers it, so availability and provider start send exactly the same
 * delivery input to the backend.
 *
 * A failed quote is a hard stop: the express button stays hidden (or the start
 * fails) instead of mounting a payable total without shipping.
 */

export type ExpressDeliveryQuote = {
  delivery: ExpressDeliveryOption[];
  /** The method the backend selected/quoted; `undefined` when none applies. */
  deliveryMethod?: string;
};

const quotes = new Map<
  string,
  { quote: ExpressDeliveryQuote; at: number }
>();

const QUOTE_TTL_MS = 5 * 60 * 1000;

/** Test seam: forget every remembered quote. */
export function clearDeliveryQuoteCache(): void {
  quotes.clear();
}

export function deliveryQuoteKey(
  host: string,
  projectID: string,
  upload: ExpressCartUpload,
): string {
  const selection = getCheckoutSelection();
  return [
    host,
    projectID,
    upload.items
      .map((item) => `${item.id}:${item.quantity}`)
      .sort()
      .join(","),
    (upload.countries ?? []).slice().sort().join(","),
    upload.couponCode ?? "",
    upload.deliveryMethod ?? "",
    selection.postalCode ?? "",
  ].join("|");
}

export function readDeliveryQuote(
  host: string,
  projectID: string,
  upload: ExpressCartUpload,
): ExpressDeliveryQuote | undefined {
  const key = deliveryQuoteKey(host, projectID, upload);
  const entry = quotes.get(key);
  if (entry == null) {
    return undefined;
  }
  if (Date.now() - entry.at > QUOTE_TTL_MS) {
    quotes.delete(key);
    return undefined;
  }
  return entry.quote;
}

export function rememberDeliveryQuote(
  host: string,
  projectID: string,
  upload: ExpressCartUpload,
  quote: ExpressDeliveryQuote,
): void {
  quotes.set(deliveryQuoteKey(host, projectID, upload), {
    quote,
    at: Date.now(),
  });
}

/** Adds the remembered quote to an upload; a caller-supplied one wins. */
export function withDeliveryQuote(
  upload: ExpressCartUpload,
  quote: ExpressDeliveryQuote | undefined,
): ExpressCartUpload {
  if (quote == null || quote.delivery.length === 0) {
    return upload;
  }
  return {
    ...upload,
    delivery:
      upload.delivery != null && upload.delivery.length > 0
        ? upload.delivery
        : quote.delivery,
    ...(upload.deliveryMethod == null && quote.deliveryMethod != null
      ? { deliveryMethod: quote.deliveryMethod }
      : {}),
  };
}

/**
 * Resolves the delivery methods of a cart through the public API and remembers
 * them. Returns `undefined` when the quote cannot be obtained; callers must not
 * fall back to a shipping-free total.
 */
export async function loadDeliveryQuote(args: {
  host: string;
  projectID: string;
  upload: ExpressCartUpload;
}): Promise<ExpressDeliveryQuote | undefined> {
  if (args.upload.items.length === 0) {
    return { delivery: [] };
  }
  const selection = getCheckoutSelection();
  try {
    const response = await PublicApiClient.get(args.host).getPreOrderDetails({
      projectId: args.projectID,
      items: args.upload.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
      })),
      ...(args.upload.countries?.[0] != null
        ? { countryCode: args.upload.countries[0] }
        : {}),
      ...(args.upload.couponCode != null
        ? { couponCode: args.upload.couponCode }
        : {}),
      ...(args.upload.deliveryMethod != null
        ? { selectedDeliveryMethod: args.upload.deliveryMethod }
        : selection.selectedDeliveryMethod != null
          ? { selectedDeliveryMethod: selection.selectedDeliveryMethod }
          : {}),
      ...(selection.postalCode != null ? { postCode: selection.postalCode } : {}),
    });
    const delivery = response.methods.map((method) => ({
      name: method.id,
      ...(method.description != null ? { desc: method.description } : {}),
      min: method.minDays ?? 1,
      max: method.maxDays ?? 14,
      // The express contract takes major units; the public API quotes minor.
      price: method.amount / 100,
    }));
    const deliveryMethod =
      response.selectedDeliveryMethod ?? delivery[0]?.name ?? undefined;
    const quote: ExpressDeliveryQuote = {
      delivery,
      ...(deliveryMethod != null ? { deliveryMethod } : {}),
    };
    rememberDeliveryQuote(args.host, args.projectID, args.upload, quote);
    return quote;
  } catch (error) {
    console.warn("cannot resolve the express delivery quote", error);
    return undefined;
  }
}

export type PreparedExpressUpload =
  | { ok: true; upload: ExpressCartUpload; quote: ExpressDeliveryQuote }
  | { ok: false; message: string };

/**
 * Ensures the upload has the canonical delivery quote. Used by availability and
 * by provider start, so both send the same priced cart to the backend.
 */
export async function prepareExpressCartUpload(args: {
  host: string;
  projectID: string;
  upload: ExpressCartUpload;
}): Promise<PreparedExpressUpload> {
  if (args.upload.delivery != null && args.upload.delivery.length > 0) {
    return {
      ok: true,
      upload: args.upload,
      quote: {
        delivery: args.upload.delivery,
        ...(args.upload.deliveryMethod != null
          ? { deliveryMethod: args.upload.deliveryMethod }
          : {}),
      },
    };
  }
  const cached = readDeliveryQuote(args.host, args.projectID, args.upload);
  if (cached != null) {
    return {
      ok: true,
      upload: withDeliveryQuote(args.upload, cached),
      quote: cached,
    };
  }
  const quote = await loadDeliveryQuote(args);
  if (quote == null) {
    return {
      ok: false,
      message:
        "The delivery quote for this cart is not available. Use the regular checkout.",
    };
  }
  return { ok: true, upload: withDeliveryQuote(args.upload, quote), quote };
}
