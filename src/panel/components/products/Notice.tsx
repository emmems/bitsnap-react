import { CircleAlert, Info, RefreshCw, TriangleAlert, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

const TONES = {
  danger: {
    box: "bg-(--panel-danger-bg) text-(--panel-fg)",
    icon: "text-(--panel-danger)",
    Icon: CircleAlert,
  },
  warn: {
    box: "bg-(--panel-warn-bg) text-(--panel-fg)",
    icon: "text-(--panel-warn)",
    Icon: TriangleAlert,
  },
  offline: {
    box: "bg-(--panel-warn-bg) text-(--panel-fg)",
    icon: "text-(--panel-warn)",
    Icon: WifiOff,
  },
  info: {
    box: "bg-(--panel-info-bg) text-(--panel-fg)",
    icon: "text-(--panel-info)",
    Icon: Info,
  },
} as const;

/**
 * Inline state of a section (load error, partial data, offline): icon,
 * one bold line, an optional sentence and an optional action. Semantic
 * colours from the panel tokens, never the brand.
 */
export function Notice({
  tone,
  title,
  description,
  action,
  role,
  className,
}: {
  tone: keyof typeof TONES;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
  className?: string;
}) {
  const { box, icon, Icon } = TONES[tone];
  return (
    <div
      role={role}
      data-notice={tone}
      className={cn("flex gap-3 rounded-lg p-3 text-sm sm:p-4", box, className)}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", icon)} aria-hidden="true" />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <p className="font-semibold">{title}</p>
        {description != null && (
          <p className="text-(--panel-muted)">{description}</p>
        )}
        {action != null && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

/** Secondary "Spróbuj ponownie" button used by every product state. */
export function RetryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-(--panel-border) bg-(--panel-surface) px-4 text-sm font-semibold text-(--panel-fg) hover:bg-(--panel-surface-2) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)"
    >
      <RefreshCw className="size-4" aria-hidden="true" />
      {children}
    </button>
  );
}

/** Brand-coloured primary action (a link or a button). */
export const PRIMARY_ACTION_CLASSES =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-(--panel-accent-edge-now) bg-(--panel-accent-now) px-4 text-sm font-semibold text-(--panel-accent-fg-now) hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)";

/** Quiet secondary action next to a primary one. */
export const SECONDARY_ACTION_CLASSES =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-(--panel-fg) hover:bg-(--panel-surface-2) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)";

/** Grey placeholder block; no pulse under reduced motion. */
export const SKELETON_CLASSES =
  "animate-pulse rounded bg-(--panel-surface-2) motion-reduce:animate-none";
