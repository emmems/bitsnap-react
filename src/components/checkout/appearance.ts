import type { CSSProperties } from "react";

/**
 * Checkout appearance API.
 *
 * `CheckoutAppearance` is resolved once per render into plain data: a theme
 * name, the tokens that are actually in effect, the per-slot overrides and the
 * inline style that both theme boundaries (the drawer root and the portalled
 * country dropdown) have to receive. Everything here is pure so it can be
 * tested without a DOM.
 *
 * Backward compatibility: the resolver never invents values. A token is only
 * present in the resolved output when the caller provided it or when the
 * caller explicitly selected a theme preset, so every unset token keeps falling
 * back to the value the checkout renders today (see `checkout.css`).
 */

export type CheckoutTheme = "dark" | "light";

export type CheckoutAppearanceTokens = {
  /** Checkout wide font family. The library never loads fonts. */
  fontFamily?: string;
  /** Base font size of the checkout. */
  fontSize?: string;
  /** Panel background. */
  background?: string;
  /** Raised surfaces: country dropdown, search bar, loading skeletons. */
  surface?: string;
  /** Main text color. */
  foreground?: string;
  /** Secondary text: empty cart, delivery info, country label, search input. */
  mutedForeground?: string;
  /** Borders: country trigger, dropdown, product separators. */
  border?: string;
  /** Checkout button background. */
  buttonBackground?: string;
  /** Checkout button text. */
  buttonForeground?: string;
  /** Checkout button background on hover. */
  buttonHoverBackground?: string;
  /** Hover and selected surfaces: close button, country options. */
  hoverSurface?: string;
  /** Focus ring color. Also applied to shared UI primitives through `--ring`. */
  focusRing?: string;
  /** Error and unavailable state color. */
  error?: string;
  /** Drawer backdrop color. */
  overlay?: string;
  /** Corner radius, applied through `--radius`. */
  radius?: string;
};

/**
 * Stable slot names. They are exposed as `data-bitsnap-checkout-slot`
 * attributes so they can also be targeted from plain CSS.
 */
export const CHECKOUT_SLOT_NAMES = [
  "root",
  "overlay",
  "panel",
  "header",
  "title",
  "closeButton",
  "productList",
  "product",
  "productImage",
  "productName",
  "productPrice",
  "quantityControl",
  "quantityInput",
  "quantityButton",
  "removeButton",
  "summary",
  "totalLabel",
  "totalValue",
  "deliveryText",
  "countryLabel",
  "countryTrigger",
  "countryDropdown",
  "countrySearch",
  "countryOption",
  "paymentButtons",
  "checkoutButton",
  "emptyState",
  "error",
  "skeleton",
] as const;

export type CheckoutSlotName = (typeof CHECKOUT_SLOT_NAMES)[number];

export type CheckoutSlotAppearance = {
  /** Merged after the built-in classes with `cn`, so Tailwind conflicts resolve. */
  className?: string;
  /** Merged after the built-in inline styles. */
  style?: CSSProperties;
};

export type CheckoutAppearanceElements = Partial<
  Record<CheckoutSlotName, CheckoutSlotAppearance>
>;

export type CheckoutAppearance = {
  /**
   * `"dark"` keeps the current presentation, `"light"` applies the light preset.
   * Omitted means `"dark"`.
   */
  theme?: CheckoutTheme;
  /** Partial overrides. Anything omitted keeps today's value. */
  tokens?: CheckoutAppearanceTokens;
  /** Per element `className`/`style` overrides. */
  elements?: CheckoutAppearanceElements;
};

export type ResolvedCheckoutAppearance = {
  theme: CheckoutTheme;
  /**
   * `true` as soon as the caller passed anything through `appearance`. The
   * country dropdown is portalled outside of the checkout root, so it only
   * receives the checkout boundary when the caller opted in - an omitted or
   * empty `appearance` keeps the previous (unthemed) dropdown untouched.
   */
  isCustomized: boolean;
  /** Tokens that are in effect. Empty entries were dropped. */
  tokens: CheckoutAppearanceTokens;
  elements: CheckoutAppearanceElements;
  /** Theme marker class for the theme boundaries. */
  boundaryClassName: string;
  /** Inline custom properties applied to the drawer root. */
  boundaryStyle: CSSProperties;
  /**
   * Extra properties for the portalled country dropdown. The shared select
   * content paints itself with `bg-popover`/`text-popover-foreground`, so those
   * variables have to carry the checkout colors over to the portal. They are
   * resolved eagerly because the dropdown is the only place where the built-in
   * defaults differ from the drawer.
   */
  dropdownStyle: CSSProperties;
};

