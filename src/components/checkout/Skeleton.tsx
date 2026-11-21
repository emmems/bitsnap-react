import type { CSSProperties } from "react";

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

export { LineSkeleton, Skeleton };
