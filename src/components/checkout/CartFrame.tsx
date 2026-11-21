import * as Dialog from "@radix-ui/react-dialog";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./lib/cx";
import { useCheckoutAppearance, useCheckoutSlot } from "./appearance.context";
import { useCheckoutText } from "./texts.context";
import { resolvePresentation, type CartPresentation } from "./presentation";
import { useCheckoutStore } from "./state";

/**
 * Set on `<html>` while any cart is open (D19). A contract with the consent
 * module (`src/consent/core/ui.ts`), which hides its banner while it is
 * present; that module must not import the cart, so the literal is written
 * in both places.
 */
export const CART_OPEN_ATTRIBUTE = "data-bitsnap-cart-open";

/**
 * Open carts on the page, kept on `<html>` under a registry symbol rather than
 * in this module: a page can load two copies of the library (two bundles), and
 * closing one copy's cart must not drop the mark while the other's is open.
 */
const OPEN_CARTS = Symbol.for("bitsnap.cart.openCount");

type CountedElement = HTMLElement & { [OPEN_CARTS]?: number };

/**
 * Counts one open cart on `html` and sets the mark; the returned function
 * uncounts it and removes the mark when no cart is left open. Exported for
 * tests.
 */
export function markCartOpen(html: HTMLElement): () => void {
  const counted = html as CountedElement;
  counted[OPEN_CARTS] = (counted[OPEN_CARTS] ?? 0) + 1;
  html.setAttribute(CART_OPEN_ATTRIBUTE, "");
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const left = Math.max(0, (counted[OPEN_CARTS] ?? 0) - 1);
    counted[OPEN_CARTS] = left;
    if (left === 0) {
      html.removeAttribute(CART_OPEN_ATTRIBUTE);
    }
  };
}

/**
 * Marks `<html>` with `data-bitsnap-cart-open` while `open`. A layout effect,
 * so the consent banner is hidden before the cart's first frame is painted.
 */
function useCartOpenMark(open: boolean) {
  useLayoutEffect(
    () => (open ? markCartOpen(document.documentElement) : undefined),
    [open],
  );
}

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
 * wraps them (D7, N11). In the dialog the panel itself is the centred box
 * (R06): a wrapper would sit above the overlay and swallow outside clicks.
 *
 * While the cart is open, `<html>` carries `data-bitsnap-cart-open`, and the
 * consent banner hides (D19).
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
  useCartOpenMark(isVisible);
  // The root carries no `bitsnap-react` class: `cart.css` is not scoped to it,
  // and the main stylesheet's `.bitsnap-react { --background: ... }` would
  // redefine the shadcn variables on the root, so a token `var(--background)`
  // would read the library's value instead of the host's (19a review B1).
  // No auto-animate here: it would run its "add" keyframes (opacity 0 for the
  // first ~250 ms) on the portalled panel. The stylesheet animates the overlay
  // and the panel on Radix's `data-state` instead.
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  // The opener lives outside of the dialog, so Radix does not know which element to give the focus back to.
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { boundaryStyle, boundaryAttributes } = useCheckoutAppearance();
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
      className={root.className}
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
              className={cx(overlay.className)}
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
              className={cx(panel.className)}
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

/**
 * Title with the item count, and the close button. Rendered by `CartFrame`
 * only (one module: each module costs bytes in the cart-only bundle). The
 * count comes from the store, so it is right before the lines load.
 */
export function CartHeader({ onClose }: { onClose: () => void }) {
  const header = useCheckoutSlot("header");
  const title = useCheckoutSlot("title");
  const closeButton = useCheckoutSlot("closeButton");
  const cartText = useCheckoutText("cart");
  const closeText = useCheckoutText("close");
  // Unavailable lines are out of the total and must be removed, so they are
  // out of the count too (the trigger's badge counts every stored line).
  const count = useCheckoutStore(
    (state) => Math.max(0, state.numberOfProductsInCart - state.unavailableInCart),
  );

  return (
    <div
      data-bitsnap-checkout-slot="header"
      className={cx("bsc-header", header.className)}
      style={header.style}
    >
      <Dialog.Title asChild>
        <h1
          data-bitsnap-checkout-slot="title"
          className={cx("bsc-title", title.className)}
          style={title.style}
        >
          {cartText}
          {count > 0 && <span className="bsc-title-count"> ({count})</span>}
        </h1>
      </Dialog.Title>
      <button
        type="button"
        data-bitsnap-checkout-slot="closeButton"
        className={cx("bsc-icon-btn", closeButton.className)}
        style={closeButton.style}
        aria-label={closeText}
        onClick={onClose}
      >
        <svg
          className="bsc-icon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
