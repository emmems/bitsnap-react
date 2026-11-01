import { CircleCheck } from "lucide-react";
import { useId, type FormEvent, type ReactNode } from "react";
import { cn } from "@/src/lib/utils";
import { Button } from "../button";
import { Input } from "../input";
import { Label } from "../label";
import { Spinner } from "../spinner";
import { OtpCodeField } from "./OtpCodeField";
import { fillText, type EmailCodeTexts } from "./texts";
import { type EmailCodeLogin } from "./useEmailCodeLogin";

export type EmailCodeLoginFormProps = {
  login: EmailCodeLogin;
  texts: EmailCodeTexts;
  /** Offers "I already have a code" under the e-mail step. */
  allowHaveCode?: boolean;
  /** Overrides the e-mail input placeholder. */
  emailPlaceholder?: string;
  /** `id` of the e-mail input; unique per instance by default. */
  emailInputId?: string;
  /** `id` of the code input; unique per instance by default. */
  codeInputId?: string;
  className?: string;
  /** Classes of the two primary buttons (brand colors). */
  buttonClassName?: string;
  /** Shown above the fields of the code step, after the "sent to" line. */
  children?: ReactNode;
};

const MUTED = "text-muted-foreground text-xs leading-5";
/** Borders of the dark theme: the `input` token is nearly the card colour. */
const DARK_FIELD =
  "dark:border-foreground/30 dark:focus-visible:border-foreground/70 dark:focus-visible:ring-foreground/25 dark:aria-invalid:border-destructive-foreground dark:aria-invalid:ring-destructive-foreground/30";
/** Failures about the address itself; a throttled or failed send is not. */
const EMAIL_FAILURES = new Set(["invalidEmail", "emailNotFound", "deliveryUnavailable"]);
const LINK =
  "inline-flex min-h-11 items-center px-1 text-sm underline underline-offset-4 hover:no-underline focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-sm outline-none disabled:opacity-50 disabled:no-underline";

/**
 * The two steps of the shared e-mail-code login. Markup only: all state comes
 * from {@link useEmailCodeLogin}. The surface wraps it in its own card or
 * dialog and renders the titles.
 */
