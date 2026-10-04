import { useEffect, useState } from "react";
import type { SingleProduct } from "./product.details.model";
import { Button } from "@/src/ui/button";
import { MinusIcon, PlusIcon } from "lucide-react";
import { ButtonGroup } from "@/src/ui/button-group";
import { cn } from "@/src/lib/utils";
import { useCheckoutSlot } from "./appearance.context";
import { ProductPrice } from "./ProductPrice";

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
  shouldUpdate: (newQuantity?: number) => void;
}) => {
  const product = useCheckoutSlot("product");
  const productImage = useCheckoutSlot("productImage");
  const productName = useCheckoutSlot("productName");
  const productPrice = useCheckoutSlot("productPrice");
  const removeButton = useCheckoutSlot("removeButton");

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
      <img
        data-bitsnap-checkout-slot="productImage"
        className={cn(
          "aspect-auto max-w-[30%] max-w-32 max-h-32 py-2 overflow-hidden",
          productImage.className,
        )}
        style={productImage.style}
        src={details.image_url ?? ""}
        alt={details.name}
      />

      <div className={"flex flex-col w-full"}>
        <p
          data-bitsnap-checkout-slot="productName"
          className={cn("font-medium", productName.className)}
          style={productName.style}
        >
          {details.name}
        </p>
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
            variant="ghost"
            size="sm"
            className={removeButton.className}
            style={removeButton.style}
            onClick={() => shouldUpdate(0)}
          >
            Usuń
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
  shouldUpdate: (newQuantity: number) => void;
  className: string;
}) => {
  const [quantityString, setQuantityString] = useState(quantity.toString());
  const [quantityValue, setQuantityValue] = useState(quantity);

  const quantityControl = useCheckoutSlot("quantityControl");
  const quantityInput = useCheckoutSlot("quantityInput");
  const quantityButton = useCheckoutSlot("quantityButton");

  useEffect(() => {
    shouldUpdate(quantityValue);
  }, [quantityValue]);

  function setNewQuantity(newQuantity: string) {
    setQuantityString(newQuantity);
    if (newQuantity.length == 0) {
      return;
    }
    const parsedInt = parseInt(newQuantity);
    if (isNaN(parsedInt)) {
      setQuantityValue(1);
      setQuantityString("");
      return;
    }
    if (parsedInt == 0 || parsedInt < 0) {
      setQuantityValue(1);
      setQuantityString("1");
      return;
    }
    setQuantityValue(parsedInt);
    setQuantityString(parsedInt.toString());
  }

  function increaseQuantity() {
    setQuantityValue(quantity + 1);
    setQuantityString((quantity + 1).toString());
  }

  function decreaseQuantity() {
    if (quantity > 1) {
      setQuantityString((quantity - 1).toString());
      setQuantityValue(quantity - 1);
      return;
    }
    setQuantityString(quantity.toString());
    setQuantityValue(quantity);
  }

  return (
    <div
      data-bitsnap-checkout-slot="quantityControl"
      className={cn("flex", className, quantityControl.className)}
      style={quantityControl.style}
    >
      <ButtonGroup aria-label="Ilość">
        <Button
          data-bitsnap-checkout-slot="quantityButton"
          className={quantityButton.className}
          style={quantityButton.style}
          onClick={decreaseQuantity}
        >
          <MinusIcon />
        </Button>
        <input
          data-bitsnap-checkout-slot="quantityInput"
          className={cn("w-8 bg-transparent text-center", quantityInput.className)}
          style={quantityInput.style}
          value={quantityString}
          onInput={(e) => {
            setNewQuantity(e.currentTarget.value);
          }}
          type="text"
        />
        <Button
          data-bitsnap-checkout-slot="quantityButton"
          className={quantityButton.className}
          style={quantityButton.style}
          onClick={increaseQuantity}
        >
          <PlusIcon />
        </Button>
      </ButtonGroup>
    </div>
  );
};
