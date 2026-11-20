import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useEffect } from "react";
import { useCheckoutAppearance } from "./appearance.context";
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
    if (motionOff) {
      setEnabled(false);
      return () => setEnabled(true);
    }
  }, [motionOff, setEnabled]);
  return ref;
}

/**
 * The body of the cart. State and logic live in `cart-controller.tsx`; the
 * markup is in `CartLines` and `CartCheckout`, which read the controller from
 * context.
 */
const CartComponentContent = ({
  className,
  locale,
  open,
}: {
  className: string;
  locale?: string;
  open?: boolean;
}) => {
  const productsParent = useCartAutoAnimate();

  return (
    <CartControllerProvider locale={locale} open={open}>
      <div className={`${className} flex flex-col`} ref={productsParent}>
        <CartLines />

        <div className="grow"></div>

        <CartCheckout />
      </div>
    </CartControllerProvider>
  );
};

export default CartComponentContent;
