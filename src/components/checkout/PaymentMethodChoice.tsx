import React from "react";
import { useCheckoutSlot } from "./appearance.context";
import { cx } from "./lib/cx";
import {
  manualPaymentTitleKey,
  type PaymentMethod,
  type PaymentMethodChoice as Choice,
} from "./payment-method";
import { useCheckoutTextResolver } from "./texts.context";

/**
 * "Pay online", "transfer / BLIK to the seller's phone" or "cash on delivery",
 * shown above the checkout button when the shop offers two or more of them.
 * Native radios give the group semantics and the arrow-key navigation; the
 * whole card is the label.
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
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
