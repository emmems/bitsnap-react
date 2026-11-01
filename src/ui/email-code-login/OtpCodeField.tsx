import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useCallback, type CSSProperties, type Ref } from "react";
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
 * The library stretches the hidden input over the slots with `width: 100%`.
 * The browser's own 2px padding on a content-box input makes it 4px wider than
 * the slots, and than the viewport on a phone. Our stylesheet resets that, but
 * it is scoped to `.bitsnap-react`, and the notifications dialog renders in a
 * portal outside that root, so a class name on the input (`className` reaches
 * it) does not apply there. The library also overrides the `style` prop, so
 * the inline style is set on the node itself, from the ref.
 */
function resetFieldBox(node: HTMLInputElement | null) {
  if (node != null) {
    node.style.boxSizing = "border-box";
    node.style.padding = "0";
  }
}

/**
 * Six digit one-time-code input: digits only, numeric keypad, one-time-code
 * autofill, spaces and dashes stripped on paste. The six slots are 44 px
 * tall and share the full width, shrinking on narrow screens.
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
  const setInput = useCallback(
    (node: HTMLInputElement | null) => {
      resetFieldBox(node);
      if (typeof inputRef === "function") inputRef(node);
      else if (inputRef != null) inputRef.current = node;
    },
    [inputRef],
  );
  const slotProps = {
    className: cn(
      // Six separate boxes that share the width of the card.
      "h-11 w-auto min-w-0 flex-1 rounded-md border first:rounded-md last:rounded-md text-base",
      // Dark theme: the `input` and `ring` tokens are close to the card colour.
      "dark:border-foreground/30 dark:data-[active=true]:border-foreground/70 dark:data-[active=true]:ring-foreground/25",
      "dark:aria-invalid:border-destructive-foreground dark:data-[active=true]:aria-invalid:border-destructive-foreground dark:aria-invalid:ring-destructive-foreground/30 dark:data-[active=true]:aria-invalid:ring-destructive-foreground/30",
      slotClassName,
    ),
    style: slotStyle,
    "aria-invalid": invalid ? true : undefined,
  } as const;

  return (
    <InputOTP
      ref={setInput}
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
      containerClassName={cn("w-full", className)}
    >
      <InputOTPGroup className="w-full gap-1.5 sm:gap-2">
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <InputOTPSlot key={index} index={index} {...slotProps} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
