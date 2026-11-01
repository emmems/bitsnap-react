import { useCallback, useEffect, useRef, useState } from "react";
import { useSecondsUntil } from "./countdown";
import {
  clearPendingLogin,
  readPendingLogin,
  savePendingLogin,
} from "./pending";
import { fillText, formatWait, type EmailCodeTexts } from "./texts";

/** Why a send or verify call did not succeed. */
export type FailureKind =
  | "invalidEmail"
  | "emailNotFound"
  | "wrongCode"
  | "expired"
  | "tooManyAttempts"
  | "rateLimited"
  /** Sending was throttled because a code went out a moment ago. */
  | "alreadySent"
  | "deliveryFailed"
  | "deliveryUnavailable"
  | "network"
  | "unknown";

export type SendOutcome =
  | {
      ok: true;
      /** Seconds until another code may be requested. Defaults to 60. */
      retryIn?: number;
      /** Binds the code to this attempt, when the backend issues one. */
      challengeId?: string;
    }
  | {
      ok: false;
      kind: FailureKind;
      retryIn?: number;
      cause?: unknown;
      /** Text to show instead of the default one for `kind`. */
      message?: string;
    };

export type VerifyOutcome<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      kind: FailureKind;
      retryIn?: number;
      cause?: unknown;
      /** Text to show instead of the default one for `kind`. */
      message?: string;
    };

/** What a surface plugs into the shared login: its two backend calls. */
export interface EmailCodeAdapter<T = void> {
  send(email: string, context: { resend: boolean }): Promise<SendOutcome>;
  verify(input: {
    email: string;
    code: string;
    challengeId?: string;
  }): Promise<VerifyOutcome<T>>;
}

export type LoginNotice = {
  kind: "error" | "info" | "success";
  text: string;
  /** The failure behind an error or info notice; unset for local messages. */
  failure?: FailureKind;
};

/** Length of the code. */
export const CODE_LENGTH = 6;

const DEFAULT_RESEND_SECONDS = 60;

const EMAIL_PATTERN =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Customer facing message of a failure. */
export function failureNotice(
  texts: EmailCodeTexts,
  kind: FailureKind,
  retryIn?: number,
): LoginNotice {
  return { ...describeFailure(texts, kind, retryIn), failure: kind };
}

function describeFailure(
  texts: EmailCodeTexts,
  kind: FailureKind,
  retryIn?: number,
): LoginNotice {
  const time = formatWait(retryIn ?? DEFAULT_RESEND_SECONDS);
  switch (kind) {
    case "invalidEmail":
      return { kind: "error", text: texts.invalidEmail };
    case "emailNotFound":
      return { kind: "error", text: texts.emailNotFound };
    case "wrongCode":
      return { kind: "error", text: texts.wrongCode };
    case "expired":
      return { kind: "error", text: texts.expired };
    case "tooManyAttempts":
      return { kind: "error", text: texts.tooManyAttempts };
    case "rateLimited":
      return { kind: "error", text: fillText(texts.rateLimited, { time }) };
    case "alreadySent":
      return { kind: "info", text: fillText(texts.alreadySent, { time }) };
    case "deliveryFailed":
      return { kind: "error", text: texts.deliveryFailed };
    case "deliveryUnavailable":
      return { kind: "error", text: texts.deliveryUnavailable };
    case "network":
      return { kind: "error", text: texts.network };
    default:
      return { kind: "error", text: texts.generic };
  }
}

export type UseEmailCodeLoginOptions<T> = {
  adapter: EmailCodeAdapter<T>;
  texts: EmailCodeTexts;
  /** `sessionStorage` key of the pending step; without it nothing is kept. */
  storageKey?: string;
  initialEmail?: string;
  /** Called once with what the adapter returned for the accepted code. */
  onVerified?: (value: T, email: string) => void;
  /** Called for failures worth reporting (not a mistyped code or e-mail). */
  onFailure?: (kind: FailureKind, cause?: unknown) => void;
};

export type EmailCodeLogin = ReturnType<typeof useEmailCodeLogin>;

/**
 * State of the e-mail + 6-digit-code login, without any markup: the step, the
 * fields, the countdown to the next code, the message to show and the actions.
 * The surface supplies the two backend calls through an {@link EmailCodeAdapter}.
 */
