import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../lib/utils";

const PADDING = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
} as const;

export type PanelCardProps = HTMLAttributes<HTMLElement> & {
  /** Element to render. Default `"div"`; use `"section"` / `"article"` / `"li"` for semantics. */
  as?: "div" | "section" | "article" | "li";
  /** Inner padding. Default `"md"`; `"none"` for edge-to-edge lists. */
  padding?: keyof typeof PADDING;
  children?: ReactNode;
};

/**
 * One card style for the panel: the panel surface with its text colour,
 * a 1 px border and the shared radius, in light and dark (Phase 0 tokens).
 *
 * Props: `as`, `padding`, `className` (merged last) and any HTML attribute.
 */
export function PanelCard({
  as: Tag = "div",
  padding = "md",
  className,
  children,
  ...rest
}: PanelCardProps) {
  return (
    <Tag
      {...rest}
      className={cn(
        "rounded-xl border border-(--panel-border) bg-(--panel-surface) text-(--panel-fg)",
        PADDING[padding],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
