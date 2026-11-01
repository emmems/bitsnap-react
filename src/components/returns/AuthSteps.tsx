import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/src/ui/button";
import { Input } from "@/src/ui/input";
import { Label } from "@/src/ui/label";
import { Spinner } from "@/src/ui/spinner";
import { cn } from "@/src/lib/utils";
import { OtpCodeField } from "@/src/ui/email-code-login/OtpCodeField";
import { useSecondsUntil } from "@/src/ui/email-code-login/countdown";
import { CODE_LENGTH } from "@/src/ui/email-code-login/useEmailCodeLogin";
import { useReturnsSlot } from "./appearance.context";
import { useReturnSession } from "./hooks";
import {
  ErrorMessage,
  INPUT_CLASS,
  OTP_SLOT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  StepFrame,
} from "./internal";
import { useReturnsContext } from "./ReturnsProvider";
import { useReturnsText } from "./texts.context";

export type ReturnsEmailStepProps = {
  /** Called after the verification code was sent, with the trimmed email. */
  onSubmitted?: (email: string) => void;
  className?: string;
};

/** First step: asks for the email the order was placed with. */
export function ReturnsEmailStep({
  onSubmitted,
  className,
}: ReturnsEmailStepProps) {
  const ctx = useReturnsContext("ReturnsEmailStep");
  const text = useReturnsText();
  const session = useReturnSession();
  // Coming back from the code step keeps what was typed.
  const [email, setEmail] = useState(ctx.lastEmail ?? "");
  const form = useReturnsSlot("emailForm");
  const input = useReturnsSlot("emailInput");
  const submitButton = useReturnsSlot("submitButton");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (session.isStarting) {
      return;
    }
    if (await session.start(email)) {
      onSubmitted?.(email.trim());
    }
  }

  return (
    <StepFrame
      className={className}
      title={text("emailStepTitle")}
      description={text("emailStepDescription")}
    >
      <form
        data-bitsnap-returns-slot="emailForm"
        className={cn("flex flex-col gap-4", form.className)}
        style={form.style}
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="bitsnap-returns-email">{text("emailLabel")}</Label>
          <Input
            id="bitsnap-returns-email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            value={email}
            placeholder={text("emailPlaceholder")}
            disabled={session.isStarting}
            data-bitsnap-returns-slot="emailInput"
            className={cn(INPUT_CLASS, input.className)}
            style={input.style}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        {session.errorKey != null && <ErrorMessage errorKey={session.errorKey} />}
        <Button
          type="submit"
          disabled={session.isStarting}
          data-bitsnap-returns-slot="submitButton"
          className={cn(PRIMARY_BUTTON_CLASS, submitButton.className)}
          style={submitButton.style}
        >
          {session.isStarting && <Spinner />}
          {text("emailSubmit")}
        </Button>
      </form>
    </StepFrame>
  );
}

export type ReturnsCodeStepProps = {
  /** Called once the code was accepted and the session exists. */
  onVerified?: () => void;
  /** Shows a back button, for example to change the email. */
  onBack?: () => void;
  className?: string;
};

/**
 * Second step: asks for the code that was emailed to the customer. The code
 * is a six digit one-time-code field that submits itself on the last digit;
 * the button stays for those who prefer it.
 */