/** CSS custom property used for each token. */
export const CHECKOUT_TOKEN_VARIABLES = {
  fontFamily: "--bitsnap-checkout-font-family",
  fontSize: "--bitsnap-checkout-font-size",
  background: "--bitsnap-checkout-background",
  surface: "--bitsnap-checkout-surface",
  foreground: "--bitsnap-checkout-foreground",
  mutedForeground: "--bitsnap-checkout-muted-foreground",
  border: "--bitsnap-checkout-border",
  buttonBackground: "--bitsnap-checkout-button-background",
  buttonForeground: "--bitsnap-checkout-button-foreground",
  buttonHoverBackground: "--bitsnap-checkout-button-hover-background",
  hoverSurface: "--bitsnap-checkout-hover-surface",
  focusRing: "--bitsnap-checkout-focus-ring",
  error: "--bitsnap-checkout-error",
  overlay: "--bitsnap-checkout-overlay",
  radius: "--bitsnap-checkout-radius",
} as const;

export type CheckoutTokenName = keyof typeof CHECKOUT_TOKEN_VARIABLES;

/**
 * Theme presets are intentionally partial. `"dark"` is empty because every
 * default already renders the current dark presentation; `"light"` only carries
 * the colors that have to change for a light checkout, so typography is never
 * reset implicitly.
 */
export const CHECKOUT_THEME_PRESETS: Record<
  CheckoutTheme,
  CheckoutAppearanceTokens
> = {
  dark: {},
  light: {
    background: "#ffffff",
    surface: "#f9fafb",
    foreground: "#18181b",
    mutedForeground: "#71717a",
    border: "#e4e4e7",
    buttonBackground: "#18181b",
    buttonForeground: "#fafafa",
    buttonHoverBackground: "#000000",
    hoverSurface: "#e4e4e7",
    focusRing: "#71717a",
    error: "#dc2626",
    overlay: "rgb(0 0 0 / 0.35)",
  },
};

/**
 * Some shared UI primitives (`Button`, `SelectTrigger`, ...) read the shadcn
 * theme variables instead of checkout tokens. Those are remapped so a themed
 * dropdown and themed primitives stay consistent. They are only written when
 * the matching token is in effect, so untouched tokens change nothing.
 */
const CHECKOUT_SHADCN_VARIABLES: {
  token: CheckoutTokenName;
  variable: string;
}[] = [
  { token: "background", variable: "--background" },
  { token: "foreground", variable: "--foreground" },
  { token: "surface", variable: "--card" },
  { token: "surface", variable: "--popover" },
  { token: "foreground", variable: "--popover-foreground" },
  { token: "mutedForeground", variable: "--muted-foreground" },
  { token: "border", variable: "--border" },
  { token: "border", variable: "--input" },
  { token: "focusRing", variable: "--ring" },
  { token: "error", variable: "--destructive" },
  { token: "radius", variable: "--radius" },
];

function omitUndefined(
  tokens: CheckoutAppearanceTokens,
): CheckoutAppearanceTokens {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(tokens)) {
    if (value != null) {
      result[key] = value;
    }
  }

  return result as CheckoutAppearanceTokens;
}

function hasAnyElement(elements: CheckoutAppearanceElements): boolean {
  return Object.values(elements).some(
    (element) =>
      element != null &&
      (element.className != null || element.style != null),
  );
}

function resolveBoundaryStyle(tokens: CheckoutAppearanceTokens): CSSProperties {
  const style: Record<string, string> = {};

  for (const [token, variable] of Object.entries(CHECKOUT_TOKEN_VARIABLES)) {
    const value = tokens[token as CheckoutTokenName];
    if (value != null) {
      style[variable] = value;
    }
  }

  for (const { token, variable } of CHECKOUT_SHADCN_VARIABLES) {
    const value = tokens[token];
    if (value != null) {
      style[variable] = value;
    }
  }

  return style as CSSProperties;
}

/**
 * The portalled dropdown renders `bg-popover`/`text-popover-foreground` from the
 * shared primitives, so those two variables are resolved eagerly: without a
 * token they fall back to the dark values the checkout has always used.
 */
function resolveDropdownStyle(tokens: CheckoutAppearanceTokens): CSSProperties {
  return {
    "--popover": tokens.surface ?? "var(--color-neutral-800)",
    "--popover-foreground": tokens.foreground ?? "var(--color-neutral-200)",
  } as CSSProperties;
}

export function resolveCheckoutAppearance(
  appearance?: CheckoutAppearance,
): ResolvedCheckoutAppearance {
  const theme: CheckoutTheme = appearance?.theme ?? "dark";

  const tokens = omitUndefined({
    ...CHECKOUT_THEME_PRESETS[theme],
    ...appearance?.tokens,
  });

  const elements = appearance?.elements ?? {};

  return {
    theme,
    isCustomized:
      appearance?.theme != null ||
      Object.keys(tokens).length > 0 ||
      hasAnyElement(elements),
    tokens,
    elements,
    boundaryClassName: theme,
    boundaryStyle: resolveBoundaryStyle(tokens),
    dropdownStyle: resolveDropdownStyle(tokens),
  };
}

/** Caller overrides for a single slot, if any were provided. */
export function getCheckoutSlotAppearance(
  resolved: ResolvedCheckoutAppearance,
  slot: CheckoutSlotName,
): CheckoutSlotAppearance | undefined {
  return resolved.elements[slot];
}
