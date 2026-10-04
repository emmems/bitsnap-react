import type { CSSProperties } from "react";
import {
  getSlotAppearance,
  resolveAppearanceCore,
  type AppearanceElements,
  type ShadcnVariableMapping,
  type SlotAppearance,
} from "@/src/lib/appearance-core";

/**
 * Returns appearance API.
 *
 * It mirrors `CheckoutAppearance` (theme, tokens, elements) so a shop can reuse
 * one brand object for both. The resolver is pure: it turns the caller input
 * into a theme name, the tokens in effect, the slot overrides and the inline
 * style for the theme boundary.
 */

export type ReturnsTheme = "light" | "dark";

export type ReturnsAppearanceTokens = {
  /** Font family of the returns views. The library never loads fonts. */
  fontFamily?: string;
  /** Base font size. */
  fontSize?: string;
  /** Page background. */
  background?: string;
  /** Raised surfaces: cards, skeletons, summaries. */
  surface?: string;
  /** Main text color. */
  foreground?: string;
  /** Secondary text: descriptions, dates, hints. */
  mutedForeground?: string;
  /** Borders of cards, inputs and separators. */
  border?: string;
  /** Primary button background. */
  buttonBackground?: string;
  /** Primary button text. */
  buttonForeground?: string;
  /** Primary button background on hover. */
  buttonHoverBackground?: string;
  /** Hover surface of secondary buttons and selectable cards. */
  hoverSurface?: string;
  /** Focus ring color. Also applied to shared UI primitives through `--ring`. */
  focusRing?: string;
  /** Error color. */
  error?: string;
  /** Success color: result screen, completed and refunded statuses. */
  success?: string;
  /** Warning color: statuses that need attention. */
  warning?: string;
  /** Status badge background. */
  badgeBackground?: string;
  /** Status badge text. */
  badgeForeground?: string;
  /** Background of text inputs and the note field. */
  inputBackground?: string;
  /** Corner radius, applied through `--radius`. */
  radius?: string;
};

/**
 * Stable slot names. They are exposed as `data-bitsnap-returns-slot`
 * attributes so they can also be targeted from plain CSS.
 */
export const RETURNS_SLOT_NAMES = [
  // Frame
  "root",
  "header",
  "title",
  "description",
  "backButton",
  "stepIndicator",
  "error",
  "emptyState",
  "skeleton",
  // Auth
  "emailForm",
  "emailInput",
  "codeForm",
  "codeInput",
  "resendButton",
  "logoutButton",
  // Orders
  "orderList",
  "orderCard",
  "orderReference",
  "orderDate",
  "orderTotal",
  "pagination",
  // Selection
  "lineList",
  "line",
  "lineName",
  "linePrice",
  "lineQuantityControl",
  "quantityButton",
  "quantityInput",
  "lineIneligibleReason",
  "noteInput",
  // Confirmation and result
  "summary",
  "submitButton",
  "secondaryButton",
  "successState",
  "returnReference",
  "returnInstructions",
  // My returns
  "returnList",
  "returnCard",
  "statusBadge",
  "history",
  "historyEntry",
] as const;

export type ReturnsSlotName = (typeof RETURNS_SLOT_NAMES)[number];

export type ReturnsSlotAppearance = SlotAppearance;

export type ReturnsAppearanceElements = AppearanceElements<ReturnsSlotName>;

export type ReturnsAppearance = {
  /** `"light"` or `"dark"`. Omitted means `"light"`. */
  theme?: ReturnsTheme;
  /** Partial overrides applied over the theme preset. */
  tokens?: ReturnsAppearanceTokens;
  /** Per element `className`/`style` overrides. */
  elements?: ReturnsAppearanceElements;
};

export type ResolvedReturnsAppearance = {
  theme: ReturnsTheme;
  /** Tokens that are in effect (the theme preset plus caller overrides). */
  tokens: ReturnsAppearanceTokens;
  elements: ReturnsAppearanceElements;
  /** Theme marker class for the theme boundary. */
  boundaryClassName: string;
  /** Inline custom properties applied to the returns root. */
  boundaryStyle: CSSProperties;
};