export function useEmailCodeLogin<T = void>(
  options: UseEmailCodeLoginOptions<T>,
) {
  const { storageKey } = options;
  const latest = useRef(options);
  latest.current = options;

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmailState] = useState(options.initialEmail ?? "");
  const [code, setCodeState] = useState("");
  const [challengeId, setChallengeId] = useState<string>();
  const [resendAt, setResendAt] = useState<number>();
  const [needsEmail, setNeedsEmail] = useState(false);
  /** The code can no longer be used; only a new one helps. */
  const [dead, setDead] = useState<"expired" | "tooManyAttempts">();
  const [notice, setNotice] = useState<LoginNotice>();
  const [busy, setBusy] = useState<"send" | "resend" | "verify">();
  const [done, setDone] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [focusNonce, setFocusNonce] = useState(0);

  const busyRef = useRef(false);
  const focusTarget = useRef<"email" | "code">("email");
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const announcedStep = useRef<"email" | "code">("email");

  const secondsLeft = useSecondsUntil(resendAt);

  const requestFocus = useCallback((target: "email" | "code") => {
    focusTarget.current = target;
    setFocusNonce((nonce) => nonce + 1);
  }, []);

  useEffect(() => {
    if (focusNonce === 0) return;
    (focusTarget.current === "email" ? emailRef : codeRef).current?.focus();
  }, [focusNonce]);

  // Restore a code step that was pending before a reload or an app switch.
  useEffect(() => {
    // A new key means another surface or project: start from the e-mail step
    // instead of keeping what the previous key left behind.
    setStep("email");
    setCodeState("");
    setChallengeId(undefined);
    setResendAt(undefined);
    setNeedsEmail(false);
    setDead(undefined);
    setNotice(undefined);
    if (storageKey == null) return;
    const pending = readPendingLogin(storageKey);
    if (pending == null) return;
    setEmailState(pending.email);
    setChallengeId(pending.challengeId);
    setResendAt(pending.resendAt > Date.now() ? pending.resendAt : undefined);
    setStep("code");
  }, [storageKey]);

  // Tell assistive technology about a step change (not about the first one).
  useEffect(() => {
    if (announcedStep.current === step) return;
    announcedStep.current = step;
    setAnnouncement(
      step === "code" ? latest.current.texts.stepCode : latest.current.texts.stepEmail,
    );
  }, [step]);

  // Move the focus to the field of the new step.
  useEffect(() => {
    if (step === "code" && focusNonce === 0) {
      requestFocus(needsEmail ? "email" : "code");
    }
    // Only the first switch to the code step (a restore) needs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const fail = useCallback(
    (
      kind: FailureKind,
      retryIn: number | undefined,
      cause: unknown,
      message?: string,
    ) => {
      if (
        kind !== "wrongCode" &&
        kind !== "invalidEmail" &&
        kind !== "alreadySent"
      ) {
        latest.current.onFailure?.(kind, cause);
      }
      const notice = failureNotice(latest.current.texts, kind, retryIn);
      return message != null ? { ...notice, text: message } : notice;
    },
    [],
  );

  const enterCodeStep = useCallback(
    (
      address: string,
      id: string | undefined,
      retryIn: number | undefined,
      message: LoginNotice | undefined,
    ) => {
      const now = Date.now();
      const at = now + (retryIn ?? DEFAULT_RESEND_SECONDS) * 1000;
      setEmailState(address);
      setStep("code");
      setNeedsEmail(false);
      setChallengeId(id);
      setResendAt(at);
      setCodeState("");
      setDead(undefined);
      setNotice(message);
      if (storageKey != null) {
        savePendingLogin(storageKey, {
          email: address,
          challengeId: id,
          resendAt: at,
          sentAt: now,
        });
      }
      requestFocus("code");
    },
    [storageKey, requestFocus],
  );

  const send = useCallback(
    async (mode: "send" | "resend") => {
      if (busyRef.current) return;
      const address = email.trim();
      if (!isValidEmail(address)) {
        setNotice(failureNotice(latest.current.texts, "invalidEmail"));
        requestFocus("email");
        return;
      }
      busyRef.current = true;
      setBusy(mode);
      setNotice(undefined);

      let outcome: SendOutcome;
      try {
        outcome = await latest.current.adapter.send(address, {
          resend: mode === "resend",
        });
      } catch (cause) {
        outcome = { ok: false, kind: "network", cause };
      }
      busyRef.current = false;
      setBusy(undefined);

      if (outcome.ok) {
        enterCodeStep(
          address,
          outcome.challengeId,
          outcome.retryIn,
          mode === "resend"
            ? { kind: "success", text: latest.current.texts.resent }
            : undefined,
        );
        return;
      }

      const message = fail(
        outcome.kind,
        outcome.retryIn,
        outcome.cause,
        outcome.message,
      );
      if (outcome.kind === "alreadySent" && mode === "send") {
        // A code went out a moment ago and is still valid: go and enter it.
        enterCodeStep(address, undefined, outcome.retryIn, message);
        return;
      }
      if (outcome.retryIn != null && mode === "resend") {
        setResendAt(Date.now() + outcome.retryIn * 1000);
      }
      setNotice(message);
      if (mode === "send") requestFocus("email");
    },
    [email, enterCodeStep, fail, requestFocus],
  );

  const submitCode = useCallback(
    async (value?: string) => {
      const entered = value ?? code;
      if (busyRef.current || done || dead != null) return;
      const address = email.trim();
      if (needsEmail && !isValidEmail(address)) {
        setNotice(failureNotice(latest.current.texts, "invalidEmail"));
        requestFocus("email");
        return;
      }
      if (entered.length !== CODE_LENGTH) {
        setNotice({ kind: "error", text: latest.current.texts.codeIncomplete });
        requestFocus("code");
        return;
      }
      busyRef.current = true;
      setBusy("verify");
      setNotice(undefined);

      let outcome: VerifyOutcome<T>;
      try {
        outcome = await latest.current.adapter.verify({
          email: address,
          code: entered,
          challengeId,
        });
      } catch (cause) {
        outcome = { ok: false, kind: "network", cause };
      }
      busyRef.current = false;
      setBusy(undefined);

      if (outcome.ok) {
        if (storageKey != null) clearPendingLogin(storageKey);
        setDone(true);
        latest.current.onVerified?.(outcome.value, address);
        return;
      }

      setNotice(
        fail(outcome.kind, outcome.retryIn, outcome.cause, outcome.message),
      );
      switch (outcome.kind) {
        case "expired":
        case "tooManyAttempts":
          setDead(outcome.kind);
          setCodeState("");
          if (storageKey != null) clearPendingLogin(storageKey);
          break;
        case "invalidEmail":
        case "emailNotFound":
          requestFocus(needsEmail ? "email" : "code");
          break;
        case "network":
        case "unknown":
        case "deliveryFailed":
        case "deliveryUnavailable":
          // The code may be fine: keep it so one tap retries.
          requestFocus("code");
          break;
        default:
          setCodeState("");
          requestFocus("code");
      }
    },
    [
      code,
      challengeId,
      dead,
      done,
      email,
      fail,
      needsEmail,
      requestFocus,
      storageKey,
    ],
  );

  const setEmail = useCallback((value: string) => {
    setEmailState(value);
    setNotice((current) => (current?.kind === "error" ? undefined : current));
  }, []);

  /** Digits only; a stale error goes away as soon as the customer types. */
  const setCode = useCallback((value: string) => {
    setCodeState(value.replace(/\D/g, "").slice(0, CODE_LENGTH));
    setNotice((current) => (current?.kind === "error" ? undefined : current));
  }, []);

  const changeEmail = useCallback(() => {
    setStep("email");
    setNeedsEmail(false);
    setCodeState("");
    setChallengeId(undefined);
    setResendAt(undefined);
    setDead(undefined);
    setNotice(undefined);
    if (storageKey != null) clearPendingLogin(storageKey);
    requestFocus("email");
  }, [storageKey, requestFocus]);

  /** "I already have a code": the code step, asking for the e-mail too. */
  const haveCode = useCallback(() => {
    setStep("code");
    setNeedsEmail(true);
    setCodeState("");
    setChallengeId(undefined);
    setResendAt(undefined);
    setDead(undefined);
    setNotice(undefined);
    requestFocus("email");
  }, [requestFocus]);

  return {
    step,
    email,
    setEmail,
    code,
    setCode,
    /** The code step asks for the e-mail as well ("I already have a code"). */
    needsEmail,
    busy,
    isBusy: busy != null || done,
    /** The accepted code is being handed over; the form stays locked. */
    done,
    notice,
    dead,
    /** Seconds until a new code may be requested, `0` when it may. */
    secondsLeft,
    announcement,
    emailRef,
    codeRef,
    sendCode: () => send("send"),
    resend: () => send("resend"),
    submitCode,
    changeEmail,
    haveCode,
  };
}
