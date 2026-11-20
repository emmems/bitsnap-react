import type { CSSProperties } from "react";
import {
  getSlotAppearance,
  resolveAppearanceCore,
  type AppearanceElements,
  type ShadcnVariableMapping,
  type SlotAppearance,
} from "@/src/lib/appearance-core";

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
  /** Raised surfaces: country dropdown, search bar, selected payment method. */
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
  /** Sale price of a discounted line. Default `#f87171` (dark), `#b91c1c` (light). */
  sale?: string;
  /**
   * Drawer width from the `md` breakpoint up (any CSS length, also
   * `var(--your-variable)`). Phones keep the full screen width.
   */
  panelWidth?: string;
  /**
   * Base duration of the cart's enter and exit animations (default `240ms`).
   * `"0ms"`, `"0s"` or `"0"` turns the cart's own animations off.
   */
  motionDuration?: string;
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
  "summaryNote",
  "countryLabel",
  "countryTrigger",
  "countryDropdown",
  "countrySearch",
  "countryOption",
  "paymentButtons",
  "paymentMethods",
  "paymentMethodOption",
  "checkoutButton",
  "emptyState",
  "error",
  "skeleton",
] as const;

export type CheckoutSlotName = (typeof CHECKOUT_SLOT_NAMES)[number];

export type CheckoutSlotAppearance = SlotAppearance;

export type CheckoutAppearanceElements = AppearanceElements<CheckoutSlotName>;

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

export type CheckoutBoundaryAttributes = {
  "data-bitsnap-checkout-motion"?: "off";
};

export type ResolvedCheckoutAppearance = {
  theme: CheckoutTheme;
  /** `true` as soon as the caller passed anything through `appearance`. */
  isCustomized: boolean;
  /** Tokens that are in effect. Empty entries were dropped. */
  tokens: CheckoutAppearanceTokens;
  elements: CheckoutAppearanceElements;
  /** Theme marker class for the theme boundaries. */
  boundaryClassName: string;
  /** Inline custom properties applied to the drawer root. */
  boundaryStyle: CSSProperties;
  /**
   * Data attributes for the drawer root. `data-bitsnap-checkout-motion="off"`
   * is set only when the `motionDuration` token is zero: CSS cannot test the
   * value of a variable, so the stylesheet keys the motion-off rule on it.
   */
  boundaryAttributes: CheckoutBoundaryAttributes;
  /**
   * Extra properties for the portalled country dropdown, applied with or
   * without an `appearance`. The dropdown is its own `.bitsnap-react`
   * boundary, where the shared shadcn variables hold their light defaults, so
   * the ones its primitives read are resolved eagerly to the checkout colors.
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
  sale: "--bitsnap-checkout-sale",
  panelWidth: "--bitsnap-checkout-panel-width",
  motionDuration: "--bitsnap-checkout-motion-duration",
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
    sale: "#b91c1c",
  },
};

/**
 * Some shared UI primitives (`Button`, `SelectTrigger`, ...) read the shadcn
 * theme variables instead of checkout tokens. Those are remapped so a themed
 * dropdown and themed primitives stay consistent. They are only written when
 * the matching token is in effect, so untouched tokens change nothing.
 */
const CHECKOUT_SHADCN_VARIABLES: ShadcnVariableMapping<CheckoutTokenName> = [
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

/**
 * The portalled dropdown is a `.bitsnap-react` boundary of its own, where the
 * shared shadcn variables hold their light defaults (the `.dark` variant only
 * matches descendants). The variables its primitives read - the popover
 * surface, the highlighted option (`focus:bg-accent`/`text-accent-foreground`)
 * and the search separator (`border-border`) - are resolved eagerly. Without a
 * token they read the `--bitsnap-checkout-*` variable a host may set in its own
 * stylesheet (the dropdown carries `data-bitsnap-checkout`, so such a rule
 * reaches it), then the dark values the checkout has always used.
 */
function resolveDropdownStyle(tokens: CheckoutAppearanceTokens): CSSProperties {
  const fromHost = (variable: string, fallback: string) =>
    `var(${variable}, ${fallback})`;
  return {
    "--popover":
      tokens.surface ??
      fromHost("--bitsnap-checkout-surface", "var(--color-neutral-800)"),
    "--popover-foreground":
      tokens.foreground ??
      fromHost("--bitsnap-checkout-foreground", "var(--color-neutral-200)"),
    "--accent":
      tokens.hoverSurface ??
      fromHost("--bitsnap-checkout-hover-surface", "var(--color-neutral-700)"),
    "--accent-foreground":
      tokens.foreground ??
      fromHost("--bitsnap-checkout-foreground", "var(--color-neutral-200)"),
    "--border":
      tokens.border ??
      fromHost("--bitsnap-checkout-border", "var(--color-neutral-700)"),
  } as CSSProperties;
}

/**
 * `true` for a zero duration (`0`, `0ms`, `0s`, `0.0s`, ...). Any other value,
 * including `var(--host-duration)`, keeps motion on: the token passes through
 * unvalidated and CSS decides.
 */
export function isMotionOff(duration: string | undefined): boolean {
  if (duration == null) {
    return false;
  }
  return /^[+-]?(0+(\.0*)?|\.0+)(ms|s)?$/i.test(duration.trim());
}

export function resolveCheckoutAppearance(
  appearance?: CheckoutAppearance,
): ResolvedCheckoutAppearance {
  const resolved = resolveAppearanceCore<
    CheckoutTokenName,
    CheckoutTheme,
    CheckoutSlotName
  >(appearance, {
    defaultTheme: "dark",
    presets: CHECKOUT_THEME_PRESETS,
    variables: CHECKOUT_TOKEN_VARIABLES,
    shadcnVariables: CHECKOUT_SHADCN_VARIABLES,
  });

  return {
    theme: resolved.theme,
    isCustomized: resolved.isCustomized,
    tokens: resolved.tokens,
    elements: resolved.elements,
    boundaryClassName: resolved.theme,
    boundaryStyle: resolved.boundaryStyle,
    boundaryAttributes: isMotionOff(resolved.tokens.motionDuration)
      ? { "data-bitsnap-checkout-motion": "off" }
      : {},
    dropdownStyle: resolveDropdownStyle(resolved.tokens),
  };
}

/** Caller overrides for a single slot, if any were provided. */
export function getCheckoutSlotAppearance(
  resolved: ResolvedCheckoutAppearance,
  slot: CheckoutSlotName,
): CheckoutSlotAppearance | undefined {
  return getSlotAppearance(resolved.elements, slot);
}
