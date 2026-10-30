import React from "react";
import { cn } from "@/src/lib/utils";
import { useCheckoutSlot } from "./appearance.context";
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
      className={cn("mx-2 mt-4 mb-2 flex min-w-0 flex-col gap-2 border-0 p-0", group.className)}
      style={group.style}
      disabled={disabled}
    >
      <legend id={legendId} className="mb-1 px-1 text-sm font-medium">
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
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors",
              option.className,
            )}
            style={option.style}
          >
            <input
              type="radio"
              name={name}
              value={method}
              checked={isSelected}
              onChange={() => onChange(method)}
              aria-describedby={descriptionId}
              className="mt-0.5 size-4 shrink-0 cursor-pointer"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold leading-snug">{card.title}</span>
              <span
                id={descriptionId}
                data-bitsnap-checkout-payment-method-description=""
                className="text-xs leading-snug"
              >
                {card.description}
                {isSelected && card.note != null && (
                  <span className="mt-1 block font-medium">{card.note}</span>
                )}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
