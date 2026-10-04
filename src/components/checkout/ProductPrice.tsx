import type { ProductPricing } from "./product.details.model";
import { formatCurrency } from "./lib/round.number";

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
  const regular = pricing?.regularPrice ?? price;
  const effective = pricing?.effectivePrice ?? price;
  const onSale = pricing?.discount?.status === "ACTIVE" && effective < regular;

  return (
    <span>
      {onSale ? (
        <>
          <span className="mr-2 text-neutral-500 line-through">
            {formatCurrency(regular * quantity, currency)}
          </span>
          <span className="font-semibold text-red-700">
            {formatCurrency(effective * quantity, currency)}
          </span>
          <span className="mt-1 block text-xs text-neutral-600">
            {pricing?.referencePrice.historyAvailable && pricing.referencePrice.amount != null
              ? `Najniższa cena z 30 dni: ${formatCurrency(pricing.referencePrice.amount, currency)}`
              : "Brak danych o cenie z ostatnich 30 dni"}
          </span>
        </>
      ) : (
        formatCurrency(effective * quantity, currency)
      )}
    </span>
  );
}
