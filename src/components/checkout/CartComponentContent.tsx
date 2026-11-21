import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useEffect } from "react";
import { cn } from "@/src/lib/utils";
import { useCheckoutAppearance, useCheckoutSlot } from "./appearance.context";
import { CartCheckout } from "./CartCheckout";
import { CartControllerProvider } from "./cart-controller";
import { CartLines } from "./CartLines";

/** `useAutoAnimate`, off while the appearance has motion off (CSS cannot stop it). */
export function useCartAutoAnimate() {
  const [ref, setEnabled] = useAutoAnimate();
  const motionOff =
    useCheckoutAppearance().boundaryAttributes["data-bitsnap-checkout-motion"] ===
    "off";
  useEffect(() => {
    if (!motionOff) {
      return undefined;
    }
    setEnabled(false);
    return () => setEnabled(true);
  }, [motionOff, setEnabled]);
  return ref;
}

/**
 * The body of the cart: the scroll region (the `lines` slot), a direct child
 * of the panel's grid after the header (D7). State and logic live in
 * `cart-controller.tsx`; the markup is in `CartLines` and `CartCheckout`, which
 * read the controller from context. Until the footer step splits
 * `CartCheckout`, the total and the button scroll with the lines.
 */
const CartComponentContent = ({
  locale,
  open,
}: {
  locale?: string;
  open?: boolean;
}) => {
  const productsParent = useCartAutoAnimate();
  const lines = useCheckoutSlot("lines");

  return (
    <CartControllerProvider locale={locale} open={open}>
      <div
        data-bitsnap-checkout-slot="lines"
        className={cn("bsc-scroll", lines.className)}
        style={lines.style}
        ref={productsParent}
      >
        <CartLines />
        <CartCheckout />
      </div>
    </CartControllerProvider>
  );
};

export default CartComponentContent;
