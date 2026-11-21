import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CheckoutAppearanceProvider } from "./appearance.context";
import type { CheckoutAppearance } from "./appearance";
import CartComponentContent from "./CartComponentContent";
import { CartFrame } from "./CartFrame";
import CartProvider, { getLocale } from "./CartProvider";
import { registerWarmTarget, warmCart, whenIdle } from "./cart-warmup";
import { resolvePresentation, type CartPresentation } from "./presentation";
import { CheckoutTextsProvider } from "./texts.context";
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
  presentation?: CartPresentation;
}

function CartComponent({
  isVisible,
  shouldHide,
  panelId,
  locale,
  prefetch,
  presentation,
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

  return (
    <CartFrame
      isVisible={isVisible}
      shouldHide={shouldHide}
      panelId={panelId}
      presentation={presentation}
    >
      <CartComponentContent
        locale={locale}
        open={isVisible}
        onClose={shouldHide}
        continueUnderCheckout={resolvePresentation(presentation) === "dialog"}
      />
    </CartFrame>
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
