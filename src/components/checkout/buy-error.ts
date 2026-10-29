import { Err } from "./lib/err";
import type { CheckoutTextKey } from "./texts";

/** Longest plain text body that is still shown to the shopper. */
const MAX_PLAIN_MESSAGE_LENGTH = 200;

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

/**
 * `data` of a buy Err that is not `item-ids-not-found`. `itemIds` is set when
 * the backend listed products under a code other than "not available".
 */
export type BuyErrorData = { message?: string; itemIds?: string[] };

/**
 * Backend codes that have a shopper-friendly text. Any other 4xx code falls
 * back to the server message; `internal` and `invalid-request` show the
 * generic text.
 */
const BUY_ERROR_TEXT_KEYS: Record<string, CheckoutTextKey> = {
  "no-payment-gateway": "noPaymentGateway",
  "gateway-not-configured": "gatewayNotConfigured",
  "shipping-not-configured": "shippingNotConfigured",
  "mixed-recurring": "mixedRecurring",
  "currency-unsupported": "currencyUnsupported",
  "price-changed": "priceChanged",
  "product-not-found": "unavailableProducts",
  "product-not-available": "unavailableProducts",
};

/** Codes whose server message is not meant for the shopper. */
const GENERIC_TEXT_CODES = new Set(["internal", "invalid-request"]);

/** Codes (besides a missing one) under which `itemIds` mean unavailable products. */
const ITEM_IDS_CODES = new Set(["product-not-available", "product-not-found"]);

export function buyErrorTextKey(code: unknown): CheckoutTextKey | undefined {
  return typeof code === "string" && Object.hasOwn(BUY_ERROR_TEXT_KEYS, code)
    ? BUY_ERROR_TEXT_KEYS[code]
    : undefined;
}

function looksLikeMarkup(text: string): boolean {
  return /<\/?[a-z!?][^>]*>/i.test(text);
}

/** A bare code such as `internal_error`: not meant to be read by a shopper. */
function looksLikeCode(text: string): boolean {
  return /^[a-z]+(?:[-_][a-z]+)*$/.test(text);
}

function looksLikeStack(text: string): boolean {
  return /Error:/.test(text) || /\n\s+at /.test(text);
}

function plainMessage(text: string): string | undefined {
  const trimmed = text.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_PLAIN_MESSAGE_LENGTH ||
    /[\r\n]/.test(trimmed) ||
    looksLikeMarkup(trimmed) ||
    looksLikeCode(trimmed) ||
    looksLikeStack(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

type UnwrappedError = { message?: string; code?: string };

/** The deepest JSON string `error` is wrapped in, before it is plain text. */
const MAX_UNWRAP_DEPTH = 3;

/**
 * Old backends put a JSON string such as `{"message":"..."}` (or
 * `{"error":"...","code":"..."}`) in `error`.
 */
function unwrapMessage(error: unknown, depth = 0): UnwrappedError {
  if (typeof error === "object" && error != null) {
    if (Array.isArray(error) || depth >= MAX_UNWRAP_DEPTH) {
      return {};
    }
    const inner = error as { error?: unknown; message?: unknown; code?: unknown };
    const result = unwrapMessage(inner.error ?? inner.message, depth + 1);
    if (typeof inner.code === "string" && inner.code.length > 0) {
      result.code = inner.code;
    }
    return result;
  }
  if (typeof error !== "string") {
    return {};
  }
  try {
    const inner: unknown = JSON.parse(error);
    // A JSON scalar (`"123"`, `"null"`, `"\"text\""`) is not a message.
    return typeof inner === "object" && inner != null
      ? unwrapMessage(inner, depth + 1)
      : {};
  } catch {
    // Not JSON: the string itself is the message.
  }
  return { message: plainMessage(error) };
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
  const { message, code: innerCode } = unwrapMessage(body.error);
  const parsed: ParsedBuyError = {
    code:
      typeof body.code === "string" && body.code.length > 0
        ? body.code
        : (innerCode ?? INTERNAL_ERROR),
    message,
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
  const hasItemIds = itemIds != null && itemIds.length > 0;
  if (hasItemIds && (code === INTERNAL_ERROR || ITEM_IDS_CODES.has(code))) {
    return Err(ITEM_IDS_NOT_FOUND, "badInput", itemIds);
  }
  const data: BuyErrorData = { message };
  if (hasItemIds) {
    data.itemIds = itemIds;
  }
  return Err(code, status >= 500 ? "internal" : "badInput", data);
}

/**
 * The text a shopper sees for a buy Err: the text mapped to the backend
 * code; the generic one for server errors and `invalid-request`; else the
 * server message of a 4xx, else the generic one. Never the bare code.
 */
export function buyErrorText(
  err: { error: unknown; type?: string; data?: unknown },
  getText: (key: CheckoutTextKey) => string,
): string {
  const key = buyErrorTextKey(err.error);
  if (key != null) {
    return getText(key);
  }
  if (
    err.type === "internal" ||
    (typeof err.error === "string" && GENERIC_TEXT_CODES.has(err.error))
  ) {
    return getText("checkoutFailed");
  }
  const message = (err.data as BuyErrorData | null | undefined)?.message;
  if (typeof message === "string" && message.length > 0) {
    return message;
  }
  return getText("checkoutFailed");
}
