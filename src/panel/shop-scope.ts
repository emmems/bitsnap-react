import type { UserProduct } from "../gen/proto/public/v1/public_api_pb";

/**
 * The buyer's products of one shop. The server answers with the purchases
 * from every Bitsnap shop (matched by e-mail); a shop's panel lists its own.
 * `projectID` "" (the all-shops panel on bitsnap.pl) keeps them all. A
 * product without a shop id is kept too: a purchase the panel cannot place
 * is better shown than hidden.
 */
export function productsOfShop(
  products: UserProduct[],
  projectID: string,
): UserProduct[] {
  if (!projectID) return products;
  return products.filter(
    (product) => !product.projectId || product.projectId === projectID,
  );
}
