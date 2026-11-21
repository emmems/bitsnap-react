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

export { Skeleton };
