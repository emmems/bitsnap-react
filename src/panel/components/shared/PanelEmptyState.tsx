import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

export type PanelEmptyStateProps = {
  /** Decorative icon (e.g. a lucide icon); hidden from screen readers. */
  icon?: ReactNode;
  /** Headline: what is (not) here. */
  title: string;
  /** One sentence: why, or what the buyer can do. */
  description?: ReactNode;
  /** One action: a button or a link. */
  action?: ReactNode;
  /** Heading level of `title`. Default 2. */
  headingLevel?: 2 | 3;
  /** `"status"` announces the state when it appears (errors after a retry). */
  role?: "status" | "alert";
  className?: string;
};

/**
 * Empty, unavailable or error state of a panel section: icon, headline,
 * one sentence and at most one action, centred on the panel surface.
 *
 * Props: `icon`, `title`, `description`, `action`, `headingLevel`, `role`,
 * `className`.
 */
export function PanelEmptyState({
  icon,
  title,
  description,
  action,
  headingLevel = 2,
  role,
  className,
}: PanelEmptyStateProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-dashed border-(--panel-border) bg-(--panel-surface) px-6 py-10 text-center text-(--panel-fg)",
        className,
      )}
    >
      {icon != null && (
        <div
          aria-hidden="true"
          className="mb-1 flex size-10 items-center justify-center rounded-full bg-(--panel-surface-2) text-(--panel-muted) [&_svg]:size-5"
        >
          {icon}
        </div>
      )}
      <Heading className="text-base font-semibold">{title}</Heading>
      {description != null && (
        <p className="max-w-sm text-sm text-(--panel-muted)">{description}</p>
      )}
      {action != null && <div className="mt-3">{action}</div>}
    </div>
  );
}
