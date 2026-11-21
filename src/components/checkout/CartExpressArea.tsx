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
  // One height for the wallet row (Apple Pay's default is 30px, Google Pay's 40px).
  const walletStyle = { width: "100%", height: "48px" };

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
            style={walletStyle}
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
            style={walletStyle}
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
        {/* As the wallets: light artwork on the dark panel, 48px. Its frame
            is 5px wider than its box (Revolut's `min-width: calc(100% + 5px)`):
            the padding keeps it inside the panel. */}
        <RevolutPayButtonInner
          projectID={projectID}
          locale={locale}
          buttonStyle={{ variant: light ? "dark" : "light", height: "48px" }}
          style={{ paddingRight: 5 }}
        />
      </div>
    </>
  );
}
