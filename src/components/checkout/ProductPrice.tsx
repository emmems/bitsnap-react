import type { ProductPricing } from "./product.details.model";
import { formatCurrency } from "./lib/round.number";
import { getLocale } from "./locale";
import { useCheckoutText, useCheckoutTextsConfig } from "./texts.context";

/**
 * The amounts of a line: the unit price in effect, whether it is on sale, the
 * regular price and the Omnibus line (lowest price in the last 30 days), all
 * formatted in the cart locale, not the browser language.
 */
export function useLinePrice(price: number, currency: string, pricing?: ProductPricing) {
  const lowestPriceText = useCheckoutText("lowestPrice30Days");
  const noPriceHistoryText = useCheckoutText("noPriceHistory");
  const locale = useCheckoutTextsConfig().locale ?? getLocale();
  const format = (amount: number) => formatCurrency(amount, currency, locale);
  const regular = pricing?.regularPrice ?? price;
  const effective = pricing?.effectivePrice ?? price;
  const onSale = pricing?.discount?.status === "ACTIVE" && effective < regular;
  const omnibus = !onSale
    ? undefined
    : pricing?.referencePrice.historyAvailable && pricing.referencePrice.amount != null
      ? `${lowestPriceText} ${format(pricing.referencePrice.amount)}`
      : noPriceHistoryText;
  return { format, regular, effective, onSale, omnibus };
}

/**
 * Line price. On sale: the struck regular price above the sale price, and the
 * Omnibus line unless `omnibus={false}` (the cart line puts it in its own row).
 * Their colours live in `cart.css` (`data-bitsnap-checkout-price`), read the
 * `mutedForeground` and `sale` tokens, and pass 4.5:1 on both default panels.
 */
export function ProductPrice({
  price,
  currency,
  pricing,
  quantity = 1,
  omnibus: showOmnibus = true,
}: {
  price: number;
  currency: string;
  pricing?: ProductPricing;
  quantity?: number;
  omnibus?: boolean;
}) {
  const { format, regular, effective, onSale, omnibus } = useLinePrice(price, currency, pricing);

  if (!onSale) {
    return <span className="bsc-price-amount">{format(effective * quantity)}</span>;
  }
  return (
    <>
      <span data-bitsnap-checkout-price="regular" className="bsc-price-regular">
        {format(regular * quantity)}
      </span>
      <span data-bitsnap-checkout-price="sale" className="bsc-price-amount bsc-price-sale">
        {format(effective * quantity)}
      </span>
      {showOmnibus && (
        <span data-bitsnap-checkout-price="omnibus" className="bsc-price-omnibus">
          {omnibus}
        </span>
      )}
    </>
  );
}
