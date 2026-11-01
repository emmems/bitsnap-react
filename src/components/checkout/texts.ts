import {
  lookupText,
  resolveTexts,
  type LocaleTables,
} from "@/src/lib/texts";

/**
 * Every string the checkout renders. Pass a partial object through the
 * `texts` prop of `BitsnapCheckout` to override any of them, whatever the
 * locale.
 */
export type CheckoutTexts = {
  /** Drawer title. */
  cart: string;
  /** Shown when the cart has no products. */
  emptyCart: string;
  /** Label next to the total price. */
  total: string;
  /** Delivery note next to the total price. */
  delivery: string;
  /** Country selector placeholder. */
  chooseCountry: string;
  /** Checkout button label. */
  nextStep: string;
  /** Error shown when some products are out of stock. */
  unavailableProducts: string;
  /** Error shown when the checkout fails and the server gave no reason. */
  checkoutFailed: string;
  /** Error shown when the shop has no payment gateway connected. */
  noPaymentGateway: string;
  /** Error shown when the payment gateway of the shop is not set up. */
  gatewayNotConfigured: string;
  /** Error shown when delivery of the shop is not set up. */
  shippingNotConfigured: string;
  /** Error shown when the cart mixes subscriptions with one-time products. */
  mixedRecurring: string;
  /** Error shown when the cart currency cannot be paid in. */
  currencyUnsupported: string;
  /** Error shown when a price changed after the product was added. */
  priceChanged: string;
  /** Accessible name of the close button of the drawer. */
  close: string;
  /** Remove button of a cart line (also read together with the product name). */
  remove: string;
  /** Accessible name of the quantity control and its input. */
  quantity: string;
  /** Accessible name of the "+" quantity button. */
  increaseQuantity: string;
  /** Accessible name of the "-" quantity button. */
  decreaseQuantity: string;
  /** Accessible name of the cart button when it only shows an icon. */
  openCart: string;
  /** Hidden label of the number of products badge; the number is appended after a colon. */
  cartItemsCount: string;
  /** Label before the lowest price of the last 30 days; the price is appended. */
  lowestPrice30Days: string;
  /** Shown instead of the lowest price when the price has no history. */
  noPriceHistory: string;
  /** Error shown when redirecting to the payment failed. */
  redirectFailed: string;
  /** Error shown when a subscription is added to the cart. */
  subscriptionUnsupported: string;
  /** Country search placeholder. */
  searchCountry: string;
  /** Shown when the country search has no match. */
  noCountriesFound: string;
  /** Hint under the checkout button when no country is chosen. */
  countryRequired: string;
  /** Title of the Apple Pay and Google Pay sheet total. */
  paymentForCart: string;
  /** Coupon label in the Google Pay sheet; the code is appended. */
  coupon: string;
  /** Note under the cart total. */
  extrasCalculatedNext: string;
  /** Error shown when the products of the cart could not be loaded. */
  loadFailed: string;
  /** Button that loads the cart again. */
  retry: string;
  /** Heading of the payment method choice (shown only when the shop offers paying by hand). */
  paymentMethodLegend: string;
  /** Option that pays through the shop's online gateway. */
  paymentMethodOnline: string;
  /** Hint under the online option. */
  paymentMethodOnlineDescription: string;
  /** Manual option when the seller takes bank transfers only. */
  paymentMethodManualTransfer: string;
  /** Manual option when the seller takes BLIK transfers to a phone number only. */
  paymentMethodManualBlik: string;
  /** Manual option when the seller takes both. */
  paymentMethodManualBoth: string;
  /** What paying by hand means: the details come after the order is placed. */
  paymentMethodManualDescription: string;
  /** Shown with a selected manual option that includes BLIK to a phone number. */
  paymentMethodManualBlikNote: string;
  /** Cash on delivery option. */
  paymentMethodCod: string;
  /** Hint under the cash on delivery option. */
  paymentMethodCodDescription: string;
  /** Error shown when the shop refused cash on delivery for the order. */
  paymentMethodCodUnavailable: string;
  /** Status while the provider confirms a payment started from an express button. */
  expressPending: string;
  /** Status after the provider confirmed the payment. */
  expressConfirmed: string;
  /** Status when the provider reports a failed payment. */
  expressFailed: string;
  /** Status when the buyer cancelled the provider's payment flow. */
  expressCancelled: string;
  /** Shown while the payment is still unconfirmed after a page return. */
  expressPendingLong: string;
  /** Error shown when the provider's button could not be loaded. */
  expressLoadFailed: string;
  /** Error shown when the cart cannot be paid with this provider right now. */
  expressCartUnavailable: string;
  /** Error shown when another tab/provider changed the same cart line. */
  expressCartConflict: string;
  /** Shown when the server total changed between mounting and paying. */
  expressPriceChanged: string;
  /** Error shown when a product could not be added before the InPost binding. */
  expressProductUnavailable: string;
};

