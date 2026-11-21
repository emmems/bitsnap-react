import { useEffect, useRef, useState } from "react";
import type { CartLineDetails } from "./cart-snapshot";
import { formatCurrency } from "./lib/round.number";
import { getLocale } from "./locale";
import type { ProductPricing } from "./product.details.model";
import { cx } from "./lib/cx";
import { useCheckoutSlot } from "./appearance.context";
import { AlertIcon, ImageIcon, MinusIcon, PlusIcon, TrashIcon } from "./icons";
import { ProductPrice, useLinePrice } from "./ProductPrice";
import { useCheckoutText, useCheckoutTextsConfig } from "./texts.context";
import { clampQuantity, quantityFromInput } from "./quantity";

/** Same text, ignoring case and surrounding spaces (F-09: "Ebook" under "Ebook"). */
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * One cart line (plan part 3 §3.3): a 72 px thumbnail (or a placeholder tile),
 * the name, the variant when it differs from the name, the unit price for a
 * quantity above 1, the line total, a pill stepper and a trash button.
 */
const SingleProduct = ({
  isNotAvailable,
  quantity,
  details,
  unitPrice,
  pricing,
  priceWas,
  marked = false,
  refreshing = false,
  url,
  shouldUpdate,
}: {
  isNotAvailable: boolean;
  quantity: number;
  metadata?: { [key: string]: string | undefined };
  /** Product page; the image and the name link to it. */
  url?: string;
  /** From the server or from the local snapshot: both satisfy it. */
  details: CartLineDetails;
  /** Unit price in minor units; `undefined` while it is not known (no price is shown). */
  unitPrice?: number;
  /** Sale and Omnibus data; absent for a pay-what-you-want line priced at its amount. */
  pricing?: ProductPricing;
  /** The unit price shown before it changed while the drawer was open. */
  priceWas?: number;
  /** The price is new to the buyer and not accepted yet (price gate). */
  marked?: boolean;
  /** An older snapshot price is on screen while the server is asked. */
  refreshing?: boolean;
  /** Rejects when the cart could not be changed. */
  shouldUpdate: (newQuantity?: number) => Promise<unknown> | void;
}) => {
  const product = useCheckoutSlot("product");
  const productImage = useCheckoutSlot("productImage");
  const productName = useCheckoutSlot("productName");
  const productVariant = useCheckoutSlot("productVariant");
  const productUnitPrice = useCheckoutSlot("productUnitPrice");
  const productPrice = useCheckoutSlot("productPrice");
  const removeButton = useCheckoutSlot("removeButton");
  const removeText = useCheckoutText("remove");
  const unavailableText = useCheckoutText("unavailableProduct");
  const priceUpdatedText = useCheckoutText("priceUpdated");
  const textsLocale = useCheckoutTextsConfig().locale;
  const { format, effective, omnibus } = useLinePrice(
    unitPrice ?? 0,
    details.currency,
    pricing,
  );

  const imageUrl = details.image_url ?? details.images?.[0];
  const [brokenImageUrl, setBrokenImageUrl] = useState<string | undefined>();
  const showImage =
    imageUrl != null && imageUrl.length > 0 && imageUrl !== brokenImageUrl;
  const name = details.baseName ?? details.name;
  const variant = details.variantName;
  const showVariant =
    variant != null && variant.trim().length > 0 && !sameText(variant, name);

  function remove(button: HTMLButtonElement) {
    // The line leaves with the write: focus moves to the next line's remove
    // button, else the previous one, else the panel (plan part 3 §3.5).
    const buttons = Array.from(
      button
        .closest('[data-bitsnap-checkout-slot="productList"]')
        ?.querySelectorAll<HTMLButtonElement>(".bsc-line-remove") ?? [],
    );
    const index = buttons.indexOf(button);
    const next = buttons[index + 1] ?? buttons[index - 1];
    const panel = button.closest<HTMLElement>('[data-bitsnap-checkout-slot="panel"]');
    Promise.resolve(shouldUpdate(0))
      .then(() => {
        // The write is async: by now React removed the line and the dialog's
        // focus scope may have moved the focus to the panel itself.
        const active = document.activeElement;
        if (
          active == null ||
          active === document.body ||
          active === panel ||
          !active.isConnected ||
          active === button
        ) {
          (next?.isConnected ? next : panel)?.focus({ preventScroll: true });
        }
      })
      .catch(() => undefined);
  }

  return (
    <div
      data-bitsnap-checkout-slot="product"
      data-bitsnap-checkout-unavailable={isNotAvailable ? "" : undefined}
      className={cx("bsc-line", product.className)}
      style={product.style}
    >
      <ProductLink
        url={url}
        // The name links to the same page; one link per item for keyboards.
        tabIndex={-1}
        aria-hidden="true"
        className="bsc-line-thumb-link"
      >
        {showImage ? (
          <img
            data-bitsnap-checkout-slot="productImage"
            className={cx("bsc-line-thumb", productImage.className)}
            style={productImage.style}
            src={imageUrl}
            alt=""
            onError={() => setBrokenImageUrl(imageUrl)}
          />
        ) : (
          <span
            data-bitsnap-checkout-slot="productImage"
            data-bitsnap-checkout-placeholder=""
            aria-hidden="true"
            className={cx("bsc-line-thumb bsc-line-thumb-empty", productImage.className)}
            style={productImage.style}
          >
            <ImageIcon />
          </span>
        )}
      </ProductLink>

      <div className="bsc-line-info">
        <p
          data-bitsnap-checkout-slot="productName"
          className={cx("bsc-line-name", productName.className)}
          style={productName.style}
        >
          <ProductLink url={url} className="bsc-line-link">
            {name}
          </ProductLink>
        </p>
        {showVariant && (
          <p
            data-bitsnap-checkout-slot="productVariant"
            className={cx("bsc-line-meta", productVariant.className)}
            style={productVariant.style}
          >
            {variant}
          </p>
        )}
        {unitPrice != null && quantity > 1 && (
          <p
            data-bitsnap-checkout-slot="productUnitPrice"
            className={cx("bsc-line-meta bsc-num", productUnitPrice.className)}
            style={productUnitPrice.style}
            suppressHydrationWarning
          >
            {`${format(effective)} × ${quantity}`}
          </p>
        )}
        {isNotAvailable && name !== unavailableText && (
          <p className="bsc-line-meta bsc-line-unavailable">{unavailableText}</p>
        )}
      </div>

      <p
        data-bitsnap-checkout-slot="productPrice"
        data-bitsnap-checkout-state={
          marked ? "price-updated" : refreshing ? "refreshing" : undefined
        }
        className={cx("bsc-line-price", productPrice.className)}
        style={productPrice.style}
        suppressHydrationWarning
      >
        {unitPrice != null && (
          <ProductPrice
            price={unitPrice}
            currency={details.currency}
            pricing={pricing}
            quantity={quantity}
            omnibus={false}
          />
        )}
      </p>

      {marked && priceWas != null && unitPrice != null && priceWas !== unitPrice && (
        <p data-bitsnap-checkout-price="updated" className="bsc-line-mark">
          <AlertIcon />
          <span>
            {priceUpdatedText
              .replace(
                "{was}",
                formatCurrency(priceWas, details.currency, textsLocale ?? getLocale()),
              )
              .replace(
                "{now}",
                formatCurrency(unitPrice, details.currency, textsLocale ?? getLocale()),
              )}
          </span>
        </p>
      )}

      <div className="bsc-line-controls">
        <QuantityComponent name={details.name} quantity={quantity} shouldUpdate={shouldUpdate} />
        <button
          data-bitsnap-checkout-slot="removeButton"
          type="button"
          className={cx("bsc-icon-btn bsc-line-remove", removeButton.className)}
          style={removeButton.style}
          aria-label={`${removeText}: ${details.name}`}
          title={removeText}
          onClick={(event) => remove(event.currentTarget)}
        >
          <TrashIcon />
        </button>
      </div>

      {unitPrice != null && omnibus != null && (
        <p data-bitsnap-checkout-price="omnibus" className="bsc-line-omnibus">
          {omnibus}
        </p>
      )}
    </div>
  );
};

