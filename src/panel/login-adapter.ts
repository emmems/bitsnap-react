import { FailureMessage } from "../gen/proto/public/v1/public_api_pb";
import type { FailureKind } from "../ui/email-code-login/useEmailCodeLogin";

/**
 * Kind of failure for each `FailureMessage` the login RPCs return. Every
 * value has an answer, so the customer never sees "Nieprawidłowy adres email"
 * for a mistyped code or a throttled request.
 */
export function panelFailureKind(failure: FailureMessage): FailureKind {
  switch (failure) {
    case FailureMessage.EMAIL_NOT_FOUND:
      return "emailNotFound";
    case FailureMessage.INCORRECT_EMAIL:
      return "invalidEmail";
    case FailureMessage.INCORRECT_CODE:
      return "wrongCode";
    case FailureMessage.CODE_EXPIRED:
      return "expired";
    case FailureMessage.TOO_MANY_ATTEMPTS:
      return "tooManyAttempts";
    case FailureMessage.RATE_LIMITED:
      return "rateLimited";
    case FailureMessage.DELIVERY_FAILED:
      return "deliveryFailed";
    case FailureMessage.DELIVERY_METHOD_UNAVAILABLE:
      return "deliveryUnavailable";
    default:
      return "unknown";
  }
}