export type CheckoutTextKey = keyof CheckoutTexts;

export const CHECKOUT_TEXT_TABLES: LocaleTables<CheckoutTextKey> = {
  en: {
    cart: "Cart",
    emptyCart: "Your cart is empty.",
    total: "Total:",
    delivery: "+ delivery",
    chooseCountry: "Choose a country",
    nextStep: "Next step",
    unavailableProducts: "Not all products are available.",
    checkoutFailed: "Something went wrong. Please try again later.",
    noPaymentGateway:
      "This shop doesn't accept online payments yet. Try again later or contact the seller.",
    gatewayNotConfigured:
      "Payments in this shop are not set up correctly. Try again later or contact the seller.",
    shippingNotConfigured:
      "Delivery in this shop is not configured yet. Try again later or contact the seller.",
    mixedRecurring:
      "Subscriptions and one-time products cannot be paid for together. Pay for them in separate orders.",
    currencyUnsupported:
      "The shop doesn't accept payments in this currency. Contact the seller.",
    priceChanged: "The product price has changed. Refresh the page to see the current price.",
    close: "Close cart",
    remove: "Remove",
    quantity: "Quantity",
    increaseQuantity: "Increase quantity",
    decreaseQuantity: "Decrease quantity",
    openCart: "Open cart",
    cartItemsCount: "Items in cart",
    lowestPrice30Days: "Lowest price in the last 30 days:",
    noPriceHistory: "No price data for the last 30 days",
    redirectFailed: "Could not redirect to the payment. Please try again later.",
    subscriptionUnsupported: "Subscriptions cannot be added to the cart yet.",
    searchCountry: "Find a country",
    noCountriesFound: "No countries found",
    countryRequired: "Choose a country to continue.",
    paymentForCart: "Cart payment",
    coupon: "Coupon",
    extrasCalculatedNext:
      "Discounts, shipping and taxes are calculated at the next step",
    loadFailed: "Could not load your cart.",
    retry: "Try again",
    paymentMethodLegend: "How would you like to pay?",
    paymentMethodOnline: "Pay online",
    paymentMethodOnlineDescription:
      "Card, BLIK code or instant bank payment. You pay right away.",
    paymentMethodManualTransfer: "Bank transfer",
    paymentMethodManualBlik: "BLIK – transfer to a phone number",
    paymentMethodManualBoth: "Bank transfer or BLIK to a phone number",
    paymentMethodManualDescription:
      "You pay in your bank's app. We show the payment details after you place the order, and the order waits for your payment.",
    paymentMethodManualBlikNote:
      "This is not a BLIK code payment – you do not enter a 6‑digit code.",
    paymentMethodCod: "Cash on delivery",
    paymentMethodCodDescription:
      "You pay the courier in cash or by card when you receive the parcel.",
    paymentMethodCodUnavailable:
      "Cash on delivery is not available for this order. Choose another way to pay.",
    expressPending: "Confirming your payment…",
    expressConfirmed: "Payment confirmed. Thank you!",
    expressFailed: "The payment failed. Your cart is unchanged.",
    expressCancelled: "Payment cancelled. Your cart is unchanged.",
    expressPendingLong:
      "We are still confirming your payment. We will check again when you come back to this page.",
    expressLoadFailed:
      "Could not load this payment button. Try again later or use the regular checkout.",
    expressCartUnavailable:
      "This cart cannot be paid with this method right now. Try again later.",
    expressCartConflict:
      "Your cart changed in another tab or in the provider's app. Review the quantities and try again.",
    expressPriceChanged:
      "Your cart total changed. Check the new total and try again.",
    expressProductUnavailable:
      "This product cannot be paid for right now. Try again later.",
  },
  pl: {
    cart: "Koszyk",
    emptyCart: "Brak produktów w koszyku.",
    total: "Suma:",
    delivery: "+ dostawa",
    chooseCountry: "Wybierz kraj",
    nextStep: "Następny krok",
    unavailableProducts: "Nie wszystkie produkty są dostępne w magazynie.",
    checkoutFailed: "Coś poszło nie tak. Spróbuj ponownie później.",
    noPaymentGateway:
      "Ten sklep nie przyjmuje jeszcze płatności online. Spróbuj ponownie później lub skontaktuj się ze sprzedawcą.",
    gatewayNotConfigured:
      "Płatności w tym sklepie nie są poprawnie skonfigurowane. Spróbuj ponownie później lub skontaktuj się ze sprzedawcą.",
    shippingNotConfigured:
      "Dostawa w tym sklepie nie jest jeszcze skonfigurowana. Spróbuj ponownie później lub skontaktuj się ze sprzedawcą.",
    mixedRecurring:
      "Subskrypcji i produktów jednorazowych nie można opłacić razem. Opłać je w osobnych zamówieniach.",
    currencyUnsupported:
      "Sklep nie przyjmuje płatności w tej walucie. Skontaktuj się ze sprzedawcą.",
    priceChanged: "Cena produktu się zmieniła. Odśwież stronę, aby zobaczyć aktualną cenę.",
    close: "Zamknij koszyk",
    remove: "Usuń",
    quantity: "Ilość",
    increaseQuantity: "Zwiększ ilość",
    decreaseQuantity: "Zmniejsz ilość",
    openCart: "Otwórz koszyk",
    cartItemsCount: "Produktów w koszyku",
    lowestPrice30Days: "Najniższa cena z 30 dni:",
    noPriceHistory: "Brak danych o cenie z ostatnich 30 dni",
    redirectFailed:
      "Nie udało się przekierować do płatności. Spróbuj ponownie później.",
    subscriptionUnsupported: "Subskrypcji nie można jeszcze dodać do koszyka.",
    searchCountry: "Znajdź kraj",
    noCountriesFound: "Nie znaleziono krajów",
    countryRequired: "Wybierz kraj, aby przejść dalej.",
    paymentForCart: "Płatność za koszyk",
    coupon: "Kupon",
    extrasCalculatedNext: "Rabaty, dostawa i podatki w następnym kroku",
    loadFailed: "Nie udało się wczytać koszyka.",
    retry: "Spróbuj ponownie",
    paymentMethodLegend: "Jak chcesz zapłacić?",
    paymentMethodOnline: "Zapłać online",
    paymentMethodOnlineDescription:
      "Karta, kod BLIK lub szybki przelew. Płacisz od razu.",
    paymentMethodManualTransfer: "Przelew bankowy",
    paymentMethodManualBlik: "BLIK – przelew na telefon",
    paymentMethodManualBoth: "Przelew lub BLIK na telefon",
    paymentMethodManualDescription:
      "Zapłacisz w aplikacji swojego banku. Dane do płatności pokażemy po złożeniu zamówienia, a zamówienie poczeka na Twoją wpłatę.",
    paymentMethodManualBlikNote:
      "To nie jest płatność kodem BLIK – nie wpisujesz 6‑cyfrowego kodu.",
    paymentMethodCod: "Płatność przy odbiorze",
    paymentMethodCodDescription:
      "Zapłacisz kurierowi gotówką lub kartą, gdy odbierzesz przesyłkę.",
    paymentMethodCodUnavailable:
      "Płatność przy odbiorze nie jest dostępna dla tego zamówienia. Wybierz inną formę płatności.",
    expressPending: "Potwierdzamy płatność…",
    expressConfirmed: "Płatność potwierdzona. Dziękujemy!",
    expressFailed: "Płatność się nie udała. Koszyk pozostał bez zmian.",
    expressCancelled: "Płatność została anulowana. Koszyk pozostał bez zmian.",
    expressPendingLong:
      "Nadal potwierdzamy Twoją płatność. Sprawdzimy ponownie, gdy wrócisz na tę stronę.",
    expressLoadFailed:
      "Nie udało się wczytać przycisku płatności. Spróbuj ponownie później lub skorzystaj ze zwykłego koszyka.",
    expressCartUnavailable:
      "Tego koszyka nie można teraz opłacić tą metodą. Spróbuj ponownie później.",
    expressCartConflict:
      "Koszyk zmienił się w innej karcie lub w aplikacji przewoźnika. Sprawdź ilości i spróbuj ponownie.",
    expressPriceChanged:
      "Suma koszyka się zmieniła. Sprawdź nową sumę i spróbuj ponownie.",
    expressProductUnavailable:
      "Nie można teraz zapłacić za ten produkt. Spróbuj ponownie później.",
  },
};

/** Default texts for a locale merged with the caller overrides. */
export function resolveCheckoutTexts(
  locale: string,
  overrides?: Partial<CheckoutTexts>,
): CheckoutTexts {
  return resolveTexts(CHECKOUT_TEXT_TABLES, locale, overrides);
}

export function getCheckoutText(
  key: CheckoutTextKey,
  locale: string,
  overrides?: Partial<CheckoutTexts>,
): string {
  return lookupText(resolveCheckoutTexts(locale, overrides), key);
}
