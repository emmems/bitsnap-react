import type { CSSProperties } from "react";
import { readableForeground } from "../../components/returns/color";

/**
 * Colour tokens of the panel, light and dark. `panel.css` holds the same
 * values (a test keeps them in sync); this copy feeds the contrast guard and
 * the contrast tests.
 */
export const PANEL_TOKENS = {
  light: {
    bg: "#fafafa",
    surface: "#ffffff",
    "surface-2": "#f5f5f5",
    border: "#e5e5e5",
    fg: "#171717",
    muted: "#525252",
    ok: "#15803d",
    "ok-bg": "#f0fdf4",
    warn: "#b45309",
    "warn-bg": "#fffbeb",
    danger: "#b91c1c",
    "danger-bg": "#fef2f2",
    "danger-solid": "#b91c1c",
    info: "#1d4ed8",
    "info-bg": "#eff6ff",
  },
  dark: {
    bg: "#000000",
    surface: "#171717",
    "surface-2": "#262626",
    border: "#262626",
    fg: "#fafafa",
    muted: "#a3a3a3",
    ok: "#4ade80",
    "ok-bg": "#052e16",
    warn: "#fbbf24",
    "warn-bg": "#451a03",
    danger: "#f87171",
    "danger-bg": "#450a0a",
    "danger-solid": "#b91c1c",
    info: "#60a5fa",
    "info-bg": "#172554",
  },
} as const;

export type PanelMode = "light" | "dark";

/** Minimum contrast of a brand colour used for thin or text-like accents. */
export const ACCENT_MIN_CONTRAST = 3;

function parseColor(value: string): [number, number, number] | undefined {
  const trimmed = value.trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(trimmed);
  if (hex != null) {
    let digits = hex[1];
    if (digits.length <= 4) {
      digits = digits
        .split("")
        .map((char) => char + char)
        .join("");
    }
    return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16)) as [
      number,
      number,
      number,
    ];
  }
  const rgb =
    /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+[\d.%]+)?\s*\)$/i.exec(
      trimmed,
    );
  if (rgb == null) return undefined;
  const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
  return channels.every((channel) => channel <= 255)
    ? (channels as [number, number, number])
    : undefined;
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/**
 * WCAG contrast ratio of two hex or `rgb()` colours, `undefined` when one of
 * them does not parse.
 */
export function contrastRatio(a: string, b: string): number | undefined {
  const first = parseColor(a);
  const second = parseColor(b);
  if (first == null || second == null) return undefined;
  const [hi, lo] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Literal accent variables of one mode, or nothing when the colour does not
 * parse (the neutral defaults of panel.css apply then).
 *
 * Contrast guard: a brand under 3:1 against the surface of the mode stays a
 * fill (buttons, with a computed foreground) but text-like and thin accents
 * (`-text`: links, focus ring, seek fill) fall back to the panel text colour,
 * and the fill gets a visible edge (`-edge`, for a 1 px border).
 */
function accentVars(
  color: string | undefined,
  mode: PanelMode,
): Record<string, string> {
  const value = color?.trim();
  if (!value) return {};
  const foreground = readableForeground(value);
  const ratio = contrastRatio(value, PANEL_TOKENS[mode].surface);
  if (foreground == null || ratio == null) return {};
  const name = mode === "light" ? "--panel-accent" : "--panel-accent-dark";
  const readable = ratio >= ACCENT_MIN_CONTRAST;
  return {
    [name]: value,
    [`${name}-fg`]: foreground,
    [`${name}-text`]: readable ? value : "var(--panel-fg)",
    [`${name}-edge`]: readable ? value : "var(--panel-muted)",
  };
}

/**
 * Every shadcn variable the panel's `ui/*` primitives read (global.css),
 * routed through the panel tokens. Inline on the root on purpose: the global
 * `.dark` rule and panel.css would tie on specificity, an inline style wins.
 */
export const PANEL_SHADCN_MAPPING: Readonly<Record<string, string>> = {
  "--background": "var(--panel-bg)",
  "--foreground": "var(--panel-fg)",
  "--card": "var(--panel-surface)",
  "--card-foreground": "var(--panel-fg)",
  "--popover": "var(--panel-surface)",
  "--popover-foreground": "var(--panel-fg)",
  "--primary": "var(--panel-accent-now)",
  "--primary-foreground": "var(--panel-accent-fg-now)",
  "--secondary": "var(--panel-surface-2)",
  "--secondary-foreground": "var(--panel-fg)",
  "--muted": "var(--panel-surface-2)",
  "--muted-foreground": "var(--panel-muted)",
  "--accent": "var(--panel-surface-2)",
  "--accent-foreground": "var(--panel-fg)",
  "--destructive": "var(--panel-danger-solid)",
  "--destructive-foreground": "var(--panel-danger)",
  "--border": "var(--panel-border)",
  "--input": "var(--panel-border)",
  "--ring": "var(--panel-accent-text-now)",
};

/**
 * Inline style of the panel root: the brand literals (light `brand`, dark
 * `brandDark`, falling back to `brand`) with their computed foregrounds and
 * contrast guard, plus the shadcn mapping. Without a usable brand colour the
 * neutral look of panel.css stays.
 */
export function panelThemeStyle(
  brand?: string,
  brandDark?: string,
): CSSProperties {
  const light = brand?.trim() || undefined;
  const dark = brandDark?.trim() || light;
  return {
    ...accentVars(light, "light"),
    ...accentVars(dark, "dark"),
    ...PANEL_SHADCN_MAPPING,
  } as CSSProperties;
}
