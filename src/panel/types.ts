import type { ReturnsAppearance } from "../components/returns/appearance";
import type { ReturnsTexts } from "../components/returns/texts";

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
  | "return-details";

export type PanelSearchParamsType = {
  product?: string;
  state: PanelScreen;
  orderId?: string;
  returnId?: string;
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
}

export interface PanelLoginProps {
  projectID: string;
  theme?: GetThemeOutput;
}
