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

/**
 * Light or dark mode of the panel. `"inherit"` (default) follows a `.dark`
 * class on any ancestor (`html`, `body`, a wrapper), like Tailwind's `dark:`.
 * `"system"` follows the operating system setting.
 */
export type PanelColorScheme = "inherit" | "system";

export type PanelScreen =
  | "products"
  | "notifications"
  | "profile"
  | "plans"
  | "orders"
  | "order-details"
  | "returns"
  | "return-details"
  | "course"
  | "messages";

export type PanelSearchParamsType = {
  product?: string;
  state: PanelScreen;
  orderId?: string;
  returnId?: string;
  /** `state: "course"`: `UserProduct.accessId` of the open course. */
  course?: string;
  /** `state: "course"`: id of the open lesson or test. */
  item?: string;
  /** `state: "messages"`: project of the open conversation. */
  chatProject?: string;
  /** `state: "messages"`: id of the open pack thread. */
  thread?: string;
  /** `state: "messages"`: id of the open channel. */
  channel?: string;
};

export interface PanelProps {
  projectID: string;
  theme?: GetThemeOutput;
  loginURL: string;
  /**
   * Light or dark mode. `"inherit"` (default) follows a `.dark` class on the
   * host page; `"system"` follows the operating system. The brand colours of
   * `theme.colors` (`brand` light, `brandDark` dark) colour buttons, links
   * and the focus ring in both.
   */
  colorScheme?: PanelColorScheme;
  /**
   * Appearance of the Returns screen. When omitted, it follows the panel:
   * its surfaces, mode and brand colour.
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
  /**
   * Light or dark mode. `"inherit"` (default) follows a `.dark` class on the
   * host page; `"system"` follows the operating system.
   */
  colorScheme?: PanelColorScheme;
}
