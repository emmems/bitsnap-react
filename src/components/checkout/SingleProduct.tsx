import { useEffect, useRef, useState } from "react";
import type { SingleProduct } from "./product.details.model";
import { Button } from "@/src/ui/button";
import { MinusIcon, PlusIcon } from "lucide-react";
import { ButtonGroup } from "@/src/ui/button-group";
import { cn } from "@/src/lib/utils";
import { useCheckoutSlot } from "./appearance.context";
import { ProductPrice } from "./ProductPrice";
import { useCheckoutText } from "./texts.context";
import { clampQuantity, quantityFromInput } from "./quantity";

const SingleProduct = ({
  isNotAvailable,
  quantity,
  details,
  shouldUpdate,
}: {
  isNotAvailable: boolean;
  quantity: number;
  metadata?: { [key: string]: string | undefined };
  details: SingleProduct;
  /** Rejects when the cart could not be changed. */
  shouldUpdate: (newQuantity?: number) => Promise<unknown> | void;
}) => {
  const product = useCheckoutSlot("product");
  const productImage = useCheckoutSlot("productImage");
  const productName = useCheckoutSlot("productName");
  const productPrice = useCheckoutSlot("productPrice");
  const removeButton = useCheckoutSlot("removeButton");
  const removeText = useCheckoutText("remove");

  const imageUrl = details.image_url ?? details.images?.[0];
  const [brokenImageUrl, setBrokenImageUrl] = useState<string | undefined>();
  const showImage =
    imageUrl != null && imageUrl.length > 0 && imageUrl !== brokenImageUrl;
  const name = details.baseName ?? details.name;

  return (
    <div
      data-bitsnap-checkout-slot="product"
      data-bitsnap-checkout-unavailable={isNotAvailable ? "" : undefined}
      className={cn(
        "flex items-center gap-3 mx-3",
        isNotAvailable ? "outline outline-1 rounded-md m-1" : "",
        product.className,
      )}
      style={product.style}
    >
      {showImage && (
        <img
          data-bitsnap-checkout-slot="productImage"
          className={cn(
            "aspect-auto max-w-[30%] max-w-32 max-h-32 py-2 overflow-hidden",
            productImage.className,
          )}
          style={productImage.style}
          src={imageUrl}
          alt=""
          onError={() => setBrokenImageUrl(imageUrl)}
        />
      )}

      <div className={"flex flex-col w-full"}>
        <p
          data-bitsnap-checkout-slot="productName"
          className={cn("font-medium", productName.className)}
          style={productName.style}
        >
          {name}
        </p>
        {details.variantName != null && details.variantName.length > 0 && (
          <p className="text-sm opacity-70">{details.variantName}</p>
        )}
        <p
          data-bitsnap-checkout-slot="productPrice"
          className={cn("text-sm", productPrice.className)}
          style={productPrice.style}
          suppressHydrationWarning
        >
          <ProductPrice
            price={details.price}
            currency={details.currency}
            pricing={details.pricing}
            quantity={quantity}
          />
        </p>
        <div className={"flex justify-between"}>
          <QuantityComponent
            className={""}
            quantity={quantity}
            shouldUpdate={shouldUpdate}
          />
          <Button
            data-bitsnap-checkout-slot="removeButton"
            type="button"
            variant="ghost"
            size="sm"
            className={removeButton.className}
            style={removeButton.style}
            aria-label={`${removeText}: ${details.name}`}
            onClick={() => {
              Promise.resolve(shouldUpdate(0)).catch(() => undefined);
            }}
          >
            {removeText}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SingleProduct;

const QuantityComponent = ({
  quantity,
  shouldUpdate,
  className,
}: {
  quantity: number;
  shouldUpdate: (newQuantity: number) => Promise<unknown> | void;
  className: string;
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
      className={cn("flex", className, quantityControl.className)}
      style={quantityControl.style}
    >
      <ButtonGroup aria-label={quantityText}>
        <Button
          data-bitsnap-checkout-slot="quantityButton"
          type="button"
          className={quantityButton.className}
          style={quantityButton.style}
          aria-label={decreaseText}
          onClick={() => commit(clampQuantity(sent.current - 1))}
        >
          <MinusIcon aria-hidden="true" />
        </Button>
        <input
          data-bitsnap-checkout-slot="quantityInput"
          className={cn("w-8 bg-transparent text-center", quantityInput.className)}
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
        <Button
          data-bitsnap-checkout-slot="quantityButton"
          type="button"
          className={quantityButton.className}
          style={quantityButton.style}
          aria-label={increaseText}
          onClick={() => commit(clampQuantity(sent.current + 1))}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </ButtonGroup>
    </div>
  );
};
