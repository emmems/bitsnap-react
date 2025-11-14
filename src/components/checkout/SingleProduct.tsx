import { useEffect, useState } from "react";
import { formatCurrency } from "./lib/round.number";
import type { SingleProduct } from "./product.details.model";


const SingleProduct = ({ quantity, details, shouldUpdate }: {
    quantity: number;
    metadata?: { [key: string]: string | undefined };
    details: SingleProduct;
    shouldUpdate: (newQuantity?: number) => void;
}) => {

    return (
        <div className={'flex items-center gap-3'}>
            <img className={'aspect-auto max-w-[30%] max-w-32 max-h-32'} src={details.image_url ?? ''} alt={details.name} />

            <div className={'flex flex-col'}>
                <p className={'font-medium'}>{details.name}</p>
                <p className={'text-sm'}>{formatCurrency(details.price, details.currency)}</p>
                <div className={'flex justify-between'}>
                    <QuantityComponent className={""} quantity={quantity} shouldUpdate={shouldUpdate} />
                    <button className={'text-sm font-medium'} onClick={() => shouldUpdate(0)}>Usuń</button>
                </div>
            </div>
        </div>
    );
}

export default SingleProduct;

const QuantityComponent = (
    {
        quantity,
        shouldUpdate,
        className
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
            setQuantityString('');
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
        <div className={`flex ${className} items-center border dark:border-neutral-400 border-neutral-700 rounded-md my-1`}>
            <button onClick={decreaseQuantity} className={'px-2 py-1'}>-</button>
            <input
                className={'w-8 bg-transparent text-center'}
                value={quantityString}
                onInput={(e) => { setNewQuantity(e.currentTarget.value) }}
                type="text"
            />
            <button onClick={increaseQuantity} className={'px-2 py-1'}>+</button>
        </div>
    );
}
