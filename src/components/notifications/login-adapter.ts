import { Code, ConnectError } from "@connectrpc/connect";
import { kindFromRpcError } from "@/src/ui/email-code-login/errors";
import {
  resolveEmailCodeTexts,
  type EmailCodeTexts,
} from "@/src/ui/email-code-login/texts";
import type {
  EmailCodeAdapter,
  FailureKind,
  SendOutcome,
  VerifyOutcome,
} from "@/src/ui/email-code-login/useEmailCodeLogin";
import type { LoginScreenTexts } from "./types";

export type NotificationsLoginResult = {
  userId: string | undefined;
  accessToken: string;
};

/** The one RPC both calls use (`VerifyUserEmail`), reduced to what is read. */
export type VerifyUserEmailCall = (request: {
  email?: string;
  code?: string;
  slug: string;
}) => Promise<{
  ok?: boolean;
  accessToken?: string;
  userId?: string;
  retryIn?: number;
  /** `false`: a throttled resend, nothing went out. Absent (old servers): sent. */
  sent?: boolean;
}>;

/** Login texts of the notifications component mapped onto the shared ones. */
export function notificationsLoginTexts(
  texts: LoginScreenTexts,
  locale = "pl",
): EmailCodeTexts {
  const sentTo = texts.loginCodeSentMessage;
  const overrides: Partial<EmailCodeTexts> = {
    emailLabel: texts.loginEmailLabel,
    emailPlaceholder: texts.loginEmailPlaceholder,
    sendCode: texts.loginSendCodeButton,
    sending: texts.loginSendingButton,
    invalidEmail: texts.loginInvalidEmailError,
    codeSentTo: sentTo != null ? `${sentTo} {email}.` : undefined,
    changeEmail: texts.loginChangeEmailButton,
    verify: texts.loginVerifyButton,
    spamHint: texts.loginSpamHint,
    validity: texts.loginValidityHint,
    resend: texts.loginResendCodeButton,
    resendIn: texts.loginResendInText,
    resent: texts.loginResentMessage,
    haveCodePrompt: "",
    haveCode: texts.loginIHaveCode,
    wrongCode: texts.loginInvalidCodeError,
    expired: texts.loginExpiredError,
    tooManyAttempts: texts.loginTooManyAttemptsError,
    rateLimited: texts.loginRateLimitedError,
    network: texts.loginNetworkError,
    generic: texts.loginVerifyCodeError,
    deliveryFailed: texts.loginSendEmailError,
    verifying: texts.loginVerifyingButton,
    stepEmail: texts.loginStepEmailHint,
    stepCode: texts.loginStepCodeHint,
    alreadySent: texts.loginAlreadySentMessage,
    emailNotFound: texts.loginEmailNotFoundError,
    deliveryUnavailable: texts.loginDeliveryUnavailableError,
    resendNew: texts.loginResendNewCodeButton,
    noCode: texts.loginNoCodeButton,
    codeIncomplete: texts.loginCodeIncompleteError,
  };
  return resolveEmailCodeTexts(locale, overrides);
}

/**
 * Kind of failure for an error thrown by `VerifyUserEmail`. The backend answers
 * a wrong code with "Invalid code" and the fifth wrong one (and per-IP limits)
 * with `ResourceExhausted`, "Too many attempts" for the former.
 */
export function notificationsFailureKind(error: unknown): FailureKind {
  const connect = ConnectError.from(error);
  const message = connect.rawMessage || connect.message;
  if (connect.code === Code.ResourceExhausted) {
    return /too many attempts/i.test(message) ? "tooManyAttempts" : "rateLimited";
  }
  if (/invalid code/i.test(message)) return "wrongCode";
  if (/expired/i.test(message)) return "expired";
  // Redis outage on the backend: not the customer's connection, so the
  // generic "try again shortly" copy.
  if (connect.code === Code.Unavailable) return "unknown";
  return kindFromRpcError(error);
}

export function createNotificationsAdapter(
  call: VerifyUserEmailCall,
  slug: string,
  texts: LoginScreenTexts,
): EmailCodeAdapter<NotificationsLoginResult> {
  return {
    async send(email, { resend }): Promise<SendOutcome> {
      if (!slug) {
        return { ok: false, kind: "unknown", message: texts.loginSlugRequiredError };
      }
      try {
        const response = await call({ email, slug });
        if (response.ok === false) {
          // `retryIn` without `ok`: the per-IP limit, nothing was sent. (A
          // throttled resend of a code that went out is `ok: true`.)
          return response.retryIn != null && response.retryIn > 0
            ? { ok: false, kind: "rateLimited", retryIn: response.retryIn }
            : {
                ok: false,
                kind: "deliveryFailed",
                message: resend ? texts.loginResendEmailError : texts.loginSendEmailError,
              };
        }
        if (response.sent === false) {
          // Throttled: an earlier code is still valid and `retryIn` is the
          // time left until a new one may be requested.
          return {
            ok: false,
            kind: "alreadySent",
            retryIn: response.retryIn || undefined,
          };
        }
        return { ok: true, retryIn: response.retryIn || undefined };
      } catch (cause) {
        const kind = notificationsFailureKind(cause);
        return {
          ok: false,
          kind,
          cause,
          message:
            kind === "unknown"
              ? resend
                ? texts.loginResendEmailError
                : texts.loginSendEmailError
              : undefined,
        };
      }
    },
    async verify({ email, code }): Promise<VerifyOutcome<NotificationsLoginResult>> {
      try {
        const response = await call({ email, code, slug });
        if (response.ok && response.accessToken) {
          return {
            ok: true,
            value: { userId: response.userId, accessToken: response.accessToken },
          };
        }
        return {
          ok: false,
          kind: "wrongCode",
          message: texts.loginVerificationFailedError,
        };
      } catch (cause) {
        return { ok: false, kind: notificationsFailureKind(cause), cause };
      }
    },
  };
}
