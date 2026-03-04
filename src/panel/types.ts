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
  | "order-details";

export type PanelSearchParamsType = {
  product?: string;
  state: PanelScreen;
  orderId?: string;
};

export interface PanelProps {
  projectID: string;
  theme?: GetThemeOutput;
  loginURL: string;
}

export interface PanelLoginProps {
  projectID: string;
  theme?: GetThemeOutput;
}
