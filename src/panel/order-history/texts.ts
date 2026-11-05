import { pickLocaleTable, type LocaleTables } from "../../lib/texts";

/**
 * Strings of the buyer's order history. `{name}` placeholders are filled by
 * `orderHistoryLine`; a variant without a value exists for every optional one,
 * so a line never shows an empty placeholder or empty brackets.
 */
export type OrderHistoryTexts = {
  heading: string;
  showMore: string;
  loadingMore: string;
  paid: string;
  paidWith: string;
  shipped: string;
  statusChangedTo: string;
  statusChanged: string;
  trackingNumber: string;
  trackingNumberCarrier: string;
  accessEmailSentTo: string;
  accessEmailSent: string;
  emailSentTo: string;
  emailSent: string;
  accessGrantedProduct: string;
  accessGranted: string;
  invoiceIssuedNumber: string;
  invoiceIssued: string;
  invoiceLink: string;
  refundedAmount: string;
  refunded: string;
  returnRequested: string;
  returnStatusChangedTo: string;
  returnStatusChanged: string;
};

const ORDER_HISTORY_TEXT_TABLES: LocaleTables<keyof OrderHistoryTexts> = {
  pl: {
    heading: "Historia zamówienia",
    showMore: "Pokaż więcej",
    loadingMore: "Ładowanie…",
    paid: "Zamówienie opłacone",
    paidWith: "Zamówienie opłacone przez {provider}",
    shipped: "Zamówienie wysłane",
    statusChangedTo: "Status zamówienia: {status}",
    statusChanged: "Zmieniono status zamówienia",
    trackingNumber: "Numer przesyłki: {number}",
    trackingNumberCarrier: "Numer przesyłki: {number} ({carrier})",
    accessEmailSentTo: "Wysłano e-mail z dostępem na {email}",
    accessEmailSent: "Wysłano e-mail z dostępem",
    emailSentTo: "Wysłano e-mail na {email}",
    emailSent: "Wysłano e-mail",
    accessGrantedProduct: "Przyznano dostęp: {product}",
    accessGranted: "Przyznano dostęp",
    invoiceIssuedNumber: "Wystawiono fakturę {number}",
    invoiceIssued: "Wystawiono fakturę",
    invoiceLink: "Pobierz fakturę",
    refundedAmount: "Zwrócono {amount}",
    refunded: "Zwrócono pieniądze",
    returnRequested: "Zgłoszono zwrot",
    returnStatusChangedTo: "Status zwrotu: {status}",
    returnStatusChanged: "Zmieniono status zwrotu",
  },
  en: {
    heading: "Order history",
    showMore: "Show more",
    loadingMore: "Loading…",
    paid: "Order paid",
    paidWith: "Order paid with {provider}",
    shipped: "Order shipped",
    statusChangedTo: "Order status: {status}",
    statusChanged: "Order status changed",
    trackingNumber: "Tracking number: {number}",
    trackingNumberCarrier: "Tracking number: {number} ({carrier})",
    accessEmailSentTo: "Access e-mail sent to {email}",
    accessEmailSent: "Access e-mail sent",
    emailSentTo: "E-mail sent to {email}",
    emailSent: "E-mail sent",
    accessGrantedProduct: "Access granted: {product}",
    accessGranted: "Access granted",
    invoiceIssuedNumber: "Invoice {number} issued",
    invoiceIssued: "Invoice issued",
    invoiceLink: "Download the invoice",
    refundedAmount: "Refunded {amount}",
    refunded: "Money refunded",
    returnRequested: "Return requested",
    returnStatusChangedTo: "Return status: {status}",
    returnStatusChanged: "Return status changed",
  },
};

export function getOrderHistoryTexts(locale: string): OrderHistoryTexts {
  return pickLocaleTable(ORDER_HISTORY_TEXT_TABLES, locale);
}
