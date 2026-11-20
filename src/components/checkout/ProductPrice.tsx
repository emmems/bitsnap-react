import type { ProductPricing } from "./product.details.model";
import { formatCurrency } from "./lib/round.number";
import { getLocale } from "./locale";
import { useCheckoutText, useCheckoutTextsConfig } from "./texts.context";

/**
 * Line price. On sale: the struck regular price, the sale price and the
 * Omnibus line (lowest price in the last 30 days). Their colours live in
 * `checkout.css` (`data-bitsnap-checkout-price`), read the `mutedForeground`
 * and `sale` tokens, and pass 4.5:1 on both default panels.
 */
export function ProductPrice({
  price,
  currency,
  pricing,
  quantity = 1,
}: {
  price: number;
  currency: string;
  pricing?: ProductPricing;
  quantity?: number;
}) {
  const lowestPriceText = useCheckoutText("lowestPrice30Days");
  const noPriceHistoryText = useCheckoutText("noPriceHistory");
  // Amounts follow the cart locale, not the browser language.
  const locale = useCheckoutTextsConfig().locale ?? getLocale();
  const format = (amount: number) => formatCurrency(amount, currency, locale);
  const regular = pricing?.regularPrice ?? price;
  const effective = pricing?.effectivePrice ?? price;
  const onSale = pricing?.discount?.status === "ACTIVE" && effective < regular;

  return (
    <span>
      {onSale ? (
        <>
          <span
            data-bitsnap-checkout-price="regular"
            className="mr-2 line-through"
          >
            {format(regular * quantity)}
          </span>
          <span data-bitsnap-checkout-price="sale" className="font-semibold">
            {format(effective * quantity)}
          </span>
          <span
            data-bitsnap-checkout-price="omnibus"
            className="mt-1 block text-xs"
          >
            {pricing?.referencePrice.historyAvailable && pricing.referencePrice.amount != null
              ? `${lowestPriceText} ${format(pricing.referencePrice.amount)}`
              : noPriceHistoryText}
          </span>
        </>
      ) : (
        format(effective * quantity)
      )}
    </span>
  );
}
