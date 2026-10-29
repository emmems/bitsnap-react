import { useAutoAnimate } from "@formkit/auto-animate/react";
import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useRef, useState } from "react";
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
import { CheckoutTextsProvider, useCheckoutText } from "./texts.context";
import type { CheckoutTexts } from "./texts";

interface Props {
  isVisible: boolean;
  shouldHide: () => void;
  locale?: string;
  appearance?: CheckoutAppearance;
  texts?: Partial<CheckoutTexts>;
  /** DOM id of the panel, for `aria-controls` of the button that opens it. */
  panelId?: string;
}

function CartComponent({ isVisible, shouldHide, panelId, locale }: Props) {
  const [parent] = useAutoAnimate(/* optional config */);
  // The drawer renders inside the checkout root: the stylesheet is scoped to `.bitsnap-react`.
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const rootRef = useCallback(
    (element: HTMLDivElement | null) => {
      parent(element);
      setRootElement(element);
    },
    [parent],
  );
  // The trigger lives outside of the dialog, so Radix does not know which element to give the focus back to.
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const { boundaryClassName, boundaryStyle } = useCheckoutAppearance();
  const root = useCheckoutSlot("root");
  const overlay = useCheckoutSlot("overlay");
  const panel = useCheckoutSlot("panel");
  const header = useCheckoutSlot("header");
  const title = useCheckoutSlot("title");
  const closeButton = useCheckoutSlot("closeButton");
  const cartText = useCheckoutText("cart");
  const closeText = useCheckoutText("close");

  return (
    <div
      ref={rootRef}
      data-bitsnap-checkout="root"
      data-bitsnap-checkout-slot="root"
      className={cn("bitsnap-react", boundaryClassName, root.className)}
      style={{ zIndex: 999999, ...boundaryStyle, ...root.style }}
    >
      {rootElement != null && (
        <Dialog.Root
          open={isVisible}
          onOpenChange={(open) => {
            if (!open) {
              shouldHide();
            }
          }}
        >
          <Dialog.Portal container={rootElement}>
            <Dialog.Overlay
              data-bitsnap-checkout-slot="overlay"
              aria-hidden="true"
              className={cn(
                "fixed top-0 right-0 left-0 bottom-0 cursor-pointer z-10",
                overlay.className,
              )}
              style={overlay.style}
              onClick={shouldHide}
            />
            <Dialog.Content
              id={panelId}
              data-bitsnap-checkout-slot="panel"
              aria-modal="true"
              aria-describedby={undefined}
              onOpenAutoFocus={() => {
                const active = document.activeElement;
                returnFocusTo.current = active instanceof HTMLElement ? active : null;
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                returnFocusTo.current?.focus();
                returnFocusTo.current = null;
              }}
              className={cn(
                // Scrolls when the summary and the payment choice do not fit (small phones).
                "fixed z-20 top-0 right-0 bottom-0 w-full md:w-[350px] xl:w-[420px] flex flex-col overflow-y-auto",
                panel.className,
              )}
              style={panel.style}
              // The overlay closes the drawer on click; a close on pointer down would let the click through.
              onPointerDownOutside={(event) => event.preventDefault()}
            >
              <div
                data-bitsnap-checkout-slot="header"
                className={cn(
                  "mx-3 mt-7 flex justify-between items-center",
                  header.className,
                )}
                style={header.style}
              >
                <Dialog.Title asChild>
                  <h1
                    data-bitsnap-checkout-slot="title"
                    className={cn("text-2xl font-medium", title.className)}
                    style={title.style}
                  >
                    {cartText}
                  </h1>
                </Dialog.Title>
                <button
                  type="button"
                  data-bitsnap-checkout-slot="closeButton"
                  className={cn(
                    "rounded-xl p-2 transition",
                    closeButton.className,
                  )}
                  style={closeButton.style}
                  aria-label={closeText}
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
                    aria-hidden="true"
                    focusable="false"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <CartComponentContent className={"grow"} locale={locale} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
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
      <CheckoutTextsProvider texts={props.texts} locale={props.locale}>
        <CartProvider locale={props.locale}>
          <CartComponent {...props} />
        </CartProvider>
      </CheckoutTextsProvider>
    </CheckoutAppearanceProvider>,
    document.body,
  );
};

export default WrapperCartComponent;
