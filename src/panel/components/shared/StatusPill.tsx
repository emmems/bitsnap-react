import { cn } from "../../../lib/utils";
import { getPanelTexts, orderStatusLabel, type PanelTexts } from "../../texts";

/** Semantic colour of a status. Never the brand colour. */
export type StatusVariant = "ok" | "info" | "warn" | "danger" | "neutral";

const STATUS_VARIANTS: Record<string, StatusVariant> = {
  paid: "ok",
  completed: "ok",
  processing: "info",
  sent: "info",
  unpaid: "warn",
  issue: "warn",
  overdue: "danger",
  draft: "neutral",
  created: "neutral",
  cancelled: "neutral",
  canceled: "neutral",
  refunded: "neutral",
  returned: "neutral",
};

/** Variant of a raw order status code; unknown codes are neutral. */
export function orderStatusVariant(status: string): StatusVariant {
  return STATUS_VARIANTS[status.trim().toLowerCase()] ?? "neutral";
}

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  ok: "bg-(--panel-ok-bg) text-(--panel-ok)",
  info: "bg-(--panel-info-bg) text-(--panel-info)",
  warn: "bg-(--panel-warn-bg) text-(--panel-warn)",
  danger: "bg-(--panel-danger-bg) text-(--panel-danger)",
  neutral: "bg-(--panel-surface-2) text-(--panel-muted)",
};

export type StatusPillProps = {
  /** Raw order status code (`paid`, `canceled`, ...). Unknown codes show as-is. */
  status: string;
  /** Text table; defaults to the library locale. */
  texts?: PanelTexts;
  /** Overrides the computed variant. */
  variant?: StatusVariant;
  /** Overrides the label (for statuses that are not order statuses). */
  label?: string;
  className?: string;
};

/**
 * Status badge with semantic colours (AA in light and dark) for every order
 * status in `panel/texts.ts`; `cancelled` and `canceled` share one look.
 * An unknown status gets a neutral pill with its raw text.
 *
 * Props: `status`, optional `texts`, `variant`, `label`, `className`.
 */
export function StatusPill({
  status,
  texts = getPanelTexts(),
  variant,
  label,
  className,
}: StatusPillProps) {
  const resolved = variant ?? orderStatusVariant(status);
  const text = label ?? orderStatusLabel(status, texts) ?? status;
  return (
    <span
      data-status-variant={resolved}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        VARIANT_CLASSES[resolved],
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {text}
    </span>
  );
}
