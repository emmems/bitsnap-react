export { PanelLogin } from "./components/PanelLogin";
export { default as Panel } from "./components/PanelPage";
export { default as PublicOrderPage } from "./components/PublicOrderPage";

export {
  getAllowedReturnOrigins,
  getPanelConfig,
  setAllowedReturnOrigins,
  setHost,
  setLoginURL,
  setPanelConfig,
  setProjectID,
  setTheme,
} from "./config";
export { PanelProvider, usePanelConfig } from "./PanelProvider";
export {
  buildAccessTokenRedirect,
  getReturnURLFromSearch,
  persistReturnURL,
  readPersistedReturnURL,
} from "./return-url";

export type { PanelConfig } from "./config";
export type {
  GetThemeOutput,
  PanelLoginProps,
  PanelProps,
  PanelScreen,
  PanelSearchParamsType,
} from "./types";
