import "./panel.css";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { GetThemeOutput, PanelColorScheme } from "../types";
import { panelThemeStyle, type PanelMode } from "./tokens";
import { useColorMode } from "./useColorMode";

export { panelThemeStyle, PANEL_TOKENS, contrastRatio } from "./tokens";
export type { PanelMode } from "./tokens";
export { useColorMode } from "./useColorMode";

export type PanelRootProps = {
  "data-bitsnap-panel": "";
  "data-bitsnap-theme": PanelColorScheme | PanelMode;
  /** `"dark"` in `"system"` mode on a dark system, otherwise undefined. */
  className: string | undefined;
  style: CSSProperties;
};

/**
 * Props of a panel theme boundary (Panel, PanelLogin, the order page): the
 * `data-bitsnap-panel` marker panel.css keys on, the mode class for
 * `"system"`, and the inline brand style. `mode` is the mode the panel set
 * itself (`undefined` in `"inherit"`), for widgets with their own theme
 * (returns).
 */
export function usePanelRoot(
  theme: GetThemeOutput | undefined,
  colorScheme: PanelColorScheme = "inherit",
): { rootProps: PanelRootProps; mode: PanelMode | undefined } {
  const mode = useColorMode(colorScheme);
  const brand = theme?.colors?.brand;
  const brandDark = theme?.colors?.brandDark;
  const style = useMemo(
    () => panelThemeStyle(brand, brandDark),
    [brand, brandDark],
  );
  return {
    mode,
    rootProps: {
      "data-bitsnap-panel": "",
      "data-bitsnap-theme": colorScheme === "system" ? (mode ?? "system") : "inherit",
      className: mode === "dark" ? "dark" : undefined,
      style,
    },
  };
}
