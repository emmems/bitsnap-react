import type {
  GetOrdersResponse_Shop,
  UserProduct,
} from "../gen/proto/public/v1/public_api_pb";

export { productsOfShop } from "./shop-scope";

/** A shop shown in the all-shops filter pills and on order rows. */
export type ShopOption = {
  projectId: string;
  name: string;
  imageUrl?: string;
  imageDarkUrl?: string;
  count?: number;
};

/**
 * Distinct shops present in the buyer's products, in first-seen order, with
 * per-shop product counts. Products without a `projectId` are ignored.
 */
export function shopsOfProducts(
  products: readonly UserProduct[] | undefined,
  fallbackName = "",
): ShopOption[] {
  if (!products || products.length === 0) return [];
  const byId = new Map<string, ShopOption>();
  for (const product of products) {
    const projectId = product.projectId?.trim();
    if (!projectId) continue;
    const name = product.projectName?.trim() ?? "";
    const imageUrl = product.projectTheme?.imageUrl?.trim() || undefined;
    const imageDarkUrl = product.projectTheme?.imageDarkUrl?.trim() || undefined;
    const existing = byId.get(projectId);
    if (existing) {
      existing.count = (existing.count ?? 0) + 1;
      if (!existing.name && name) existing.name = name;
      if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
      if (!existing.imageDarkUrl && imageDarkUrl) existing.imageDarkUrl = imageDarkUrl;
    } else {
      byId.set(projectId, {
        projectId,
        name,
        imageUrl,
        imageDarkUrl,
        count: 1,
      });
    }
  }
  const list = Array.from(byId.values());
  if (fallbackName) {
    for (const shop of list) {
      if (!shop.name) shop.name = fallbackName;
    }
  }
  return list;
}

/**
 * Normalises `GetOrdersResponse.shops` (newest order first) into `ShopOption[]`.
 * Tolerates an older server that omits `shops`.
 */
export function shopsOfOrders(
  shops: readonly GetOrdersResponse_Shop[] | undefined,
  fallbackName = "",
): ShopOption[] {
  if (!shops || shops.length === 0) return [];
  const seen = new Set<string>();
  const result: ShopOption[] = [];
  for (const shop of shops) {
    const projectId = shop.projectId?.trim();
    if (!projectId || seen.has(projectId)) continue;
    seen.add(projectId);
    result.push({
      projectId,
      name: shop.name?.trim() || fallbackName,
      imageUrl: shop.imageUrl?.trim() || undefined,
      imageDarkUrl: shop.imageDarkUrl?.trim() || undefined,
      count: shop.orderCount,
    });
  }
  return result;
}

/**
 * Resolves the active shop filter against the known shops.
 * Returns `undefined` ("All") when fewer than 2 shops exist (pills are hidden)
 * or when `param` does not match any known shop.
 */
export function selectedShop(
  shops: readonly ShopOption[],
  param: string | undefined,
): string | undefined {
  if (shops.length < 2 || !param) return undefined;
  return shops.some((shop) => shop.projectId === param) ? param : undefined;
}
