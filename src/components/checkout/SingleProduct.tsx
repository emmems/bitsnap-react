import { useEffect, useState } from "react";
import { formatCurrency } from "./lib/round.number";
import type { SingleProduct } from "./product.details.model";
import { Button } from "@/src/ui/button";
import { MinusIcon, PlusIcon } from "lucide-react";
import { ButtonGroup } from "@/src/ui/button-group";

const SingleProduct = ({
  quantity,
  details,
  shouldUpdate,
}: {
  quantity: number;
  metadata?: { [key: string]: string | undefined };
  details: SingleProduct;
  shouldUpdate: (newQuantity?: number) => void;
}) => {
  return (
    <div className={"flex items-center gap-3 mx-3"}>
      <img
        className={
          "aspect-auto max-w-[30%] max-w-32 max-h-32 py-2 overflow-hidden"
        }
        src={details.image_url ?? ""}
        alt={details.name}
      />

      <div className={"flex flex-col w-full"}>
        <p className={"font-medium"}>{details.name}</p>
        <p className={"text-sm"} suppressHydrationWarning>
          {formatCurrency(details.price, details.currency)}
        </p>
        <div className={"flex justify-between"}>
          <QuantityComponent
            className={""}
            quantity={quantity}
            shouldUpdate={shouldUpdate}
          />
          <Button variant="ghost" size="sm" onClick={() => shouldUpdate(0)}>
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
    <div className={`flex ${className}`}>
      <ButtonGroup aria-label="Ilość">
        <Button onClick={decreaseQuantity}>
          <MinusIcon />
        </Button>
        <input
          className={"w-8 bg-transparent text-center"}
          value={quantityString}
          onInput={(e) => {
            setNewQuantity(e.currentTarget.value);
          }}
          type="text"
        />
        <Button onClick={increaseQuantity}>
          <PlusIcon />
        </Button>
      </ButtonGroup>
    </div>
  );
};
