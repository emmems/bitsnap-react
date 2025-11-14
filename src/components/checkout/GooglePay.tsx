import GooglePayButton from '@google-pay/button-react';
import CartProvider, { getProjectID, useCartProvider } from "./CartProvider";
import { useMutation, useQuery } from "react-query";
import { isErr } from './lib/err';

type Props = {
    test?: boolean;
    buttonSizeMode?: 'static' | 'fill';
    buttonColor?: 'white' | 'black';
    style?: {
        width?: string;
    };
    items: { name: string; id: string; price: number; quantity: number; isDeliverable?: boolean; metadata?: { [key: string]: string | undefined } }[];
};

function GooglePayButtonComponent({ items, style, buttonColor, buttonSizeMode, test }: Props) {
    const {
        getGooglePayConfiguration,
        completeGooglePayPayment,
        setCountry,
        setCouponCodeIfPossible,
        setDeliveryMethod,
        setEmail,
        setPostalCode,
        clearCart,
    } = useCartProvider();
    const { data: googlePayConfiguration } = useQuery(["get-google-pay-configuration", items.map(el => el.id).join(',')], () => getGooglePayConfiguration({
        items: items.map(el => ({
            ...el,
            id: undefined,
            productID: el.id,
        }))
    }));
    const { mutateAsync: completeGooglePayPaymentAsync, isLoading } = useMutation(completeGooglePayPayment);
    if (googlePayConfiguration == null || googlePayConfiguration.isAvailable != true) {
        console.log('google pay configuration is not available', googlePayConfiguration);
        return null;
    }

    return (
        <>
            <GooglePayButton
                buttonSizeMode={buttonSizeMode}
                buttonColor={buttonColor}
                style={style}
                existingPaymentMethodRequired={true}
                environment={test === true ? 'TEST' : 'PRODUCTION'}
                onPaymentDataChanged={async (paymentData) => {
                    console.log('payment data changed', paymentData);
                    if (paymentData.shippingAddress?.postalCode != null) {
                        await setPostalCode(paymentData.shippingAddress?.postalCode);
                    }
                    if (paymentData.shippingAddress?.countryCode != null) {
                        await setCountry(paymentData.shippingAddress?.countryCode);
                    }
                    if (paymentData.shippingOptionData?.id != null) {
                        await setDeliveryMethod(paymentData.shippingOptionData.id);
                    }

                    const config = await getGooglePayConfiguration({ items: [] });
                    console.log('PAYMENT DATA CHANGED CONFIG', config);
                    if (config.isAvailable) {
                        return {
                            error: undefined,
                            newShippingOptionParameters: config.config.shippingOptionParameters,
                            newTransactionInfo: config.config.transactionInfo,
                        }
                    }

                    return {
                        error: undefined,
                    }
                }}
                paymentRequest={googlePayConfiguration.config}
                onLoadPaymentData={async (paymentRequest) => {
                    try {
                        const result = await completeGooglePayPaymentAsync({
                            paymentData: paymentRequest
                        });
                        if (isErr(result)) {
                            console.log("apple pay error", result);
                            return;
                        }

                        result.isSuccess && clearCart();
                        if (result.redirectURL) {
                            open(result.redirectURL, "_self");
                        }
                    } catch (e) {
                        console.warn("error completing google pay payment", e);
                    }
                }}
            />
            {isLoading ? 'Ładowanie...' : null}
        </>
    );
}

function Wrapper(props: Props) {
    return (
        <>
            <CartProvider>
                <GooglePayButtonComponent {...props} />
            </CartProvider>
        </>
    );
}
export default Wrapper;
