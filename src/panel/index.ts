export { PanelLogin } from "./components/PanelLogin";
export { default as Panel } from "./components/PanelPage";
export { default as PublicOrderPage } from "./components/PublicOrderPage";

export {
  getPanelConfig,
  setHost,
  setLoginURL,
  setPanelConfig,
  setProjectID,
  setTheme,
} from "./config";
export { PanelProvider, usePanelConfig } from "./PanelProvider";

export type { PanelConfig } from "./config";
export type {
  GetThemeOutput,
  PanelLoginProps,
  PanelProps,
  PanelScreen,
  PanelSearchParamsType,
} from "./types";
