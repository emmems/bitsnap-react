import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/src/lib/utils";
import {
  CheckoutAppearanceProvider,
  useCheckoutAppearance,
  useCheckoutSlot,
} from "./appearance.context";
import type { CheckoutAppearance } from "./appearance";
import CartComponentContent from "./CartComponentContent";
import CartProvider, { getLocale } from "./CartProvider";
import { registerWarmTarget, warmCart, whenIdle } from "./cart-warmup";
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
  /** Fill the cart's cache at the first idle moment. `false` turns it off. */
  prefetch?: boolean;
}

function CartComponent({
  isVisible,
  shouldHide,
  panelId,
  locale,
  prefetch,
}: Props) {
  const queryClient = useQueryClient();
  // Tells the warm-up (idle, hover, `Bitsnap.warmUp()`) which cache the drawer reads.
  useEffect(() => {
    const forget = registerWarmTarget({
      queryClient,
      locale: locale ?? getLocale(),
    });
    const cancel = prefetch === false ? undefined : whenIdle(() => warmCart());
    return () => {
      cancel?.();
      forget();
    };
  }, [queryClient, locale, prefetch]);
  // The drawer renders inside the checkout root: the stylesheet is scoped to `.bitsnap-react`.
  // No auto-animate here: it would run its "add" keyframes (opacity 0 for the
  // first ~250 ms) on the portalled panel. checkout.css animates the overlay
  // and the panel on Radix's `data-state` instead.
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  // The trigger lives outside of the dialog, so Radix does not know which element to give the focus back to.
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const { boundaryClassName, boundaryStyle, boundaryAttributes } =
    useCheckoutAppearance();
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
      ref={setRootElement}
      data-bitsnap-checkout="root"
      data-bitsnap-checkout-slot="root"
      {...boundaryAttributes}
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
              // Position, stacking and cursor live in checkout.css, so a host
              // page's utility classes cannot override them.
              className={cn(overlay.className)}
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
              // Position, width, layout and scrolling live in checkout.css: a host
              // page's own `.w-full` or `.fixed` would otherwise win (unlayered
              // host CSS beats the library's layered utilities).
              className={cn(panel.className)}
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
                  className={cn("rounded-xl transition", closeButton.className)}
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

              <CartComponentContent
                className={"grow"}
                locale={locale}
                open={isVisible}
              />
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