export default SingleProduct;

/** The children as a link to the product page, or as they are without one. */
const ProductLink = ({
  url,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  url?: string;
  children: React.ReactNode;
}) => {
  if (url == null) {
    return <>{children}</>;
  }
  return (
    <a href={url} {...props}>
      {children}
    </a>
  );
};

const QuantityComponent = ({
  name,
  quantity,
  shouldUpdate,
}: {
  /** The line's name, so each group is told apart ("Quantity: Mug Blue"). */
  name: string;
  quantity: number;
  shouldUpdate: (newQuantity: number) => Promise<unknown> | void;
}) => {
  const [quantityString, setQuantityString] = useState(quantity.toString());
  // The last quantity sent, so quick clicks count from it before the cart reloads.
  const sent = useRef(quantity);

  const quantityControl = useCheckoutSlot("quantityControl");
  const quantityInput = useCheckoutSlot("quantityInput");
  const quantityButton = useCheckoutSlot("quantityButton");
  const quantityText = useCheckoutText("quantity");
  const increaseText = useCheckoutText("increaseQuantity");
  const decreaseText = useCheckoutText("decreaseQuantity");

  const shownQuantity = useRef(quantity);
  shownQuantity.current = quantity;

  // The cart is the source of truth once it has reloaded.
  useEffect(() => {
    sent.current = quantity;
    setQuantityString(quantity.toString());
  }, [quantity]);

  function commit(newQuantity: number) {
    setQuantityString(newQuantity.toString());
    if (newQuantity !== sent.current) {
      sent.current = newQuantity;
      Promise.resolve(shouldUpdate(newQuantity)).catch(() => {
        // The cart rejected it: show what the cart has.
        if (sent.current === newQuantity) {
          sent.current = shownQuantity.current;
          setQuantityString(shownQuantity.current.toString());
        }
      });
    }
  }

  return (
    <div
      data-bitsnap-checkout-slot="quantityControl"
      role="group"
      aria-label={`${quantityText}: ${name}`}
      className={cx("bsc-stepper", quantityControl.className)}
      style={quantityControl.style}
    >
      <button
        data-bitsnap-checkout-slot="quantityButton"
        type="button"
        className={cx("bsc-stepper-btn", quantityButton.className)}
        style={quantityButton.style}
        aria-label={decreaseText}
        onClick={() => commit(clampQuantity(sent.current - 1))}
      >
        <MinusIcon />
      </button>
      <input
        data-bitsnap-checkout-slot="quantityInput"
        className={cx("bsc-stepper-input", quantityInput.className)}
        style={quantityInput.style}
        value={quantityString}
        aria-label={quantityText}
        inputMode="numeric"
        pattern="[0-9]*"
        onChange={(e) => setQuantityString(e.currentTarget.value)}
        onBlur={(e) => commit(quantityFromInput(e.currentTarget.value, sent.current))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(quantityFromInput(e.currentTarget.value, sent.current));
          }
        }}
        type="text"
      />
      <button
        data-bitsnap-checkout-slot="quantityButton"
        type="button"
        className={cx("bsc-stepper-btn", quantityButton.className)}
        style={quantityButton.style}
        aria-label={increaseText}
        onClick={() => commit(clampQuantity(sent.current + 1))}
      >
        <PlusIcon />
      </button>
    </div>
  );
};
