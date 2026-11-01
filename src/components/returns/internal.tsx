import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/src/ui/button";
import { Skeleton } from "@/src/ui/skeleton";
import { cn } from "@/src/lib/utils";
import { useReturnsSlot } from "./appearance.context";
import { refundStatusTextKey, statusTextKey, type ReturnsTextKey } from "./texts";
import { useReturnsText } from "./texts.context";

/*
 * Built-in colors read the returns tokens through arbitrary values. They are
 * utilities, so `twMerge` replaces the primitive's own `bg-primary`/`dark:`
 * classes and the tokens win in both themes. Slot overrides are merged last.
 */

export const PRIMARY_BUTTON_CLASS =
  "bg-[var(--bitsnap-returns-button-background,#18181b)] text-[color:var(--bitsnap-returns-button-foreground,#fafafa)] hover:bg-[var(--bitsnap-returns-button-hover-background,#000000)] focus-visible:ring-[color:var(--bitsnap-returns-focus-ring,#71717a)]/50";

export const SECONDARY_BUTTON_CLASS =
  "border border-[color:var(--bitsnap-returns-border,#e4e4e7)] bg-transparent text-[color:var(--bitsnap-returns-foreground,#18181b)] hover:bg-[var(--bitsnap-returns-hover-surface,#f4f4f5)] focus-visible:ring-[color:var(--bitsnap-returns-focus-ring,#71717a)]/50";

export const INPUT_CLASS =
  "bg-[var(--bitsnap-returns-input-background,#ffffff)] dark:bg-[var(--bitsnap-returns-input-background,#ffffff)] border-[color:var(--bitsnap-returns-border,#e4e4e7)] text-[color:var(--bitsnap-returns-foreground,#18181b)] placeholder:text-[color:var(--bitsnap-returns-muted-foreground,#71717a)] focus-visible:border-[color:var(--bitsnap-returns-focus-ring,#71717a)] focus-visible:ring-[color:var(--bitsnap-returns-focus-ring,#71717a)]/50";

/**
 * Slots of the one-time-code field: the input colors plus the focused slot's
 * border and ring, which `InputOTPSlot` draws from `data-active`.
 */
export const OTP_SLOT_CLASS = cn(
  INPUT_CLASS,
  "data-[active=true]:border-[color:var(--bitsnap-returns-focus-ring,#71717a)] data-[active=true]:ring-[color:var(--bitsnap-returns-focus-ring,#71717a)]/50",
);

export type SlotProps = { className?: string; style?: CSSProperties };

