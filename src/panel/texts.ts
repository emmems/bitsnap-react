import { getLocale } from "../components/checkout/locale";
import { pickLocaleTable, type LocaleTables } from "../lib/texts";

/** Panel strings that are not part of the returns views. */
export type PanelTexts = {
  returnsNavLabel: string;
  openCourse: string;
  libraryNavLabel: string;
  messagesNavLabel: string;
  ordersNavLabel: string;
  accountNavLabel: string;
  navigationLabel: string;
  logout: string;
  profileHeading: string;
  emailLabel: string;
  noData: string;
  languageLabel: string;
  polishLanguage: string;
  englishLanguage: string;
  plansHeading: string;
  plansUnavailable: string;
  notificationsHeading: string;
  notificationsUnavailable: string;
  ordersHeading: string;
  ordersDescription: string;
  ordersEmpty: string;
  ordersError: string;
  retry: string;
  orderLabel: string;
  customerLabel: string;
  dateLabel: string;
  ordersEnd: string;
  previousPage: string;
  nextPage: string;
  paginationLabel: string;
  statusDraft: string;
  statusUnpaid: string;
  statusPaid: string;
  statusOverdue: string;
  statusCancelled: string;
  statusCompleted: string;
  statusProcessing: string;
  statusRefunded: string;
  statusCreated: string;
  statusSent: string;
  statusIssue: string;
  statusReturned: string;
  descriptionShowMore: string;
  descriptionShowLess: string;
  descriptionLoading: string;
  ordersTitle: string;
  ordersCountOne: string;
  ordersCountFew: string;
  ordersCountMany: string;
  ordersLoading: string;
  ordersEmptyTitle: string;
  ordersEmptyText: string;
  ordersEmptyAction: string;
  ordersShowMore: string;
  ordersLoadingMore: string;
  ordersMoreError: string;
  ordersLoadedMore: string;
  orderNumber: string;
  orderFromDate: string;
  orderFor: string;
  orderLegacyNote: string;
  orderBack: string;
  orderBackToList: string;
  orderItems: string;
  orderQuantityPrice: string;
  orderTotal: string;
  orderInvoice: string;
  orderTimeline: string;
  orderTimelineAll: string;
  orderTimelineLess: string;
  orderDelivery: string;
  orderTracking: string;
  orderCopyTracking: string;
  orderCopied: string;
  orderYourData: string;
  orderDataHidden: string;
  orderShowData: string;
  orderHideData: string;
  orderHelp: string;
  orderComments: string;
  orderSellerLabel: string;
  orderSystemAuthor: string;
  orderUnavailableTitle: string;
  orderUnavailableText: string;
  orderNotFoundText: string;
  orderErrorTitle: string;
  orderErrorText: string;
  orderLoading: string;
  orderMaskedNote: string;
  orderVerify: string;
  orderVerifyText: string;
  orderVerifyEmailLabel: string;
  orderVerifyCancel: string;
  orderVerifyConfirm: string;
  orderVerifyFailed: string;
  orderLegacyTitle: string;
  returnsTitle: string;
  returnsTabsLabel: string;
  returnsTabOrders: string;
  returnsTabMine: string;
  returnsHowTitle: string;
  returnsStep1: string;
  returnsStep2: string;
  returnsStep3: string;
  returnsEmptyTitle: string;
  returnsRule: string;
  returnsEmptyAction: string;
  returnsMineEmptyText: string;
  returnsLinesOne: string;
  returnsLinesFew: string;
  returnsLinesMany: string;
  returnsUnavailableTitle: string;
};

