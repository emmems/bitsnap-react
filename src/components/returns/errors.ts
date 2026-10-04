import type { ReturnsTextKey } from "./texts";

/** Backend error code that means the returns session is gone. */
export const SESSION_EXPIRED = "SESSION_EXPIRED";

const ERROR_TEXT_KEYS: Record<string, ReturnsTextKey> = {
  INVALID_EMAIL: "errorInvalidEmail",
  INVALID_OR_EXPIRED_CODE: "errorInvalidCode",
  SESSION_EXPIRED: "errorSessionExpired",
  ORDER_NOT_FOUND: "errorOrderNotFound",
  RETURN_NOT_FOUND: "errorReturnNotFound",
  QUANTITY_UNAVAILABLE: "errorQuantityUnavailable",
  ITEM_NOT_RETURNABLE: "errorItemNotReturnable",
  INVALID_RETURN_ITEMS: "errorItemNotReturnable",
  RETURNS_DISABLED: "errorReturnsDisabled",
  SUBMISSION_RATE_LIMITED: "errorRateLimited",
  IDEMPOTENCY_CONFLICT: "errorIdempotencyConflict",
  VERIFICATION_DELIVERY_FAILED: "errorDeliveryFailed",
};

/**
 * Backend error code of a failed RPC. `ConnectError.rawMessage` carries it; for
 * other errors the message is searched for a known code.
 */
export function getReturnsErrorCode(error: unknown): string | undefined {
  if (error == null || typeof error !== "object") {
    return undefined;
  }

  const { rawMessage, message } = error as {
    rawMessage?: unknown;
    message?: unknown;
  };

  if (typeof rawMessage === "string" && rawMessage.length > 0) {
    return rawMessage;
  }

  if (typeof message === "string") {
    return Object.keys(ERROR_TEXT_KEYS).find((code) => message.includes(code));
  }

  return undefined;
}

export function isSessionExpiredError(error: unknown): boolean {
  return getReturnsErrorCode(error) === SESSION_EXPIRED;
}

/** Maps any failure to the text key of a customer facing message. */
export function mapReturnsError(error: unknown): ReturnsTextKey {
  const code = getReturnsErrorCode(error);

  return (code != null ? ERROR_TEXT_KEYS[code] : undefined) ?? "errorGeneric";
}
