import { Err } from "./lib/err";
import type { CheckoutTextKey } from "./texts";

/** Longest plain text body that is still shown to the shopper. */
const MAX_PLAIN_MESSAGE_LENGTH = 300;

/** Code of an Err that carries the ids of unavailable products in `data`. */
export const ITEM_IDS_NOT_FOUND = "item-ids-not-found";

/** Code used when the backend gave no (or an unknown) reason. */
export const INTERNAL_ERROR = "internal-error";

/** What the buy endpoints failed with, after reading whatever the body was. */
export type ParsedBuyError = {
  /** Backend `code`, or `internal-error` when the body has none. */
  code: string;
  /** Human readable reason from the server, when there was a usable one. */
  message?: string;
  /** Ids of the products that cannot be bought. */
  itemIds?: string[];
};

/** `data` of a buy Err that is not `item-ids-not-found`. */
export type BuyErrorData = { message?: string };

/**
 * Backend codes that have a shopper-friendly text. Any other code (for
 * example `invalid-request` or `product-not-found`) falls back to the
 * server message.
 */
const BUY_ERROR_TEXT_KEYS: Record<string, CheckoutTextKey> = {
  "no-payment-gateway": "noPaymentGateway",
  "gateway-not-configured": "gatewayNotConfigured",
  "shipping-not-configured": "shippingNotConfigured",
  "mixed-recurring": "mixedRecurring",
  "currency-unsupported": "currencyUnsupported",
  "price-changed": "priceChanged",
};

export function buyErrorTextKey(code: unknown): CheckoutTextKey | undefined {
  return typeof code === "string" && Object.hasOwn(BUY_ERROR_TEXT_KEYS, code)
    ? BUY_ERROR_TEXT_KEYS[code]
    : undefined;
}

function looksLikeHtml(text: string): boolean {
  return /^\s*<(!doctype|html|head|body|\?xml)/i.test(text) || /<\/?html/i.test(text);
}

function plainMessage(text: string): string | undefined {
  const trimmed = text.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_PLAIN_MESSAGE_LENGTH ||
    looksLikeHtml(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

/** Old backends put a JSON string such as `{"message":"..."}` in `error`. */
function unwrapMessage(error: unknown): string | undefined {
  if (typeof error === "object" && error != null) {
    const inner = (error as { message?: unknown }).message;
    return typeof inner === "string" ? plainMessage(inner) : undefined;
  }
  if (typeof error !== "string") {
    return undefined;
  }
  try {
    const inner = JSON.parse(error);
    if (typeof inner === "object" && inner != null) {
      return unwrapMessage(inner);
    }
  } catch {
    // Not JSON: the string itself is the message.
  }
  return plainMessage(error);
}

/**
 * Reads the body of a failed buy response, whatever its Content-Type was:
 * `{ success, code, error, itemIds }` JSON, the old `{ error }` shapes, plain
 * text, or nothing.
 */
export function parseBuyError(bodyText: string): ParsedBuyError {
  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return { code: INTERNAL_ERROR, message: plainMessage(bodyText) };
  }

  if (typeof payload === "string") {
    return { code: INTERNAL_ERROR, message: plainMessage(payload) };
  }
  if (typeof payload !== "object" || payload == null) {
    return { code: INTERNAL_ERROR };
  }

  const body = payload as { code?: unknown; error?: unknown; itemIds?: unknown };
  const parsed: ParsedBuyError = {
    code:
      typeof body.code === "string" && body.code.length > 0
        ? body.code
        : INTERNAL_ERROR,
    message: unwrapMessage(body.error),
  };
  if (Array.isArray(body.itemIds)) {
    parsed.itemIds = body.itemIds.filter(
      (id): id is string => typeof id === "string",
    );
  }
  return parsed;
}

/** The Err returned by the buy calls for a failed response. */
export function buyErrorFromResponse(status: number, bodyText: string): Err {
  const { code, message, itemIds } = parseBuyError(bodyText);
  if (itemIds != null) {
    return Err(ITEM_IDS_NOT_FOUND, "badInput", itemIds);
  }
  const data: BuyErrorData = { message };
  return Err(code, status >= 500 ? "internal" : "badInput", data);
}

/**
 * The text a shopper sees for a buy Err: the text mapped to the backend
 * code, else the server message, else the generic one. Never the bare code.
 */
export function buyErrorText(
  err: { error: unknown; data?: unknown },
  getText: (key: CheckoutTextKey) => string,
): string {
  const key = buyErrorTextKey(err.error);
  if (key != null) {
    return getText(key);
  }
  const message = (err.data as BuyErrorData | null | undefined)?.message;
  if (typeof message === "string" && message.length > 0) {
    return message;
  }
  return getText("checkoutFailed");
}
