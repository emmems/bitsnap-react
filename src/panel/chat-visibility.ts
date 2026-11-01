import {
  UserProductType,
  type UserProduct,
} from "../gen/proto/public/v1/public_api_pb";
import { rpcProvider, useQuery } from "../rpc-provider";

export type PanelChat = {
  /** Show "Wiadomości": CHAT or COMMUNITY products, or a chat URL. */
  visible: boolean;
  products: UserProduct[];
  chatApiUrl?: string;
};

/** Whether a products answer gives the buyer a chat. */
export function hasPanelChat(products: UserProduct[], chatApiUrl?: string): boolean {
  return (
    Boolean(chatApiUrl) ||
    products.some(
      (product) =>
        product.productType === UserProductType.CHAT ||
        product.productType === UserProductType.COMMUNITY,
    )
  );
}

/**
 * The chat part of the buyer's products (same query as the library screen,
 * so react-query asks once).
 */
export function usePanelChat(accessToken: string | undefined): PanelChat {
  const { data } = useQuery(
    rpcProvider.publicApi.userPanelGetProducts,
    { accessToken: accessToken ?? "" },
    { enabled: Boolean(accessToken) },
  );
  const result = data?.result.case === "success" ? data.result.value : undefined;
  const products = result?.products ?? [];
  const chatApiUrl = result?.chatApiUrl || undefined;
  return { visible: hasPanelChat(products, chatApiUrl), products, chatApiUrl };
}
