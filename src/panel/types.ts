import type { UserProduct } from "../gen/proto/public/v1/public_api_pb";

export interface GetThemeOutput {
  logoURL?: string;
  logoDarkURL?: string;
  colors?: {
    brand?: string;
    brandDark?: string;
  };
}

export type PanelScreen = "products" | "notifications" | "profile" | "plans" | "orders" | "order-details";

export type PanelSearchParamsType = {
  product?: UserProduct;
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
