/**
 * Return markers of the express flows.
 *
 * Revolut appends `_rp_oid` (the public order token) to a redirect URL. The SDK
 * also adds its own marker so a full page return can tell which provider and
 * which durable cart it belongs to. None of these values proves a payment:
 * they only select what to ask the server about.
 */

export const EXPRESS_RETURN_PARAM = "bitsnap_express";
export const EXPRESS_CART_PARAM = "bitsnap_express_cart";
export const EXPRESS_RESULT_PARAM = "bitsnap_express_result";
export const REVOLUT_ORDER_PARAM = "_rp_oid";

export type ExpressReturn = {
  returned: boolean;
  provider?: "inpostPay" | "revolutPay";
  cartId?: string;
  orderToken?: string;
  result?: "success" | "failure" | "cancel";
};

export function readExpressReturn(search: string): ExpressReturn {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  } catch {
    return { returned: false };
  }
  const provider = params.get(EXPRESS_RETURN_PARAM);
  const orderToken = params.get(REVOLUT_ORDER_PARAM) ?? undefined;
  const cartId = params.get(EXPRESS_CART_PARAM) ?? undefined;
  const rawResult = params.get(EXPRESS_RESULT_PARAM);
  const result =
    rawResult === "success" || rawResult === "failure" || rawResult === "cancel"
      ? rawResult
      : undefined;
  const isProvider = provider === "inpostPay" || provider === "revolutPay";
  return {
    returned: isProvider || orderToken != null,
    ...(isProvider ? { provider } : {}),
    ...(cartId != null ? { cartId } : {}),
    ...(orderToken != null ? { orderToken } : {}),
    ...(result != null ? { result } : {}),
  };
}

/** The page URL a mobile redirect should come back to, with flow markers. */
export function withExpressReturn(
  url: string,
  args: {
    provider: "inpostPay" | "revolutPay";
    cartId: string;
    result: "success" | "failure" | "cancel";
  },
): string {
  const base =
    typeof window !== "undefined" ? window.location.href : "https://localhost/";
  const parsed = new URL(url, base);
  parsed.searchParams.set(EXPRESS_RETURN_PARAM, args.provider);
  parsed.searchParams.set(EXPRESS_CART_PARAM, args.cartId);
  parsed.searchParams.set(EXPRESS_RESULT_PARAM, args.result);
  return parsed.toString();
}

/** Removes this SDK's markers (and the provider's order token) from the URL. */
export function withoutExpressReturn(url: string): string {
  const base =
    typeof window !== "undefined" ? window.location.href : "https://localhost/";
  const parsed = new URL(url, base);
  parsed.searchParams.delete(EXPRESS_RETURN_PARAM);
  parsed.searchParams.delete(EXPRESS_CART_PARAM);
  parsed.searchParams.delete(EXPRESS_RESULT_PARAM);
  parsed.searchParams.delete(REVOLUT_ORDER_PARAM);
  return parsed.pathname + parsed.search + parsed.hash;
}
