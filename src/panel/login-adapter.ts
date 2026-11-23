import { FailureMessage } from "../gen/proto/public/v1/public_api_pb";
import type { FailureKind } from "../ui/email-code-login/useEmailCodeLogin";

/**
 * Kind of failure for each `FailureMessage` the login RPCs return. Every
 * value has an answer, so the customer never sees "Nieprawidłowy adres email"
 * for a mistyped code or a throttled request.
 */
export function panelFailureKind(
  failure: FailureMessage,
  phase: "send" | "verify" = "verify",
): FailureKind {
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
    case FailureMessage.CAPTCHA_REQUIRED:
      return "captchaRequired";
    case FailureMessage.CAPTCHA_INVALID:
      return "captchaInvalid";
    case FailureMessage.DELIVERY_FAILED:
      return "deliveryFailed";
    case FailureMessage.DELIVERY_METHOD_UNAVAILABLE:
      return "deliveryUnavailable";
    case FailureMessage.UNAUTHORIZED:
      // Refused when the code is requested: this page may not sign in for the
      // shop, and a new code fails the same way. Refused for a code: that code
      // is for another shop, and a new one on this page helps.
      return phase === "send" ? "sendRefused" : "wrongShop";
    default:
      return "unknown";
  }
}
