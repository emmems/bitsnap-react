import { REGEXP_ONLY_DIGITS } from "input-otp";
import type { CSSProperties, Ref } from "react";
import { cn } from "@/src/lib/utils";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../input-otp";
import { CODE_LENGTH } from "./useEmailCodeLogin";

/** Pasted codes often carry spaces or dashes ("123 456", "123-456"). */
export function stripCodeSeparators(pasted: string): string {
  return pasted.replace(/[\s-]/g, "");
}

export type OtpCodeFieldProps = {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  /** Called once when the last digit is entered, with the full code. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Accessible name when no `<label htmlFor>` points at the field. */
  "aria-label"?: string;
  "aria-describedby"?: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  /** Extra classes of every slot (colors, borders). */
  slotClassName?: string;
  slotStyle?: CSSProperties;
  className?: string;
};

/**
 * Six digit one-time-code input: digits only, numeric keypad, one-time-code
 * autofill, spaces and dashes stripped on paste. Slots are 44 px tall and
 * shrink on narrow screens instead of overflowing.
 */
export function OtpCodeField({
  id,
  name,
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  inputRef,
  autoFocus,
  slotClassName,
  slotStyle,
  className,
  ...aria
}: OtpCodeFieldProps) {
  const slotProps = {
    className: cn("h-11 w-auto min-w-0 flex-1 text-base", slotClassName),
    style: slotStyle,
    "aria-invalid": invalid ? true : undefined,
  } as const;

  return (
    <InputOTP
      ref={inputRef}
      id={id}
      name={name}
      maxLength={CODE_LENGTH}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      autoFocus={autoFocus}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern={REGEXP_ONLY_DIGITS}
      pasteTransformer={stripCodeSeparators}
      aria-invalid={invalid ? true : undefined}
      aria-label={aria["aria-label"]}
      aria-describedby={aria["aria-describedby"]}
      containerClassName={cn("w-full max-w-72", className)}
    >
      <InputOTPGroup className="w-full">
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <InputOTPSlot key={index} index={index} {...slotProps} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
