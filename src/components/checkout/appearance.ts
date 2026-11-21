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
 * back to the default in `cart.css`.
 */

export type CheckoutTheme = "dark" | "light";

export type CheckoutAppearanceTokens = {
  /** Checkout wide font family. The library never loads fonts. */
  fontFamily?: string;
  /**
   * Base font size of the checkout (default `16px`). Every text size scales
   * from it (12, 13, 14, 15, 16 and 20 px at the default); controls keep their
   * 44 px touch targets.
   */
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
  /**
   * Outline of the controls: quantity stepper, country select, payment-method
   * cards and radios, the retry and empty-cart buttons, notices. Default
   * `#737373` (dark), `#8a8a8a` (light): keep it at 3:1 against the panel.
   */
  controlBorder?: string;
  /** Fill of the loading placeholders. Default `#333333` (dark), `#d4d4d8` (light). */
  skeleton?: string;
  /**
   * `color-scheme` of the cart (`"light"` or `"dark"`): scrollbars and the
   * native country list. Default: from a hex `background` token, else the theme.
   */
  colorScheme?: string;
  /** Error and unavailable state color. */
  error?: string;
  /** Backdrop color behind the cart. */
  overlay?: string;
  /** Corner radius, applied through `--radius`. */
  radius?: string;
  /**
   * Corners of the dialog (default `radius` + 4 px) and the top corners of the
   * bottom sheet (default `radius` + 8 px). The drawer has none.
   */
  panelRadius?: string;
  /**
   * Corners of the controls: country select, payment-method cards and the
   * quantity stepper. Default `radius`; the stepper is a pill (`9999px`).
   */
  controlRadius?: string;
  /**
   * Corners of the buttons: checkout, "Continue shopping", retry and the empty
   * cart's button. Default `radius`; `"9999px"` makes them pills.
   */
  buttonRadius?: string;
  /** Font size of the checkout button. Default: `fontSize` (`16px`). */
  buttonFontSize?: string;
  /** Shadow of the dialog and the bottom sheet; `"none"` removes it. */
  panelShadow?: string;
  /** Sale price of a discounted line. Default `#f87171` (dark), `#b91c1c` (light). */
  sale?: string;
  /**
   * Width of the cart (any CSS length, also `var(--your-variable)`): the
   * drawer's from 640 px up (default 380 px, 420 px from 1200 px), or the
   * dialog's (default 480 px, never wider than the screen minus 32 px). The
   * compact layout (phones, also in landscape) keeps the full screen width.
   */
  panelWidth?: string;
  /**
   * Height cap of `presentation="dialog"` (default
   * `min(100dvh - 48px, 704px)`). The bottom sheet of the compact layout
   * also stays under it, and under 92 % of the screen. The drawer ignores it.
   */
  panelMaxHeight?: string;
  /**
   * Base duration of the cart's enter and exit animations (default `240ms`):
   * the drawer's fade and slide read it. `"0ms"`, `"0s"` or `"0"` turns the
   * cart's own animations off. Under `prefers-reduced-motion: reduce` the
   * drawer only fades, for at most `120ms`.
   */
  motionDuration?: string;
  /**
   * Height of the payment logos in the payment-method cards (default `20px`).
   * Their width follows each logo's aspect ratio.
   */
  paymentLogoHeight?: string;
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
  /** The scroll region: lines and the options under them. */
  "lines",
  "product",
  "productImage",
  "productName",
  /** The variant under the name; not rendered when it equals the name. */
  "productVariant",
  /** "49,90 zł × 2" under the name, for a quantity above 1. */
  "productUnitPrice",
  /** The line total block (struck regular price and sale price when on sale). */
  "productPrice",
  "quantityControl",
  "quantityInput",
  "quantityButton",
  "removeButton",
  /** The options block in the scroll region: express row, divider, country, payment methods. */
  "options",
  /** The footer: total, note, checkout button and its hint and error. Always visible. */
  "footer",
  "summary",
  "totalLabel",
  "totalValue",
  /** Accepted, renders nothing since 1.32.0. */
  "deliveryText",
  "summaryNote",
  "countryLabel",
  /** The native country `<select>`. */
  "countryTrigger",
  /** Accepted, renders nothing since 1.32.0 (native select, PLAN D4). */
  "countryDropdown",
  /** Accepted, renders nothing since 1.32.0 (native select, PLAN D4). */
  "countrySearch",
  /** Accepted, renders nothing since 1.32.0 (native select, PLAN D4). */
  "countryOption",
  "paymentButtons",
  "paymentMethods",
  "paymentMethodOption",
  /** The row of logos in a payment method card; only when the server sent logos for it. */
  "paymentMethodLogos",
  /** One logo in that row (its `<span>`; `.bsc-method-logo-chip` when drawn for white). */
  "paymentMethodLogo",
  /** The checkout button only; the retry buttons have `retryButton` since 1.32.0. */
  "checkoutButton",
  /** "Try again" after a failed load. */
  "retryButton",
  "emptyState",
  /** "Continue shopping" in the empty cart; closes it. */
  "emptyAction",
  /** "Continue shopping" under the checkout button of `presentation="dialog"`; closes the cart. */
  "continueShopping",
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
  /**
   * Inline custom properties applied to the drawer root, plus `color-scheme`
   * when the effective `background` token is a hex colour and no
   * `colorScheme` token is set.
   */
  boundaryStyle: CSSProperties;
  /**
   * Data attributes for the drawer root. `data-bitsnap-checkout-motion="off"`
   * is set only when the `motionDuration` token is zero: CSS cannot test the
   * value of a variable, so the stylesheet keys the motion-off rule on it.
   */
  boundaryAttributes: CheckoutBoundaryAttributes;
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
  controlBorder: "--bitsnap-checkout-control-border",
  skeleton: "--bitsnap-checkout-skeleton",
  colorScheme: "--bitsnap-checkout-color-scheme",
  error: "--bitsnap-checkout-error",
  overlay: "--bitsnap-checkout-overlay",
  radius: "--bitsnap-checkout-radius",
  panelRadius: "--bitsnap-checkout-panel-radius",
  controlRadius: "--bitsnap-checkout-control-radius",
  buttonRadius: "--bitsnap-checkout-button-radius",
  buttonFontSize: "--bitsnap-checkout-button-font-size",
  panelShadow: "--bitsnap-checkout-panel-shadow",
  sale: "--bitsnap-checkout-sale",
  panelWidth: "--bitsnap-checkout-panel-width",
  panelMaxHeight: "--bitsnap-checkout-panel-max-height",
  motionDuration: "--bitsnap-checkout-motion-duration",
  paymentLogoHeight: "--bitsnap-checkout-payment-logo-height",
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
    // No `overlay`, `controlBorder`, `skeleton` or `colorScheme`: `cart.css`
    // keeps them as per-theme literals behind their own variables, so only a
    // merchant value replaces them (N01, D22).
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
 * `color-scheme` for the root from the effective `background` token (N10):
 * `dark` when white text reads better on it, `light` otherwise. Only `#rgb`
 * and `#rrggbb` are read; any other value (`rgb()`, `var()`, a name) or no
 * `background` gives `undefined`, and the theme class decides in `cart.css`.
 * Scrollbars, the native select popup and form controls follow it.
 */
export function colorSchemeFor(
  background: string | undefined,
): "dark" | "light" | undefined {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(background?.trim() ?? "");
  if (match == null) {
    return undefined;
  }
  const hex = match[1].length === 3 ? match[1].replace(/./g, "$&$&") : match[1];
  // WCAG relative luminance, then the rule of `onColor` (consent/core/contrast.ts):
  // dark when white text contrasts at least as well as #111111 (luminance 0.0056054).
  const [r, g, b] = [0, 2, 4].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05;
  return 1.05 / light >= light / 0.0556054 ? "dark" : "light";
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

function withColorScheme(
  style: CSSProperties,
  colorScheme: "dark" | "light" | undefined,
): CSSProperties {
  return colorScheme == null ? style : { ...style, colorScheme };
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
    // A `colorScheme` token decides in `cart.css`; the inline value would beat it.
    boundaryStyle: withColorScheme(
      resolved.boundaryStyle,
      resolved.tokens.colorScheme == null
        ? colorSchemeFor(resolved.tokens.background)
        : undefined,
    ),
    boundaryAttributes: isMotionOff(resolved.tokens.motionDuration)
      ? { "data-bitsnap-checkout-motion": "off" }
      : {},
  };
}

/** Caller overrides for a single slot, if any were provided. */
export function getCheckoutSlotAppearance(
  resolved: ResolvedCheckoutAppearance,
  slot: CheckoutSlotName,
): CheckoutSlotAppearance | undefined {
  return getSlotAppearance(resolved.elements, slot);
}
