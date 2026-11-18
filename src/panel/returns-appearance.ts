import type {
  ReturnsAppearance,
  ReturnsAppearanceTokens,
} from "../components/returns/appearance";
import { readableForeground } from "../components/returns/color";
import type { PanelMode } from "./theme/tokens";

export { readableForeground };

/**
 * Returns tokens that follow the panel theme (panel.css). The returns presets
 * are full palettes, so every colour token is set here, or the light preset
 * would leak into a dark panel. Values are `var(--panel-*)`: they resolve
 * inside the panel root, which carries the mode and the brand colour.
 */
export const PANEL_RETURNS_TOKENS: ReturnsAppearanceTokens = {
  background: "transparent",
  surface: "var(--panel-surface)",
  foreground: "var(--panel-fg)",
  mutedForeground: "var(--panel-muted)",
  border: "var(--panel-border)",
  buttonBackground: "var(--panel-accent-now)",
  buttonForeground: "var(--panel-accent-fg-now)",
  buttonHoverBackground:
    "color-mix(in srgb, var(--panel-accent-now) 85%, var(--panel-fg))",
  hoverSurface: "var(--panel-surface-2)",
  focusRing: "var(--panel-accent-text-now)",
  error: "var(--panel-danger)",
  success: "var(--panel-ok)",
  warning: "var(--panel-warn)",
  badgeBackground: "var(--panel-surface-2)",
  badgeForeground: "var(--panel-fg)",
  inputBackground: "var(--panel-surface)",
};

/**
 * Appearance of the panel Returns screen. An explicit appearance wins.
 * Otherwise the returns views take the panel's tokens (brand colour included,
 * through `--panel-accent-now`) on a transparent background; `mode` is the
 * mode the panel set itself (`"system"`), which also sets the boundary class.
 */
export function resolvePanelReturnsAppearance(
  explicit: ReturnsAppearance | undefined,
  mode?: PanelMode,
): ReturnsAppearance {
  if (explicit != null) {
    return explicit;
  }
  return {
    ...(mode != null ? { theme: mode } : {}),
    tokens: { ...PANEL_RETURNS_TOKENS },
  };
}