/** CSS custom property used for each token. */
export const RETURNS_TOKEN_VARIABLES = {
  fontFamily: "--bitsnap-returns-font-family",
  fontSize: "--bitsnap-returns-font-size",
  background: "--bitsnap-returns-background",
  surface: "--bitsnap-returns-surface",
  foreground: "--bitsnap-returns-foreground",
  mutedForeground: "--bitsnap-returns-muted-foreground",
  border: "--bitsnap-returns-border",
  buttonBackground: "--bitsnap-returns-button-background",
  buttonForeground: "--bitsnap-returns-button-foreground",
  buttonHoverBackground: "--bitsnap-returns-button-hover-background",
  hoverSurface: "--bitsnap-returns-hover-surface",
  focusRing: "--bitsnap-returns-focus-ring",
  error: "--bitsnap-returns-error",
  success: "--bitsnap-returns-success",
  warning: "--bitsnap-returns-warning",
  badgeBackground: "--bitsnap-returns-badge-background",
  badgeForeground: "--bitsnap-returns-badge-foreground",
  inputBackground: "--bitsnap-returns-input-background",
  radius: "--bitsnap-returns-radius",
} as const;

export type ReturnsTokenName = keyof typeof RETURNS_TOKEN_VARIABLES;

/**
 * Complete palettes. They carry colors and radius only, so typography is never
 * reset implicitly. `returns.css` falls back to the light values, which keeps
 * the views usable even when the boundary style is missing.
 */
export const RETURNS_THEME_PRESETS: Record<
  ReturnsTheme,
  ReturnsAppearanceTokens
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
    success: "#16a34a",
    warning: "#d97706",
    badgeBackground: "#f4f4f5",
    badgeForeground: "#3f3f46",
    inputBackground: "#ffffff",
    radius: "8px",
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
    success: "#4ade80",
    warning: "#fbbf24",
    badgeBackground: "#3f3f46",
    badgeForeground: "#e4e4e7",
    inputBackground: "#27272a",
    radius: "8px",
  },
};

/**
 * Shared UI primitives (`Button`, `Input`, `Label`, ...) read the shadcn theme
 * variables, so those follow the returns tokens inside the boundary.
 */
const RETURNS_SHADCN_VARIABLES: ShadcnVariableMapping<ReturnsTokenName> = [
  { token: "background", variable: "--background" },
  { token: "foreground", variable: "--foreground" },
  { token: "surface", variable: "--card" },
  { token: "foreground", variable: "--card-foreground" },
  { token: "surface", variable: "--popover" },
  { token: "foreground", variable: "--popover-foreground" },
  { token: "buttonBackground", variable: "--primary" },
  { token: "buttonForeground", variable: "--primary-foreground" },
  { token: "surface", variable: "--secondary" },
  { token: "foreground", variable: "--secondary-foreground" },
  { token: "hoverSurface", variable: "--accent" },
  { token: "foreground", variable: "--accent-foreground" },
  { token: "mutedForeground", variable: "--muted-foreground" },
  { token: "border", variable: "--border" },
  { token: "border", variable: "--input" },
  { token: "focusRing", variable: "--ring" },
  { token: "error", variable: "--destructive" },
  { token: "radius", variable: "--radius" },
];

export function resolveReturnsAppearance(
  appearance?: ReturnsAppearance,
): ResolvedReturnsAppearance {
  const resolved = resolveAppearanceCore<
    ReturnsTokenName,
    ReturnsTheme,
    ReturnsSlotName
  >(appearance, {
    defaultTheme: "light",
    presets: RETURNS_THEME_PRESETS,
    variables: RETURNS_TOKEN_VARIABLES,
    shadcnVariables: RETURNS_SHADCN_VARIABLES,
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
export function getReturnsSlotAppearance(
  resolved: ResolvedReturnsAppearance,
  slot: ReturnsSlotName,
): ReturnsSlotAppearance | undefined {
  return getSlotAppearance(resolved.elements, slot);
}
