import type { CSSProperties } from "react";
import { readableForeground } from "../components/returns/color";

/**
 * CSS variables of the accent (brand) color of the course view. Without a
 * brand color nothing is set and the library's `--primary` applies.
 */
export function accentVars(colors?: {
  brand?: string;
  brandDark?: string;
}): CSSProperties {
  const vars: Record<string, string> = {};
  const brand = colors?.brand?.trim();
  const brandDark = colors?.brandDark?.trim() || brand;
  if (brand) {
    vars["--course-accent"] = brand;
    const foreground = readableForeground(brand);
    if (foreground) vars["--course-accent-fg"] = foreground;
  }
  if (brandDark) {
    vars["--course-accent-dark"] = brandDark;
    const foreground = readableForeground(brandDark);
    if (foreground) vars["--course-accent-dark-fg"] = foreground;
  }
  return vars as CSSProperties;
}