export function EmailCodeLoginForm({
  login,
  texts,
  allowHaveCode = true,
  emailPlaceholder,
  emailInputId,
  codeInputId,
  className,
  buttonClassName,
  children,
}: EmailCodeLoginFormProps) {
  const uid = useId();
  const emailId = emailInputId ?? `${uid}-email`;
  const codeId = codeInputId ?? `${uid}-code`;
  const noticeId = `${uid}-notice`;
  const hintId = `${uid}-hint`;

  const { notice } = login;
  const isError = notice?.kind === "error";
  const sending = login.busy === "send";
  const verifying = login.busy === "verify";
  const resending = login.busy === "resend";
  const buttonBase = cn("h-11 w-full", buttonClassName);

  // Both live regions stay mounted (empty) so that a screen reader has
  // registered them before a message is put in; only their text changes.
  // The area reserves two lines, so a longer message does not push the buttons.
  const success = notice?.kind === "success";
  const noticeArea = (
    <div id={noticeId} className="min-h-10 text-sm leading-5">
      <p
        role="alert"
        className="font-medium text-red-700 dark:text-red-400"
      >
        {isError ? notice.text : null}
      </p>
      <p
        role="status"
        className={cn(
          "flex items-start gap-1.5",
          success
            ? "font-medium text-emerald-700 dark:text-emerald-400"
            : "text-foreground",
        )}
      >
        {success && <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />}
        <span>{notice != null && !isError ? notice.text : null}</span>
      </p>
    </div>
  );
  const emailInvalid =
    isError &&
    login.step === "email" &&
    (notice.failure == null || EMAIL_FAILURES.has(notice.failure));

  const announcer = (
    <p className="sr-only" role="status" aria-live="polite">
      {login.announcement}
    </p>
  );

  const emailField = (
    <div className="grid gap-2">
      <Label htmlFor={emailId}>{texts.emailLabel}</Label>
      <Input
        id={emailId}
        ref={login.emailRef}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        required
        className={cn(
          "h-11 text-base disabled:opacity-100 disabled:text-foreground/70",
          DARK_FIELD,
        )}
        placeholder={emailPlaceholder ?? texts.emailPlaceholder}
        value={login.email}
        disabled={login.isBusy}
        aria-invalid={emailInvalid ? true : undefined}
        aria-describedby={noticeId}
        onChange={(event) => login.setEmail(event.target.value)}
      />
    </div>
  );

  if (login.step === "email") {
    return (
      <form
        noValidate
        className={cn("flex flex-col gap-4", className)}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void login.sendCode();
        }}
      >
        {announcer}
        {emailField}
        {noticeArea}
        <Button
          type="submit"
          disabled={login.isBusy}
          aria-busy={sending}
          className={buttonBase}
        >
          {sending && <Spinner aria-hidden />}
          {sending ? texts.sending : texts.sendCode}
        </Button>
        {allowHaveCode && (
          <p className="flex flex-wrap items-center justify-center text-center text-sm">
            {texts.haveCodePrompt !== "" && <span>{texts.haveCodePrompt}</span>}
            <button
              type="button"
              className={LINK}
              disabled={login.isBusy}
              onClick={login.haveCode}
            >
              {texts.haveCode}
            </button>
          </p>
        )}
      </form>
    );
  }

  const [before, after] = texts.codeSentTo.split("{email}");
  const dead = login.dead != null;
  const resendLabel = dead
    ? texts.resendNew
    : login.secondsLeft > 0
      ? fillText(texts.resendIn, { seconds: login.secondsLeft })
      : texts.resend;

  return (
    <form
      noValidate
      className={cn("flex flex-col gap-4", className)}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void login.submitCode();
      }}
    >
      {announcer}
      {login.needsEmail ? (
        emailField
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          {/* The address moves to its own line before it is cut; the word
              joiner keeps the full stop with it. */}
          <p className="min-w-0 flex-[1_1_14rem] text-sm leading-5 break-words">
            {before}
            <strong className="font-semibold">{login.email}</strong>
            {"\u2060"}
            {after}
          </p>
          <button
            type="button"
            className={cn(LINK, "-ml-1 shrink-0")}
            disabled={login.isBusy}
            onClick={login.changeEmail}
          >
            {texts.changeEmail}
          </button>
        </div>
      )}
      {children}
      <div className="grid gap-2">
        <Label htmlFor={codeId}>{texts.codeLabel}</Label>
        <OtpCodeField
          id={codeId}
          name="code"
          inputRef={login.codeRef}
          value={login.code}
          onChange={login.setCode}
          onComplete={(value) => void login.submitCode(value)}
          disabled={login.isBusy || dead}
          invalid={isError && !login.needsEmail}
          aria-describedby={`${noticeId} ${hintId}`}
        />
        <p id={hintId} className={MUTED}>
          {texts.validity} {texts.spamHint}
        </p>
      </div>
      {noticeArea}
      <Button
        type="submit"
        disabled={login.isBusy || dead}
        aria-busy={verifying}
        className={buttonBase}
      >
        {verifying && <Spinner aria-hidden />}
        {verifying ? texts.verifying : texts.verify}
      </Button>
      {login.needsEmail ? (
        <div className="flex justify-center">
          <button
            type="button"
            className={LINK}
            disabled={login.isBusy}
            onClick={login.changeEmail}
          >
            {texts.noCode}
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant={dead ? "default" : "outline"}
          disabled={login.isBusy || (!dead && login.secondsLeft > 0)}
          aria-busy={resending}
          className={dead ? buttonBase : "h-11 w-full"}
          onClick={() => void login.resend()}
        >
          {resending && <Spinner aria-hidden />}
          {resendLabel}
        </Button>
      )}
    </form>
  );
}
