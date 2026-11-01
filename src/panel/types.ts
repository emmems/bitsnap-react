import type { AnalyticsOption } from "../analytics/instrument";
import type { ReturnsAppearance } from "../components/returns/appearance";
import type { ReturnsTexts } from "../components/returns/texts";
import type { LoginLogoOptions } from "../ui/email-code-login/LoginBrandLogo";
import type { PanelLoginTexts } from "./login-texts";

export interface GetThemeOutput {
  logoURL?: string;
  logoDarkURL?: string;
  colors?: {
    brand?: string;
    brandDark?: string;
  };
}

export type PanelScreen =
  | "products"
  | "notifications"
  | "profile"
  | "plans"
  | "orders"
  | "order-details"
  | "returns"
  | "return-details"
  | "course";

export type PanelSearchParamsType = {
  product?: string;
  state: PanelScreen;
  orderId?: string;
  returnId?: string;
  /** `state: "course"`: `UserProduct.accessId` of the open course. */
  course?: string;
  /** `state: "course"`: id of the open lesson or test. */
  item?: string;
};

export interface PanelProps {
  projectID: string;
  theme?: GetThemeOutput;
  loginURL: string;
  /**
   * Appearance of the Returns screen. When omitted, `buttonBackground`,
   * `focusRing` and a readable `buttonForeground` are derived from
   * `theme.colors.brand`.
   */
  returnsAppearance?: ReturnsAppearance;
  /** Text overrides of the Returns screen. */
  returnsTexts?: Partial<ReturnsTexts>;
  /**
   * Usage statistics for your Bitsnap dashboard (panel logins, orders viewed, downloads). On by default;
   * `false` turns it off. An object lets you forward every event:
   * `{ onEvent }`. Nothing is stored on the visitor's device.
   */
  analytics?: AnalyticsOption;
}

export interface PanelLoginProps extends LoginLogoOptions {
  projectID: string;
  theme?: GetThemeOutput;
  /**
   * Usage statistics for your Bitsnap dashboard (panel logins). On by default;
   * `false` turns it off. An object lets you forward every event:
   * `{ onEvent }`. Nothing is stored on the visitor's device.
   */
  analytics?: AnalyticsOption;
  /**
   * Text overrides of the login: titles, buttons and every message. Polish
   * and English defaults are chosen by `locale`.
   */
  texts?: Partial<PanelLoginTexts>;
  /**
   * Language of the default texts: a locale starting with `en` gives English,
   * anything else Polish. Defaults to the library locale (`setLocale`).
   */
  locale?: string;
}
