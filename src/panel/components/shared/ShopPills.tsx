import type { FocusEvent } from "react";
import { cn } from "../../../lib/utils";
import type { ShopOption } from "../../shop-filter";
import { ShopAvatar } from "./ShopAvatar";

export type ShopPillsProps = {
  shops: readonly ShopOption[];
  /** Currently selected shop id, or `undefined` for "All". */
  value: string | undefined;
  onChange: (projectId: string | undefined) => void;
  /** Accessible name of the filter group (`shopFilterLabel`). */
  label: string;
  /** Label of the first "all shops" pill (`shopFilterAll`). */
  allLabel: string;
  /** Optional fallback name when a shop's name is empty (`shopUnknown`). */
  unknownShopLabel?: string;
  /** Optional total count shown on the "All" pill. */
  allCount?: number;
  /**
   * Result count announced in a polite live region when the selection changes.
   */
  countText?: string;
  /** Keep the live region screen-reader only when the page renders the count elsewhere. */
  srOnlyCount?: boolean;
  className?: string;
};

const PILL_BASE =
  "inline-flex min-h-11 sm:min-h-9 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 sm:px-3 text-sm transition-colors duration-150 motion-reduce:transition-none cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)";

const PILL_SELECTED =
  "border-(--panel-fg) bg-(--panel-surface-2) font-semibold text-(--panel-fg)";

const PILL_UNSELECTED =
  "border-(--panel-border) bg-(--panel-surface) font-medium text-(--panel-muted) hover:border-(--panel-muted) hover:text-(--panel-fg)";

function revealOnFocus(event: FocusEvent<HTMLButtonElement>) {
  event.currentTarget.scrollIntoView?.({ inline: "nearest", block: "nearest" });
}

/**
 * Horizontal shop filter pills for the global customer panel (Library and Orders).
 * Uses `role="group"` + `<button aria-pressed>` (not a tablist), plain Tab order,
 * and hides itself when fewer than 2 shops exist.
 */
export function ShopPills({
  shops,
  value,
  onChange,
  label,
  allLabel,
  unknownShopLabel = "Sklep",
  allCount,
  countText,
  srOnlyCount = false,
  className,
}: ShopPillsProps) {
  if (shops.length < 2) return null;

  const isAll = value == null;

  return (
    <div className={cn("min-w-0", className)} data-shop-pills="">
      <div className="relative">
        <div
          role="group"
          aria-label={label}
          className="flex items-center gap-2 overflow-x-auto snap-x snap-proximity py-1 pr-6 sm:flex-wrap sm:overflow-visible sm:pr-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <button
            type="button"
            aria-pressed={isAll}
            onClick={() => onChange(undefined)}
            onFocus={revealOnFocus}
            className={cn(PILL_BASE, isAll ? PILL_SELECTED : PILL_UNSELECTED)}
          >
            <span className="max-w-[12rem] truncate" title={allLabel}>
              {allLabel}
            </span>
            {allCount != null && (
              <span className="text-xs font-normal tabular-nums text-(--panel-muted)">
                {allCount}
              </span>
            )}
          </button>

          {shops.map((shop) => {
            const selected = value === shop.projectId;
            const displayName = shop.name.trim() || unknownShopLabel;
            return (
              <button
                key={shop.projectId}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(shop.projectId)}
                onFocus={revealOnFocus}
                className={cn(
                  PILL_BASE,
                  selected ? PILL_SELECTED : PILL_UNSELECTED,
                )}
              >
                <ShopAvatar
                  name={displayName}
                  imageUrl={shop.imageUrl}
                  imageDarkUrl={shop.imageDarkUrl}
                  size="sm"
                />
                <span className="max-w-[12rem] truncate" title={displayName}>
                  {displayName}
                </span>
                {shop.count != null && (
                  <span className="text-xs font-normal tabular-nums text-(--panel-muted)">
                    {shop.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-(--panel-bg) to-transparent sm:hidden"
        />
      </div>
      {countText != null && (
        <p
          aria-live="polite"
          data-shop-pills-count=""
          className={
            srOnlyCount
              ? "sr-only"
              : "mt-1.5 text-sm text-(--panel-muted) tabular-nums"
          }
        >
          {countText}
        </p>
      )}
    </div>
  );
}
