function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={"bg-neutral-700 animate-pulse rounded-md" + ' ' + className}
      {...props}
    />
  );
}

export { Skeleton };
