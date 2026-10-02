import { useAutoAnimate } from "@formkit/auto-animate/react";
import { createPortal } from "react-dom";
import { cn } from "@/src/lib/utils";
import {
  CheckoutAppearanceProvider,
  useCheckoutAppearance,
  useCheckoutSlot,
} from "./appearance.context";
import type { CheckoutAppearance } from "./appearance";
import CartComponentContent from "./CartComponentContent";
import CartProvider from "./CartProvider";
import { getLocale, translate } from "./locale";

interface Props {
  isVisible: boolean;
  shouldHide: () => void;
  locale?: string;
  appearance?: CheckoutAppearance;
}

function CartComponent({ isVisible, shouldHide, locale }: Props) {
  const [parent] = useAutoAnimate(/* optional config */);
  const { boundaryClassName, boundaryStyle } = useCheckoutAppearance();
  const root = useCheckoutSlot("root");
  const overlay = useCheckoutSlot("overlay");
  const panel = useCheckoutSlot("panel");
  const header = useCheckoutSlot("header");
  const title = useCheckoutSlot("title");
  const closeButton = useCheckoutSlot("closeButton");

  return (
    <div
      ref={parent}
      data-bitsnap-checkout="root"
      data-bitsnap-checkout-slot="root"
      className={cn("bitsnap-react", boundaryClassName, root.className)}
      style={{ zIndex: 999999, ...boundaryStyle, ...root.style }}
    >
      {isVisible && (
        <>
          <div
            data-bitsnap-checkout-slot="overlay"
            className={cn(
              "fixed top-0 right-0 left-0 bottom-0 cursor-pointer z-10",
              overlay.className,
            )}
            style={overlay.style}
            onClick={shouldHide}
          ></div>
          <div
            data-bitsnap-checkout-slot="panel"
            className={cn(
              "fixed z-20 top-0 right-0 bottom-0 w-full md:w-[350px] xl:w-[420px] flex flex-col",
              panel.className,
            )}
            style={panel.style}
          >
            <div
              data-bitsnap-checkout-slot="header"
              className={cn(
                "mx-3 mt-7 flex justify-between items-center",
                header.className,
              )}
              style={header.style}
            >
              <h1
                data-bitsnap-checkout-slot="title"
                className={cn("text-2xl font-medium", title.className)}
                style={title.style}
              >
                {translate("cart", locale ?? getLocale())}
              </h1>
              <button
                data-bitsnap-checkout-slot="closeButton"
                className={cn(
                  "rounded-xl p-2 transition",
                  closeButton.className,
                )}
                style={closeButton.style}
                onClick={shouldHide}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-x"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <CartComponentContent className={"grow"} locale={locale} />
          </div>
        </>
      )}
    </div>
  );
}

const WrapperCartComponent = (props: Props) => {
  if (typeof window === "undefined") {
    return null;
  }

  return createPortal(
    <CheckoutAppearanceProvider appearance={props.appearance}>
      <CartProvider locale={props.locale}>
        <CartComponent {...props} />
      </CartProvider>
    </CheckoutAppearanceProvider>,
    document.body,
  );
};

export default WrapperCartComponent;
