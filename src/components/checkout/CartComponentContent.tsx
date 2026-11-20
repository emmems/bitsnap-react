import { useAutoAnimate } from "@formkit/auto-animate/react";
import { CartCheckout } from "./CartCheckout";
import { CartControllerProvider } from "./cart-controller";
import { CartLines } from "./CartLines";

/**
 * The body of the cart. State and logic live in `cart-controller.tsx`; the
 * markup is in `CartLines` and `CartCheckout`, which read the controller from
 * context.
 */
const CartComponentContent = ({
  className,
  locale,
}: {
  className: string;
  locale?: string;
}) => {
  const [productsParent] = useAutoAnimate(/* optional config */);

  return (
    <CartControllerProvider locale={locale}>
      <div className={`${className} flex flex-col`} ref={productsParent}>
        <CartLines />

        <div className="grow"></div>

        <CartCheckout />
      </div>
    </CartControllerProvider>
  );
};

export default CartComponentContent;
