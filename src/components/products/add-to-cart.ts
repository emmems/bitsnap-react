import { DEFAULT_HOST, HOST, setCustomHost } from "../checkout/constants";
import { planCartTarget } from "./cart-target";
import type { PublicListProduct } from "./fetch";

export type AddToCartTarget = {
  projectID: string;
  /** Backend origin the cart talks to. Omitted or empty keeps the current one. */
  host?: string;
  /** Open the cart drawer afterwards. */
  showCart: boolean;
};

/**
 * Default "add to cart" action of `ProductList`: `Bitsnap.addProductToCart`
 * with quantity 1, then the cart drawer.
 *
 * The checkout is a heavy module (RPC client, cart state, payment buttons), so
 * it is loaded on the first click and never ends up in the first paint of a
 * catalog page. The cart only knows one project and one host at a time, and
 * they are page-wide (the cart is kept in localStorage, `setProjectID` also
 * changes the panel configuration). So the list only fills them in when the
 * page has not set them yet; when the page already works for another project
 * or host, nothing is changed and the call fails (pass `onAddToCart` to the
 * list in that case).
 */
export async function addProductToCart(
  product: PublicListProduct,
  target: AddToCartTarget,
): Promise<void> {
  const [{ Bitsnap }, { getProjectID, setProjectID }] = await Promise.all([
    import("../checkout/methods"),
    import("../checkout/CartProvider"),
  ]);

  const plan = planCartTarget(
    { projectID: getProjectID(), host: HOST, defaultHost: DEFAULT_HOST },
    target,
  );
  if (!plan.ok) {
    return failConflict(plan.reason);
  }
  if (plan.setProjectID != null) {
    setProjectID(plan.setProjectID);
  }
  if (plan.setHost != null) {
    setCustomHost(plan.setHost);
  }

  // Single-variant products are added by their variant, not the product ID.
  const error = await Bitsnap.addProductToCart(
    product.cartItemId ?? product.id,
    1,
    undefined,
    {
      name: product.name,
      price: product.price,
      currency: product.currency,
    },
  );
  if (error != null) {
    throw new Error("Could not add the product to the cart");
  }

  if (target.showCart) {
    Bitsnap.showCart();
  }
}

function failConflict(reason: string): never {
  console.warn(
    `bitsnap-react: ProductList did not add to the cart because ${reason}. ` +
      "Pass onAddToCart to use another cart.",
  );
  throw new Error("The page cart belongs to another project or host");
}
