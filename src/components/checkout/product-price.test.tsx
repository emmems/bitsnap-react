import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductPrice } from "./ProductPrice";
import { CheckoutTextsProvider } from "./texts.context";
import type { ProductPricing } from "./product.details.model";

/** Intl uses non-breaking spaces; compare with plain ones. */
const plain = (text: string) => text.replace(/[  ]/g, " ");

const salePricing = {
  regularPrice: 12000,
  effectivePrice: 9980,
  discount: { status: "ACTIVE" },
  referencePrice: { historyAvailable: true, amount: 10500 },
} as unknown as ProductPricing;

function render(locale: string | undefined, pricing?: ProductPricing) {
  return plain(
    renderToStaticMarkup(
      <CheckoutTextsProvider locale={locale}>
        <ProductPrice price={9980} currency="PLN" pricing={pricing} />
      </CheckoutTextsProvider>,
    ),
  );
}

describe("ProductPrice", () => {
  it("formats amounts in the cart locale, not the browser language", () => {
    assert.ok(render("pl-PL").includes("99,80 zł"));
    assert.ok(render("pl").includes("99,80 zł"));
    assert.ok(render("en-US").includes("PLN 99.80"));
  });

  it("marks the struck price, the sale price and the Omnibus line for the stylesheet", () => {
    const html = render("pl-PL", salePricing);
    assert.match(html, /data-bitsnap-checkout-price="regular"[^>]*>120,00 zł</);
    assert.match(html, /data-bitsnap-checkout-price="sale"[^>]*>99,80 zł</);
    assert.match(html, /data-bitsnap-checkout-price="omnibus"[^>]*>[^<]*105,00 zł</);
  });

  it("leaves the colours to the stylesheet tokens", () => {
    const html = render("pl-PL", salePricing);
    assert.doesNotMatch(html, /text-(neutral|red)-\d/);
  });
});
