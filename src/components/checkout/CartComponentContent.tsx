import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useEffect } from "react";
import { useCheckoutAppearance, useCheckoutSlot } from "./appearance.context";
import { CartFooter, CartOptions } from "./CartCheckout";
import { CartControllerProvider } from "./cart-controller";
import { CartLines } from "./CartLines";
import { cx } from "./lib/cx";

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
 * The body of the cart: a fragment of the scroll region (the `lines` slot:
 * lines, then the options) and the footer, both direct children of the
 * panel's grid after the header (D7, N11). State and logic live in
 * `cart-controller.tsx`; the markup is in `CartLines` and `CartCheckout`, which
 * read the controller from context.
 */
const CartComponentContent = ({
  locale,
  open,
  onClose,
  continueUnderCheckout = false,
}: {
  locale?: string;
  open?: boolean;
  /** Closes the cart: the empty state's "Continue shopping". */
  onClose?: () => void;
  /** Also offer "Continue shopping" under the checkout button (the dialog). */
  continueUnderCheckout?: boolean;
}) => {
  const productsParent = useCartAutoAnimate();
  const lines = useCheckoutSlot("lines");

  return (
    <CartControllerProvider locale={locale} open={open}>
      <div
        data-bitsnap-checkout-slot="lines"
        className={cx("bsc-scroll", lines.className)}
        style={lines.style}
        ref={productsParent}
      >
        <CartLines onContinueShopping={onClose} />
        <CartOptions />
      </div>
      <CartFooter onContinueShopping={continueUnderCheckout ? onClose : undefined} />
    </CartControllerProvider>
  );
};

export default CartComponentContent;
