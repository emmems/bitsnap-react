import { cx } from "./lib/cx";
import { InPostPayButtonInner } from "../express/InPostPayButton";
import { RevolutPayButtonInner } from "../express/RevolutPayButton";
import { useCheckoutAppearance, useCheckoutSlot } from "./appearance.context";
import ApplePayButton from "./ApplePay";
import type { WalletItem } from "./cart-view";
import { getProjectID } from "./CartProvider";
import GooglePayButton from "./GooglePay";

/**
 * The express buttons of the cart: Apple Pay, Google Pay, InPost Pay and
 * Revolut Pay (D12). A separate chunk, loaded by `CartCheckout` when the drawer
 * opens (plan part 1 slice 5, part 2 step 9). It is rendered inside the
 * wallets container of `CartCheckout`, which owns the inert state: a button
 * here is never clickable while a line is unconfirmed or price-marked.
 */
export default function CartExpressArea({
  locale,
  isApplePayAvailable,
  oneClick,
  items,
}: {
  locale: string;
  isApplePayAvailable: boolean | undefined;
  /** Apple Pay and Google Pay are hidden while a line is pay-what-you-want. */
  oneClick: boolean;
  items: WalletItem[];
}) {
  const paymentButtons = useCheckoutSlot("paymentButtons");
  const projectID = getProjectID() ?? "";
  // White artwork on the dark panel, black on the light one (PLAN §5 item 13).
  const light = useCheckoutAppearance().theme === "light";

  return (
    <>
      {isApplePayAvailable && oneClick && (
        <div
          data-bitsnap-checkout-slot="paymentButtons"
          className={cx("bsc-express-btn", paymentButtons.className)}
          style={paymentButtons.style}
        >
          <ApplePayButton
            colorType={light ? "black" : "white"}
            style={{ width: "100%" }}
            items={items}
          />
        </div>
      )}
      {oneClick && (
        <div
          data-bitsnap-checkout-slot="paymentButtons"
          className={cx("bsc-express-btn", paymentButtons.className)}
          style={paymentButtons.style}
        >
          <GooglePayButton
            buttonSizeMode="fill"
            buttonColor={light ? "black" : "white"}
            style={{ width: "100%" }}
            items={items}
          />
        </div>
      )}
      <div
        data-bitsnap-checkout-slot="paymentButtons"
        className={cx("bsc-express-btn bsc-express-wide", paymentButtons.className)}
        style={paymentButtons.style}
      >
        <InPostPayButtonInner projectID={projectID} locale={locale} />
        <RevolutPayButtonInner projectID={projectID} locale={locale} />
      </div>
    </>
  );
}
