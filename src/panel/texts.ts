import { getLocale } from "../components/checkout/locale";
import { pickLocaleTable, type LocaleTables } from "../lib/texts";

/** Panel strings that are not part of the returns views. */
export type PanelTexts = {
  returnsNavLabel: string;
  openCourse: string;
  libraryNavLabel: string;
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
};

const PANEL_TEXT_TABLES: LocaleTables<keyof PanelTexts> = {
  pl: {
    "returnsNavLabel": "Zwroty",
    "openCourse": "Otwórz kurs",
    "libraryNavLabel": "Biblioteka",
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
    "statusRefunded": "Zwrócone"
  },
  en: {
    "returnsNavLabel": "Returns",
    "openCourse": "Open the course",
    "libraryNavLabel": "Library",
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
    "statusRefunded": "Refunded"
  },
};

/** Panel strings for the library locale (`setLocale`), Polish by default. */
export function getPanelTexts(locale: string = getLocale()): PanelTexts {
  return pickLocaleTable(PANEL_TEXT_TABLES, locale);
}
