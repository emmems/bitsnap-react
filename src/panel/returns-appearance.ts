import type { ReturnsAppearance } from "../components/returns/appearance";

function parseHex(value: string): [number, number, number] | undefined {
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (match == null) {
    return undefined;
  }
  let hex = match[1];
  if (hex.length <= 4) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function parseRgb(value: string): [number, number, number] | undefined {
  const match =
    /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+[\d.%]+)?\s*\)$/i.exec(
      value,
    );
  if (match == null) {
    return undefined;
  }
  const channels = [match[1], match[2], match[3]].map(Number);
  return channels.every((channel) => channel <= 255)
    ? (channels as [number, number, number])
    : undefined;
}

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * Text color that stays readable on a brand color: white or near black,
 * whichever has the higher WCAG contrast. `undefined` when the color is not a
 * hex or `rgb()` value.
 */
export function readableForeground(color: string): string | undefined {
  const trimmed = color.trim();
  const rgb = parseHex(trimmed) ?? parseRgb(trimmed);
  if (rgb == null) {
    return undefined;
  }
  const [r, g, b] = rgb.map(linearize);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast against white (1.05 / (L + 0.05)) versus against black.
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;
  return whiteContrast >= blackContrast ? "#ffffff" : "#18181b";
}

/**
 * Returns appearance of the panel Returns screen derived from the panel brand
 * color. An explicit appearance wins; without a brand color the library
 * defaults apply (`undefined`).
 */
export function resolvePanelReturnsAppearance(
  explicit: ReturnsAppearance | undefined,
  brand: string | undefined,
): ReturnsAppearance | undefined {
  if (explicit != null) {
    return explicit;
  }
  const color = brand?.trim();
  if (color == null || color === "") {
    return undefined;
  }
  const foreground = readableForeground(color);
  return {
    tokens: {
      buttonBackground: color,
      focusRing: color,
      ...(foreground != null ? { buttonForeground: foreground } : {}),
    },
  };
}
