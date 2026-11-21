/**
 * The cart's icons, as inline SVG (plan part 3 §3.3): no icon library in the
 * cart path. Each takes `currentColor`, is hidden from assistive technology
 * and gets its size from `cart.css` (`.bsc-icon`, or the class passed in).
 */
function Icon({
  className = "bsc-icon",
  strokeWidth = 2,
  children,
}: {
  className?: string;
  strokeWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const MinusIcon = () => (
  <Icon className="bsc-icon bsc-icon-sm">
    <path d="M5 12h14" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon className="bsc-icon bsc-icon-sm">
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon strokeWidth={1.7}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Icon>
);

/** The placeholder tile of a line without an image. */
export const ImageIcon = () => (
  <Icon className="bsc-icon bsc-icon-lg" strokeWidth={1.5}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M20.5 16l-5-5-8.5 8.5" />
  </Icon>
);

export const AlertIcon = ({ className = "bsc-icon bsc-icon-sm" }: { className?: string }) => (
  <Icon className={className} strokeWidth={1.8}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16.5v.01" />
  </Icon>
);

/** The empty cart. */
export const BagIcon = () => (
  <Icon className="bsc-icon bsc-state-icon" strokeWidth={1.5}>
    <path d="M5 8h14l-1 12H6L5 8z" />
    <path d="M9 8a3 3 0 0 1 6 0" />
  </Icon>
);