export function ReturnsCodeStep({
  onVerified,
  onBack,
  className,
}: ReturnsCodeStepProps) {
  const ctx = useReturnsContext("ReturnsCodeStep");
  const text = useReturnsText();
  const session = useReturnSession();
  const [code, setCode] = useState("");
  const [incomplete, setIncomplete] = useState(false);
  const [resent, setResent] = useState(false);
  const [focusTick, setFocusTick] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const secondsLeft = useSecondsUntil(session.challenge?.resendAvailableAt);
  const form = useReturnsSlot("codeForm");
  const input = useReturnsSlot("codeInput");
  const submitButton = useReturnsSlot("submitButton");
  const resendButton = useReturnsSlot("resendButton");
  const isBusy = session.isVerifying || session.isStarting;
  const codeId = "bitsnap-returns-code";
  const hintId = `${codeId}-hint`;

  // Focus the field on the first render and after every failed attempt.
  useEffect(() => {
    if (!isBusy) {
      inputRef.current?.focus();
    }
  }, [focusTick, isBusy]);

  async function submit(value: string) {
    if (isBusy || submitting.current) {
      return;
    }
    if (value.length !== CODE_LENGTH) {
      setIncomplete(true);
      setFocusTick((tick) => tick + 1);
      return;
    }
    submitting.current = true;
    setIncomplete(false);
    setResent(false);
    try {
      if (await session.verify(value)) {
        onVerified?.();
      } else {
        setCode("");
        setFocusTick((tick) => tick + 1);
      }
    } finally {
      submitting.current = false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(code);
  }

  async function handleResend() {
    setIncomplete(false);
    setResent(false);
    if (await session.resend()) {
      setCode("");
      setResent(true);
    }
    setFocusTick((tick) => tick + 1);
  }

  function handleBack() {
    // Going back is "change the email": the pending code is no longer wanted.
    ctx.setChallenge(undefined);
    onBack?.();
  }

  return (
    <StepFrame
      className={className}
      onBack={onBack != null ? handleBack : undefined}
      title={text("codeStepTitle")}
      description={text("codeStepDescription", {
        email: session.challenge?.email ?? "",
      })}
    >
      <form
        data-bitsnap-returns-slot="codeForm"
        className={cn("flex flex-col gap-4", form.className)}
        style={form.style}
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={codeId}>{text("codeLabel")}</Label>
          <OtpCodeField
            id={codeId}
            name="code"
            inputRef={inputRef}
            value={code}
            disabled={isBusy}
            invalid={session.errorKey != null || incomplete}
            aria-describedby={hintId}
            slotClassName={cn(OTP_SLOT_CLASS, input.className)}
            slotStyle={input.style}
            onChange={(value) => {
              setCode(value.replace(/\D/g, ""));
              setIncomplete(false);
            }}
            onComplete={(value) => void submit(value)}
          />
          <p id={hintId} className="text-xs">
            {text("codeValidity")} {text("codeSpamHint")}
          </p>
        </div>
        <div className="min-h-5" aria-live="polite">
          {incomplete && (
            <p role="alert" className="text-sm">
              {text("codeIncomplete")}
            </p>
          )}
          {!incomplete && session.errorKey != null && (
            <ErrorMessage errorKey={session.errorKey} />
          )}
          {!incomplete && session.errorKey == null && resent && (
            <p role="status" className="text-sm">
              {text("resendSent")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={isBusy || session.challenge == null}
            data-bitsnap-returns-slot="submitButton"
            className={cn("h-11", PRIMARY_BUTTON_CLASS, submitButton.className)}
            style={submitButton.style}
          >
            {session.isVerifying && <Spinner aria-hidden />}
            {text("codeSubmit")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isBusy || secondsLeft > 0 || session.challenge == null}
            data-bitsnap-returns-slot="resendButton"
            className={cn("h-11", SECONDARY_BUTTON_CLASS, resendButton.className)}
            style={resendButton.style}
            onClick={() => void handleResend()}
          >
            {session.isStarting && <Spinner aria-hidden />}
            {secondsLeft > 0
              ? text("resendIn", { seconds: secondsLeft })
              : text("resend")}
          </Button>
        </div>
      </form>
    </StepFrame>
  );
}

/** Sign out button that drops the returns session. */
export function LogoutButton() {
  const text = useReturnsText();
  const session = useReturnSession();
  const logoutButton = useReturnsSlot("logoutButton");

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-bitsnap-returns-slot="logoutButton"
      className={cn(
        "text-[color:var(--bitsnap-returns-muted-foreground,#71717a)] hover:bg-[var(--bitsnap-returns-hover-surface,#f4f4f5)]",
        logoutButton.className,
      )}
      style={logoutButton.style}
      onClick={session.logout}
    >
      {text("logout")}
    </Button>
  );
}