/** Frame shared by every step: back button, title and description. */
export function StepFrame({
  title,
  description,
  onBack,
  lead,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  onBack?: () => void;
  /** Shown above the header, for example the shop logo. */
  lead?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const text = useReturnsText();
  const header = useReturnsSlot("header");
  const titleSlot = useReturnsSlot("title");
  const descriptionSlot = useReturnsSlot("description");
  const backButton = useReturnsSlot("backButton");

  return (
    <section className={cn("flex flex-col gap-5", className)}>
      {lead}
      <div
        data-bitsnap-returns-slot="header"
        className={cn("flex flex-col gap-2", header.className)}
        style={header.style}
      >
        {onBack != null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-bitsnap-returns-slot="backButton"
            className={cn(
              "self-start -ml-3 text-[color:var(--bitsnap-returns-muted-foreground,#71717a)] hover:bg-[var(--bitsnap-returns-hover-surface,#f4f4f5)]",
              backButton.className,
            )}
            style={backButton.style}
            onClick={onBack}
          >
            {text("back")}
          </Button>
        )}
        <h2
          data-bitsnap-returns-slot="title"
          className={cn("text-2xl font-semibold", titleSlot.className)}
          style={titleSlot.style}
        >
          {title}
        </h2>
        {description != null && (
          <p
            data-bitsnap-returns-slot="description"
            className={cn("text-sm", descriptionSlot.className)}
            style={descriptionSlot.style}
          >
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Error message with an optional retry action. */
export function ErrorMessage({
  errorKey,
  onRetry,
}: {
  errorKey: ReturnsTextKey;
  onRetry?: () => void;
}) {
  const text = useReturnsText();
  const error = useReturnsSlot("error");
  const secondaryButton = useReturnsSlot("secondaryButton");

  return (
    <div
      role="alert"
      data-bitsnap-returns-slot="error"
      className={cn("flex flex-col items-start gap-2 text-sm", error.className)}
      style={error.style}
    >
      <p>{text(errorKey)}</p>
      {onRetry != null && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-bitsnap-returns-slot="secondaryButton"
          className={cn(SECONDARY_BUTTON_CLASS, secondaryButton.className)}
          style={secondaryButton.style}
          onClick={onRetry}
        >
          {text("errorRetry")}
        </Button>
      )}
    </div>
  );
}

/** Empty list placeholder. */
export function EmptyState({ children }: { children: ReactNode }) {
  const emptyState = useReturnsSlot("emptyState");

  return (
    <p
      data-bitsnap-returns-slot="emptyState"
      className={cn("py-6 text-center text-sm", emptyState.className)}
      style={emptyState.style}
    >
      {children}
    </p>
  );
}

/** Loading placeholder. `aria-busy` marks the region for assistive tech. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  const text = useReturnsText();
  const skeleton = useReturnsSlot("skeleton");

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={text("loading")}
      className="flex flex-col gap-3"
    >
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          key={index}
          data-bitsnap-returns-slot="skeleton"
          className={cn(
            "h-16 w-full bg-[var(--bitsnap-returns-hover-surface,#f4f4f5)]",
            skeleton.className,
          )}
          style={skeleton.style}
        />
      ))}
    </div>
  );
}

/** Status chip of a return request. Unknown statuses use the fallback text. */
export function StatusBadge({ status }: { status: string }) {
  const text = useReturnsText();
  const badge = useReturnsSlot("statusBadge");

  return (
    <span
      data-bitsnap-returns-slot="statusBadge"
      data-status={status}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        badge.className,
      )}
      style={badge.style}
    >
      {text(statusTextKey(status))}
    </span>
  );
}

/** Text of a refund status. */
export function useRefundStatusText(): (status: string) => string {
  const text = useReturnsText();

  return (status) => text(refundStatusTextKey(status));
}

/** Previous/next controls for paged lists. */
export function Pagination({
  page,
  total,
  hasNext,
  hasPrevious,
  isFetching,
  onNext,
  onPrevious,
}: {
  page: number;
  total: number;
  hasNext: boolean;
  hasPrevious: boolean;
  isFetching: boolean;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const text = useReturnsText();
  const pagination = useReturnsSlot("pagination");
  const secondaryButton = useReturnsSlot("secondaryButton");

  if (!hasNext && !hasPrevious) {
    return null;
  }

  return (
    <nav
      data-bitsnap-returns-slot="pagination"
      className={cn(
        "flex items-center justify-between gap-3 text-sm",
        pagination.className,
      )}
      style={pagination.style}
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        data-bitsnap-returns-slot="secondaryButton"
        className={cn(SECONDARY_BUTTON_CLASS, secondaryButton.className)}
        style={secondaryButton.style}
        disabled={!hasPrevious || isFetching}
        onClick={onPrevious}
      >
        {text("paginationPrevious")}
      </Button>
      <span aria-live="polite">{text("paginationInfo", { page, total })}</span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        data-bitsnap-returns-slot="secondaryButton"
        className={cn(SECONDARY_BUTTON_CLASS, secondaryButton.className)}
        style={secondaryButton.style}
        disabled={!hasNext || isFetching}
        onClick={onNext}
      >
        {text("paginationNext")}
      </Button>
    </nav>
  );
}
