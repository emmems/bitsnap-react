import { useState } from "react";
import { useIsomorphicLayoutEffect } from "../../lib/isomorphic-layout-effect";
import type { PanelColorScheme } from "../types";
import type { PanelMode } from "./tokens";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Mode the panel sets itself. `"inherit"` gives `undefined`: panel.css follows
 * a host `.dark` class with no JavaScript. `"system"` follows the operating
 * system (`prefers-color-scheme`), read in a layout effect so the first client
 * paint already has it; on the server and before the effect it is `undefined`.
 */
export function useColorMode(
  scheme: PanelColorScheme = "inherit",
): PanelMode | undefined {
  const [mode, setMode] = useState<PanelMode | undefined>(undefined);

  useIsomorphicLayoutEffect(() => {
    if (
      scheme !== "system" ||
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      setMode(undefined);
      return;
    }
    const query = window.matchMedia(DARK_QUERY);
    const update = () => setMode(query.matches ? "dark" : "light");
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, [scheme]);

  return scheme === "system" ? mode : undefined;
}
