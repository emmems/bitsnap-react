import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/src/ui/button";
import { Input } from "@/src/ui/input";
import { Label } from "@/src/ui/label";
import { Spinner } from "@/src/ui/spinner";
import { cn } from "@/src/lib/utils";
import { useReturnsSlot } from "./appearance.context";
import { useReturnSession } from "./hooks";
import {
  ErrorMessage,
  INPUT_CLASS,
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
  useReturnsContext("ReturnsEmailStep");
  const text = useReturnsText();
  const session = useReturnSession();
  const [email, setEmail] = useState("");
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

/** Seconds left until `availableAt`, ticking once a second. */
function useCountdown(availableAt: number | undefined): number {
  const [now, setNow] = useState<number>();

  useEffect(() => {
    if (availableAt == null) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= availableAt) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [availableAt]);

  return availableAt != null && now != null
    ? Math.max(0, Math.ceil((availableAt - now) / 1000))
    : 0;
}

export type ReturnsCodeStepProps = {
  /** Called once the code was accepted and the session exists. */
  onVerified?: () => void;
  /** Shows a back button, for example to change the email. */
  onBack?: () => void;
  className?: string;
};

/** Second step: asks for the code that was emailed to the customer. */
export function ReturnsCodeStep({
  onVerified,
  onBack,
  className,
}: ReturnsCodeStepProps) {
  useReturnsContext("ReturnsCodeStep");
  const text = useReturnsText();
  const session = useReturnSession();
  const [code, setCode] = useState("");
  const secondsLeft = useCountdown(session.challenge?.resendAvailableAt);
  const form = useReturnsSlot("codeForm");
  const input = useReturnsSlot("codeInput");
  const submitButton = useReturnsSlot("submitButton");
  const resendButton = useReturnsSlot("resendButton");
  const isBusy = session.isVerifying || session.isStarting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) {
      return;
    }
    if (await session.verify(code)) {
      onVerified?.();
    }
  }

  return (
    <StepFrame
      className={className}
      onBack={onBack}
      title={text("codeStepTitle")}
      description={text("codeStepDescription", {
        email: session.challenge?.email ?? "",
      })}
    >
      <form
        data-bitsnap-returns-slot="codeForm"
        className={cn("flex flex-col gap-4", form.className)}
        style={form.style}
        onSubmit={handleSubmit}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="bitsnap-returns-code">{text("codeLabel")}</Label>
          <Input
            id="bitsnap-returns-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            disabled={isBusy}
            data-bitsnap-returns-slot="codeInput"
            className={cn(INPUT_CLASS, input.className)}
            style={input.style}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        {session.errorKey != null && <ErrorMessage errorKey={session.errorKey} />}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={isBusy || session.challenge == null}
            data-bitsnap-returns-slot="submitButton"
            className={cn(PRIMARY_BUTTON_CLASS, submitButton.className)}
            style={submitButton.style}
          >
            {session.isVerifying && <Spinner />}
            {text("codeSubmit")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isBusy || secondsLeft > 0 || session.challenge == null}
            data-bitsnap-returns-slot="resendButton"
            className={cn(SECONDARY_BUTTON_CLASS, resendButton.className)}
            style={resendButton.style}
            onClick={() => void session.resend()}
          >
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
