import type { ReturnsAppearance } from "../components/returns/appearance";
import { brandColorTokens, readableForeground } from "../components/returns/color";

export { readableForeground };

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
  return { tokens: brandColorTokens(color) };
}
