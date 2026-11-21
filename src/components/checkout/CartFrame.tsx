import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/src/lib/utils";
import { useCheckoutAppearance, useCheckoutSlot } from "./appearance.context";
import { useCheckoutText } from "./texts.context";
import { resolvePresentation, type CartPresentation } from "./presentation";

/**
 * The one shell of the cart, for every presentation (PLAN D7): the checkout
 * root, the Radix modal dialog, the overlay and the panel. Presentations differ
 * only in CSS keyed on `data-bitsnap-checkout-presentation`, which is written on
 * the root, the overlay and the panel.
 *
 * Behind it: focus goes to the panel on open (not to the close button, D11)
 * and back to whatever had it on close; a pointer down outside never closes
 * the cart, only the overlay's click does, so the press cannot reach the page.
 *
 * The panel's direct children are the header and the body's regions; nothing
 * wraps them (D7, N11).
 */
export function CartFrame({
  isVisible,
  shouldHide,
  panelId,
  presentation,
  children,
}: {
  isVisible: boolean;
  shouldHide: () => void;
  /** DOM id of the panel, for `aria-controls` of the button that opens it. */
  panelId?: string;
  presentation?: CartPresentation;
  children: ReactNode;
}) {
  const shown = resolvePresentation(presentation);
  // The drawer renders inside the checkout root: the stylesheet is scoped to `.bitsnap-react`.
  // No auto-animate here: it would run its "add" keyframes (opacity 0 for the
  // first ~250 ms) on the portalled panel. The stylesheet animates the overlay
  // and the panel on Radix's `data-state` instead.
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  // The opener lives outside of the dialog, so Radix does not know which element to give the focus back to.
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { boundaryClassName, boundaryStyle, boundaryAttributes } =
    useCheckoutAppearance();
  const root = useCheckoutSlot("root");
  const overlay = useCheckoutSlot("overlay");
  const panel = useCheckoutSlot("panel");

  return (
    <div
      ref={setRootElement}
      data-bitsnap-checkout="root"
      data-bitsnap-checkout-slot="root"
      data-bitsnap-checkout-presentation={shown}
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
              data-bitsnap-checkout-presentation={shown}
              aria-hidden="true"
              // Position, stacking and cursor live in the stylesheet, so a host
              // page's utility classes cannot override them.
              className={cn(overlay.className)}
              style={overlay.style}
              onClick={shouldHide}
            />
            <Dialog.Content
              ref={panelRef}
              id={panelId}
              data-bitsnap-checkout-slot="panel"
              data-bitsnap-checkout-presentation={shown}
              aria-modal="true"
              aria-describedby={undefined}
              tabIndex={-1}
              onOpenAutoFocus={(event) => {
                const active = document.activeElement;
                returnFocusTo.current =
                  active instanceof HTMLElement ? active : null;
                // The panel takes the focus, so no ring jumps to the close
                // button; the first Tab reaches it (D11).
                event.preventDefault();
                panelRef.current?.focus({ preventScroll: true });
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                returnFocusTo.current?.focus();
                returnFocusTo.current = null;
              }}
              // Position, width, layout and scrolling live in the stylesheet: a
              // host page's own `.w-full` or `.fixed` would otherwise win.
              className={cn(panel.className)}
              style={panel.style}
              // The overlay closes the cart on click; a close on pointer down would let the click through.
              onPointerDownOutside={(event) => event.preventDefault()}
            >
              <CartHeader onClose={shouldHide} />
              {children}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}

/** Title and close button of the cart. Rendered by `CartFrame` only (one module: each module costs bytes). */
export function CartHeader({ onClose }: { onClose: () => void }) {
  const header = useCheckoutSlot("header");
  const title = useCheckoutSlot("title");
  const closeButton = useCheckoutSlot("closeButton");
  const cartText = useCheckoutText("cart");
  const closeText = useCheckoutText("close");

  return (
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
        onClick={onClose}
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
          aria-hidden="true"
          focusable="false"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
