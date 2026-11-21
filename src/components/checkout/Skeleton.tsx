import type { CSSProperties } from "react";
import { cx } from "./lib/cx";

type SlotProps = { className?: string; style?: CSSProperties };

/** A pulsing placeholder bar; `cart.css` (`.bsc-pulse`) gives it the per-theme fill. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={className ? `bsc-pulse ${className}` : "bsc-pulse"}
      {...props}
    />
  );
}

/**
 * A placeholder shaped like a cart line (72 px tile, name, price, stepper).
 * The wrapper (`.bsc-skeleton`) shows after 150 ms, so a quick answer never
 * flashes it (F-05); the bars inside it pulse.
 */
function LineSkeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      data-bitsnap-checkout-slot="skeleton"
      aria-hidden="true"
      className={className ? `bsc-skeleton bsc-skeleton-line ${className}` : "bsc-skeleton bsc-skeleton-line"}
      style={style}
    >
      <Skeleton className="bsc-skeleton-thumb" />
      <Skeleton className="bsc-skeleton-bar bsc-skeleton-name" />
      <Skeleton className="bsc-skeleton-bar bsc-skeleton-price" />
      <Skeleton className="bsc-skeleton-bar bsc-skeleton-meta" />
      <Skeleton className="bsc-skeleton-stepper" />
    </div>
  );
}

/**
 * The footer while the cart loads: a total bar and the 52 px button block, in
 * the footer's grid row. The whole footer waits the same 150 ms as the lines.
 */
function FooterSkeleton({
  footer,
  skeleton,
}: {
  /** The `footer` slot: the same box as the loaded footer. */
  footer: SlotProps;
  /** The `skeleton` slot: the bars inside it. */
  skeleton: SlotProps;
}) {
  return (
    <div
      data-bitsnap-checkout-slot="footer"
      aria-hidden="true"
      className={cx("bsc-footer bsc-skeleton", footer.className)}
      style={footer.style}
    >
      <div
        data-bitsnap-checkout-slot="skeleton"
        className={cx("bsc-skeleton-footer", skeleton.className)}
        style={skeleton.style}
      >
        <Skeleton className="bsc-skeleton-total" />
        <Skeleton className="bsc-skeleton-cta" />
      </div>
    </div>
  );
}

export { FooterSkeleton, LineSkeleton, Skeleton };
