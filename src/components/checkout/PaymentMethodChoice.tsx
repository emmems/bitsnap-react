import React from "react";
import { useCheckoutSlot } from "./appearance.context";
import { cx } from "./lib/cx";
import {
  manualPaymentTitleKey,
  type PaymentLogo,
  type PaymentMethod,
  type PaymentMethodChoice as Choice,
} from "./payment-method";
import { useCheckoutTextResolver } from "./texts.context";

/**
 * "Pay online", "transfer / BLIK to the seller's phone" or "cash on delivery",
 * shown above the checkout button when the shop offers two or more of them.
 * Native radios give the group semantics and the arrow-key navigation; the
 * whole card is the label. A card shows the logos the server picked for it,
 * if any, under its description.
 */
export function PaymentMethodChoice({
  choice,
  selected,
  onChange,
  disabled,
}: {
  choice: Choice;
  selected: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
}) {
  const text = useCheckoutTextResolver();
  const group = useCheckoutSlot("paymentMethods");
  const option = useCheckoutSlot("paymentMethodOption");
  const name = React.useId();
  const legendId = React.useId();

  const hasBlik =
    choice.manualAccountTypes.length === 0 ||
    choice.manualAccountTypes.includes("blik");

  const options: Record<
    PaymentMethod,
    { title: string; description: string; note?: string }
  > = {
    online: {
      title: text("paymentMethodOnline"),
      description: text("paymentMethodOnlineDescription"),
    },
    manual: {
      title: text(manualPaymentTitleKey(choice.manualAccountTypes)),
      description: text("paymentMethodManualDescription"),
      note: hasBlik ? text("paymentMethodManualBlikNote") : undefined,
    },
    cod: {
      title: text("paymentMethodCod"),
      description: text("paymentMethodCodDescription"),
    },
  };

  return (
    <fieldset
      data-bitsnap-checkout-slot="paymentMethods"
      aria-labelledby={legendId}
      className={cx("bsc-methods", group.className)}
      style={group.style}
      disabled={disabled}
    >
      <legend id={legendId} className="bsc-label bsc-legend">
        {text("paymentMethodLegend")}
      </legend>
      {choice.methods.map((method) => {
        const card = options[method];
        const isSelected = method === selected;
        const descriptionId = `${name}-${method}-description`;
        return (
          <label
            key={method}
            data-bitsnap-checkout-slot="paymentMethodOption"
            data-payment-method={method}
            data-selected={isSelected ? "" : undefined}
            className={cx("bsc-method", option.className)}
            style={option.style}
          >
            <input
              type="radio"
              name={name}
              value={method}
              checked={isSelected}
              onChange={() => onChange(method)}
              aria-describedby={descriptionId}
              className="bsc-radio"
            />
            <span className="bsc-method-text">
              <span className="bsc-method-title">{card.title}</span>
              <span
                id={descriptionId}
                data-bitsnap-checkout-payment-method-description=""
                className="bsc-method-desc"
              >
                {card.description}
                {isSelected && card.note != null && (
                  <span className="bsc-method-note">{card.note}</span>
                )}
              </span>
              <PaymentMethodLogos logos={choice.logos?.[method]} />
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * The logos of one card. Decorative (the card text names the methods), so
 * hidden from assistive technology. Each sits in a fixed-height slot sized
 * from its intrinsic aspect ratio, so nothing moves when the images load.
 */
function PaymentMethodLogos({ logos }: { logos: PaymentLogo[] | undefined }) {
  const row = useCheckoutSlot("paymentMethodLogos");
  if (!logos?.length) {
    return null;
  }
  return (
    <span
      data-bitsnap-checkout-slot="paymentMethodLogos"
      aria-hidden="true"
      className={cx("bsc-method-logos", row.className)}
      style={row.style}
    >
      {logos.map((logo) => (
        <PaymentMethodLogo key={logo.id} logo={logo} />
      ))}
    </span>
  );
}

function PaymentMethodLogo({ logo }: { logo: PaymentLogo }) {
  const item = useCheckoutSlot("paymentMethodLogo");
  // A host CSP (img-src) may block the image: drop it instead of a broken icon.
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return null;
  }
  return (
    <span
      data-bitsnap-checkout-slot="paymentMethodLogo"
      data-payment-logo={logo.id}
      className={cx(
        "bsc-method-logo",
        logo.chip && "bsc-method-logo-chip",
        item.className,
      )}
      style={item.style}
    >
      <img
        src={logo.src}
        alt=""
        aria-hidden="true"
        decoding="async"
        width={logo.width}
        height={logo.height}
        onError={() => setFailed(true)}
        className="bsc-method-logo-img"
      />
    </span>
  );
}
