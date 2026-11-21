import {
  UserProductType,
  type UserProduct,
} from "../gen/proto/public/v1/public_api_pb";
import { rpcProvider, useQuery } from "../rpc-provider";
import { productsOfShop } from "./shop-scope";

export type PanelChat = {
  /** Show "Wiadomości": CHAT or COMMUNITY products, or a chat URL. */
  visible: boolean;
  products: UserProduct[];
  chatApiUrl?: string;
};

const isChatProduct = (product: UserProduct) =>
  product.productType === UserProductType.CHAT ||
  product.productType === UserProductType.COMMUNITY;

/**
 * Whether a products answer gives the buyer a chat in this panel. On a
 * shop's panel (`projectID`) only that shop's CHAT and COMMUNITY products
 * count. The chat URL comes with a chat anywhere on Bitsnap, so it counts
 * alone only when no chat product decides (a channel invite, no purchase).
 */
export function hasPanelChat(
  products: UserProduct[],
  chatApiUrl?: string,
  projectID = "",
): boolean {
  if (productsOfShop(products, projectID).some(isChatProduct)) return true;
  return Boolean(chatApiUrl) && !products.some(isChatProduct);
}

/**
 * The chat part of the buyer's products (same query as the library screen,
 * so react-query asks once).
 */
export function usePanelChat(
  accessToken: string | undefined,
  projectID = "",
): PanelChat {
  const { data } = useQuery(
    rpcProvider.publicApi.userPanelGetProducts,
    { accessToken: accessToken ?? "", projectId: projectID },
    { enabled: Boolean(accessToken) },
  );
  const result = data?.result.case === "success" ? data.result.value : undefined;
  const all = result?.products ?? [];
  const chatApiUrl = result?.chatApiUrl || undefined;
  return {
    visible: hasPanelChat(all, chatApiUrl, projectID),
    // "Wiadomości" of a shop's panel holds that shop's conversations only.
    products: productsOfShop(all, projectID),
    chatApiUrl,
  };
}
