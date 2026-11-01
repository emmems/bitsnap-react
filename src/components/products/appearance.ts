import type { CSSProperties } from "react";
import {
  getSlotAppearance,
  resolveAppearanceCore,
  type AppearanceElements,
  type ShadcnVariableMapping,
  type SlotAppearance,
} from "@/src/lib/appearance-core";

/**
 * Product list appearance API.
 *
 * It mirrors `CheckoutAppearance` and `ReturnsAppearance` (theme, tokens,
 * elements) so a shop can reuse one brand object for all of them. The resolver
 * is pure: it turns the caller input into a theme name, the tokens in effect,
 * the slot overrides and the inline style for the theme boundary.
 */

export type ProductListTheme = "light" | "dark";

export type ProductListAppearanceTokens = {
  /** Font family of the list. The library never loads fonts. */
  fontFamily?: string;
  /** Minimum grid track width. Use "100%" for one column. */
  gridMinWidth?: string;
  /** Base font size. */
  fontSize?: string;
  /** List background. */
  background?: string;
  /** Raised surfaces: cards, image placeholders, skeletons. */
  surface?: string;
  /** Main text color. */
  foreground?: string;
  /** Secondary text: descriptions, the struck-through price. */
  mutedForeground?: string;
  /** Borders of cards and buttons. */
  border?: string;
  /** "Add to cart" button background. */
  buttonBackground?: string;
  /** "Add to cart" button text. */
  buttonForeground?: string;
  /** "Add to cart" button background on hover. */
  buttonHoverBackground?: string;
  /** Hover surface of cards and secondary buttons. */
  hoverSurface?: string;
  /** Focus ring color. */
  focusRing?: string;
  /** Error and unavailable state color. */
  error?: string;
  /** Badge background (subscription, unavailable). */
  badgeBackground?: string;
  /** Badge text. */
  badgeForeground?: string;
  /** Corner radius of cards, images and buttons. */
  radius?: string;
};

/**
 * Stable slot names. They are exposed as `data-bitsnap-products-slot`
 * attributes so they can also be targeted from plain CSS.
 */
export const PRODUCT_LIST_SLOT_NAMES = [
  "root",
  "grid",
  "card",
  "cardLink",
  "image",
  "imagePlaceholder",
  "body",
  "name",
  "description",
  "price",
  "comparePrice",
  "badge",
  "model3dBadge",
  "actions",
  "addToCartButton",
  "selectButton",
  "message",
  "pagination",
  "paginationButton",
  "pageIndicator",
  "emptyState",
  "error",
  "retryButton",
  "skeleton",
] as const;

export type ProductListSlotName = (typeof PRODUCT_LIST_SLOT_NAMES)[number];

export type ProductListSlotAppearance = SlotAppearance;

export type ProductListAppearanceElements =
  AppearanceElements<ProductListSlotName>;

export type ProductListAppearance = {
  /** `"light"` or `"dark"`. Omitted means `"light"`. */
  theme?: ProductListTheme;
  /** Partial overrides applied over the theme preset. */
  tokens?: ProductListAppearanceTokens;
  /** Per element `className`/`style` overrides. */
  elements?: ProductListAppearanceElements;
};

export type ResolvedProductListAppearance = {
  theme: ProductListTheme;
  /** Tokens that are in effect (the theme preset plus caller overrides). */
  tokens: ProductListAppearanceTokens;
  elements: ProductListAppearanceElements;
  /** Theme marker class for the theme boundary. */
  boundaryClassName: string;
  /** Inline custom properties applied to the list root. */
  boundaryStyle: CSSProperties;
};

/** CSS custom property used for each token. */
export const PRODUCT_LIST_TOKEN_VARIABLES = {
  fontFamily: "--bitsnap-products-font-family",
  gridMinWidth: "--bitsnap-products-grid-min-width",
  fontSize: "--bitsnap-products-font-size",
  background: "--bitsnap-products-background",
  surface: "--bitsnap-products-surface",
  foreground: "--bitsnap-products-foreground",
  mutedForeground: "--bitsnap-products-muted-foreground",
  border: "--bitsnap-products-border",
  buttonBackground: "--bitsnap-products-button-background",
  buttonForeground: "--bitsnap-products-button-foreground",
  buttonHoverBackground: "--bitsnap-products-button-hover-background",
  hoverSurface: "--bitsnap-products-hover-surface",
  focusRing: "--bitsnap-products-focus-ring",
  error: "--bitsnap-products-error",
  badgeBackground: "--bitsnap-products-badge-background",
  badgeForeground: "--bitsnap-products-badge-foreground",
  radius: "--bitsnap-products-radius",
} as const;

export type ProductListTokenName = keyof typeof PRODUCT_LIST_TOKEN_VARIABLES;

/**
 * Complete palettes. They carry colors and radius only, so typography is never
 * reset implicitly. `products.css` falls back to the light values, which keeps
 * the list usable even when the boundary style is missing.
 */
export const PRODUCT_LIST_THEME_PRESETS: Record<
  ProductListTheme,
  ProductListAppearanceTokens
> = {
  light: {
    background: "#ffffff",
    surface: "#f9fafb",
    foreground: "#18181b",
    mutedForeground: "#71717a",
    border: "#e4e4e7",
    buttonBackground: "#18181b",
    buttonForeground: "#fafafa",
    buttonHoverBackground: "#000000",
    hoverSurface: "#f4f4f5",
    focusRing: "#71717a",
    error: "#dc2626",
    badgeBackground: "#f4f4f5",
    badgeForeground: "#3f3f46",
    radius: "8px",
    gridMinWidth: "9rem",
  },
  dark: {
    background: "#18181b",
    surface: "#27272a",
    foreground: "#fafafa",
    mutedForeground: "#a1a1aa",
    border: "#3f3f46",
    buttonBackground: "#fafafa",
    buttonForeground: "#18181b",
    buttonHoverBackground: "#e4e4e7",
    hoverSurface: "#3f3f46",
    focusRing: "#a1a1aa",
    error: "#f87171",
    badgeBackground: "#3f3f46",
    badgeForeground: "#e4e4e7",
    radius: "8px",
    gridMinWidth: "9rem",
  },
};

/** The list renders its own elements, so no shared primitive needs remapping. */
const PRODUCT_LIST_SHADCN_VARIABLES: ShadcnVariableMapping<ProductListTokenName> =
  [];

export function resolveProductListAppearance(
  appearance?: ProductListAppearance,
): ResolvedProductListAppearance {
  const resolved = resolveAppearanceCore<
    ProductListTokenName,
    ProductListTheme,
    ProductListSlotName
  >(appearance, {
    defaultTheme: "light",
    presets: PRODUCT_LIST_THEME_PRESETS,
    variables: PRODUCT_LIST_TOKEN_VARIABLES,
    shadcnVariables: PRODUCT_LIST_SHADCN_VARIABLES,
  });

  return {
    theme: resolved.theme,
    tokens: resolved.tokens,
    elements: resolved.elements,
    boundaryClassName: resolved.theme,
    boundaryStyle: resolved.boundaryStyle,
  };
}

/** Caller overrides for a single slot, if any were provided. */
export function getProductListSlotAppearance(
  resolved: ResolvedProductListAppearance,
  slot: ProductListSlotName,
): ProductListSlotAppearance | undefined {
  return getSlotAppearance(resolved.elements, slot);
}