const PANEL_TEXT_TABLES: LocaleTables<keyof PanelTexts> = {
  pl: {
    "returnsNavLabel": "Zwroty",
    "openCourse": "Otwórz kurs",
    "libraryNavLabel": "Biblioteka",
    "messagesNavLabel": "Wiadomości",
    "ordersNavLabel": "Zamówienia",
    "accountNavLabel": "Konto",
    "navigationLabel": "Panel klienta",
    "logout": "Wyloguj się",
    "profileHeading": "Profil",
    "emailLabel": "E-mail",
    "noData": "Brak danych",
    "languageLabel": "Język",
    "polishLanguage": "Polski",
    "englishLanguage": "English",
    "plansHeading": "Plany",
    "plansUnavailable": "Plany nie są obecnie dostępne w panelu.",
    "notificationsHeading": "Powiadomienia",
    "notificationsUnavailable": "Ustawienia powiadomień nie są obecnie dostępne w panelu.",
    "ordersHeading": "Historia zamówień",
    "ordersDescription": "Twoje zamówienia",
    "ordersEmpty": "Brak zamówień.",
    "ordersError": "Nie udało się pobrać zamówień.",
    "retry": "Spróbuj ponownie",
    "orderLabel": "Zamówienie",
    "customerLabel": "Klient",
    "dateLabel": "Data",
    "ordersEnd": "To już wszystkie Twoje zamówienia.",
    "previousPage": "Poprzednia strona",
    "nextPage": "Następna strona",
    "paginationLabel": "Strony zamówień",
    "statusDraft": "Szkic",
    "statusUnpaid": "Nieopłacone",
    "statusPaid": "Opłacone",
    "statusOverdue": "Zaległe",
    "statusCancelled": "Anulowane",
    "statusCompleted": "Zakończone",
    "statusProcessing": "Przetwarzane",
    "statusRefunded": "Zwrócone",
    "statusCreated": "Utworzone",
    "statusSent": "Wysłane",
    "statusIssue": "Wymaga uwagi",
    "statusReturned": "Zwrócone",
    "descriptionShowMore": "Pokaż więcej",
    "descriptionShowLess": "Pokaż mniej",
    "descriptionLoading": "Wczytywanie opisu",
    "ordersTitle": "Zamówienia",
    "ordersCountOne": "{count} zamówienie",
    "ordersCountFew": "{count} zamówienia",
    "ordersCountMany": "{count} zamówień",
    "ordersLoading": "Wczytywanie zamówień",
    "ordersEmptyTitle": "Nie masz jeszcze zamówień",
    "ordersEmptyText": "Gdy coś kupisz, zamówienie pojawi się tutaj.",
    "ordersEmptyAction": "Przejdź do biblioteki",
    "ordersShowMore": "Pokaż więcej",
    "ordersLoadingMore": "Ładowanie…",
    "ordersMoreError": "Nie udało się wczytać kolejnych zamówień.",
    "ordersLoadedMore": "Wczytano kolejne zamówienia: {count}.",
    "orderNumber": "Zamówienie {ref}",
    "orderFromDate": "Zamówienie z {date}",
    "orderFor": "Dla: {name}",
    "orderLegacyNote": "Szczegóły niedostępne dla starszych zamówień",
    "orderBack": "Zamówienia",
    "orderBackToList": "Wróć do zamówień",
    "orderItems": "Produkty",
    "orderQuantityPrice": "{quantity} × {price}",
    "orderTotal": "Razem",
    "orderInvoice": "Pobierz fakturę",
    "orderTimeline": "Historia",
    "orderTimelineAll": "Pokaż całą historię",
    "orderTimelineLess": "Pokaż mniej",
    "orderDelivery": "Dostawa",
    "orderTracking": "Numer przesyłki",
    "orderCopyTracking": "Kopiuj numer przesyłki",
    "orderCopied": "Skopiowano",
    "orderYourData": "Twoje dane",
    "orderDataHidden": "Adres i telefon ukryte",
    "orderShowData": "Pokaż dane",
    "orderHideData": "Ukryj dane",
    "orderHelp": "Pomoc",
    "orderComments": "Komentarze do zamówienia",
    "orderSellerLabel": "Sprzedawca",
    "orderSystemAuthor": "System",
    "orderUnavailableTitle": "Nie możemy otworzyć tego zamówienia",
    "orderUnavailableText": "To starsze zamówienie. Szczegóły nie są dostępne w panelu. Napisz do sprzedawcy, jeśli potrzebujesz pomocy.",
    "orderNotFoundText": "Nie znaleźliśmy zamówienia o tym numerze.",
    "orderErrorTitle": "Nie udało się pobrać zamówienia.",
    "orderErrorText": "Sprawdź połączenie i spróbuj jeszcze raz.",
    "orderLoading": "Wczytywanie zamówienia",
    "orderMaskedNote": "Część danych jest ukryta. Potwierdź adres e-mail, aby je zobaczyć.",
    "orderVerify": "Potwierdź e-mail",
    "orderVerifyText": "Podaj adres e-mail użyty przy składaniu zamówienia.",
    "orderVerifyEmailLabel": "Adres e-mail",
    "orderVerifyCancel": "Anuluj",
    "orderVerifyConfirm": "Potwierdź",
    "orderVerifyFailed": "Ten adres e-mail nie pasuje do zamówienia. Sprawdź go i spróbuj ponownie.",
    "orderLegacyTitle": "Starsze zamówienie",
    "returnsTitle": "Zwroty",
    "returnsTabsLabel": "Widok zwrotów",
    "returnsTabOrders": "Do zwrotu",
    "returnsTabMine": "Moje zwroty",
    "returnsHowTitle": "Jak to działa:",
    "returnsStep1": "Wybierz produkt",
    "returnsStep2": "Podaj powód",
    "returnsStep3": "Potwierdź",
    "returnsEmptyTitle": "Nie ma tu jeszcze nic do zwrotu",
    "returnsRule": "Zwrot można zgłosić w terminie i na zasadach ustalonych przez sprzedawcę.",
    "returnsEmptyAction": "Zobacz zamówienia",
    "returnsMineEmptyText": "Gdy zgłosisz zwrot, zobaczysz tu jego status.",
    "returnsLinesOne": "{count} produkt do zwrotu",
    "returnsLinesFew": "{count} produkty do zwrotu",
    "returnsLinesMany": "{count} produktów do zwrotu",
    "returnsUnavailableTitle": "Nie udało się otworzyć zwrotów"
  },
  en: {
    "returnsNavLabel": "Returns",
    "openCourse": "Open the course",
    "libraryNavLabel": "Library",
    "messagesNavLabel": "Messages",
    "ordersNavLabel": "Orders",
    "accountNavLabel": "Account",
    "navigationLabel": "Customer panel",
    "logout": "Log out",
    "profileHeading": "Profile",
    "emailLabel": "Email",
    "noData": "No data",
    "languageLabel": "Language",
    "polishLanguage": "Polski",
    "englishLanguage": "English",
    "plansHeading": "Plans",
    "plansUnavailable": "Plans are currently unavailable in the panel.",
    "notificationsHeading": "Notifications",
    "notificationsUnavailable": "Notification settings are currently unavailable in the panel.",
    "ordersHeading": "Order history",
    "ordersDescription": "Your orders",
    "ordersEmpty": "No orders yet.",
    "ordersError": "Could not load your orders.",
    "retry": "Try again",
    "orderLabel": "Order",
    "customerLabel": "Customer",
    "dateLabel": "Date",
    "ordersEnd": "You’ve reached the end of your orders.",
    "previousPage": "Previous page",
    "nextPage": "Next page",
    "paginationLabel": "Order pages",
    "statusDraft": "Draft",
    "statusUnpaid": "Unpaid",
    "statusPaid": "Paid",
    "statusOverdue": "Overdue",
    "statusCancelled": "Cancelled",
    "statusCompleted": "Completed",
    "statusProcessing": "Processing",
    "statusRefunded": "Refunded",
    "statusCreated": "Created",
    "statusSent": "Shipped",
    "statusIssue": "Needs attention",
    "statusReturned": "Returned",
    "descriptionShowMore": "Show more",
    "descriptionShowLess": "Show less",
    "descriptionLoading": "Loading the description",
    "ordersTitle": "Orders",
    "ordersCountOne": "{count} order",
    "ordersCountFew": "{count} orders",
    "ordersCountMany": "{count} orders",
    "ordersLoading": "Loading your orders",
    "ordersEmptyTitle": "You have no orders yet",
    "ordersEmptyText": "When you buy something, the order will appear here.",
    "ordersEmptyAction": "Go to the library",
    "ordersShowMore": "Show more",
    "ordersLoadingMore": "Loading…",
    "ordersMoreError": "Could not load more orders.",
    "ordersLoadedMore": "Loaded more orders: {count}.",
    "orderNumber": "Order {ref}",
    "orderFromDate": "Order of {date}",
    "orderFor": "For: {name}",
    "orderLegacyNote": "Details are not available for older orders",
    "orderBack": "Orders",
    "orderBackToList": "Back to orders",
    "orderItems": "Products",
    "orderQuantityPrice": "{quantity} × {price}",
    "orderTotal": "Total",
    "orderInvoice": "Download the invoice",
    "orderTimeline": "History",
    "orderTimelineAll": "Show the full history",
    "orderTimelineLess": "Show less",
    "orderDelivery": "Delivery",
    "orderTracking": "Tracking number",
    "orderCopyTracking": "Copy the tracking number",
    "orderCopied": "Copied",
    "orderYourData": "Your details",
    "orderDataHidden": "Address and phone hidden",
    "orderShowData": "Show details",
    "orderHideData": "Hide details",
    "orderHelp": "Help",
    "orderComments": "Order comments",
    "orderSellerLabel": "Seller",
    "orderSystemAuthor": "System",
    "orderUnavailableTitle": "We can’t open this order",
    "orderUnavailableText": "This is an older order. Its details are not available in the panel. Contact the seller if you need help.",
    "orderNotFoundText": "We couldn’t find an order with this number.",
    "orderErrorTitle": "Could not load the order.",
    "orderErrorText": "Check your connection and try again.",
    "orderLoading": "Loading the order",
    "orderMaskedNote": "Some details are hidden. Confirm your e-mail address to see them.",
    "orderVerify": "Confirm your e-mail",
    "orderVerifyText": "Enter the e-mail address you used for the order.",
    "orderVerifyEmailLabel": "E-mail address",
    "orderVerifyCancel": "Cancel",
    "orderVerifyConfirm": "Confirm",
    "orderVerifyFailed": "This e-mail address doesn’t match the order. Check it and try again.",
    "orderLegacyTitle": "Older order",
    "returnsTitle": "Returns",
    "returnsTabsLabel": "Returns view",
    "returnsTabOrders": "To return",
    "returnsTabMine": "My returns",
    "returnsHowTitle": "How it works:",
    "returnsStep1": "Choose a product",
    "returnsStep2": "Give a reason",
    "returnsStep3": "Confirm",
    "returnsEmptyTitle": "Nothing to return yet",
    "returnsRule": "You can request a return within the time and on the terms set by the seller.",
    "returnsEmptyAction": "See your orders",
    "returnsMineEmptyText": "When you request a return, you will see its status here.",
    "returnsLinesOne": "{count} product to return",
    "returnsLinesFew": "{count} products to return",
    "returnsLinesMany": "{count} products to return",
    "returnsUnavailableTitle": "Could not open returns"
  },
};

/** Panel strings for the library locale (`setLocale`), Polish by default. */
export function getPanelTexts(locale: string = getLocale()): PanelTexts {
  return pickLocaleTable(PANEL_TEXT_TABLES, locale);
}

const ORDER_STATUS_TEXT_KEYS: Record<string, keyof PanelTexts> = {
  draft: "statusDraft",
  created: "statusCreated",
  unpaid: "statusUnpaid",
  paid: "statusPaid",
  overdue: "statusOverdue",
  cancelled: "statusCancelled",
  canceled: "statusCancelled",
  completed: "statusCompleted",
  processing: "statusProcessing",
  refunded: "statusRefunded",
  sent: "statusSent",
  issue: "statusIssue",
  returned: "statusReturned",
};

/** Label of a raw lowercase order status code, `undefined` for an unknown one. */
export function orderStatusLabel(
  status: string,
  texts: PanelTexts = getPanelTexts(),
): string | undefined {
  const key = ORDER_STATUS_TEXT_KEYS[status.trim().toLowerCase()];
  return key == null ? undefined : texts[key];
}
