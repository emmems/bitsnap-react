import { addProductToCart } from "../components/products/add-to-cart";

export type BuyPackInput = {
  /** Public project id of the shop (the cart's project). */
  projectID: string;
  /** The product (or variant) to add: the pack's service or community product. */
  productId: string;
  name?: string;
  priceCents?: number;
  /** Backend origin of the cart, when not the default. */
  host?: string;
};

/**
 * Default "Kup pakiet" / "Kup dostęp" action: adds the product to the page
 * cart (`Bitsnap.addProductToCart`) and opens the cart drawer. The page needs
 * a mounted `BitsnapCheckout`. When the page cart belongs to another project
 * or host nothing changes and the promise rejects; pass `onBuy` to the widget
 * to use your own checkout instead.
 */
export async function addPackToCart(input: BuyPackInput): Promise<void> {
  await addProductToCart(
    {
      id: input.productId,
      name: input.name ?? "",
      price: input.priceCents ?? 0,
      currency: "",
    },
    { projectID: input.projectID, host: input.host, showCart: true },
  );
}
