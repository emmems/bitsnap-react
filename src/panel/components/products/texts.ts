import { getLocale } from "../../../components/checkout/locale";

const pl = {
  hello: "Hej 👋",
  intro: "Poniżej znajdziesz swoje produkty",
  loading: "Ładowanie produktów…",
  empty:
    "Nie masz jeszcze produktów w tym sklepie. Twoje zakupy pojawią się tutaj.",
  productsError: "Nie udało się wczytać Twoich produktów.",
  audio: "Audio",
  files: "Pliki",
  course: "Kurs",
  ticket: "Bilet",
  chat: "Czat",
  community: "Społeczność",
  openMessages: "Otwórz wiadomości",
  listen: "Słuchaj",
  openCourse: "Otwórz kurs",
  downloadFiles: "Pobierz pliki",
  showTicket: "Pokaż bilet",
  back: "Wróć",
  retry: "Spróbuj ponownie",
  aboutProduct: "O produkcie",

  // Files (ebook) screen.
  yourFiles: "Twoje pliki",
  purchased: "Kupione",
  download: "Pobierz",
  downloadFormat: (format: string) => `Pobierz ${format}`,
  downloadFile: "Pobierz plik",
  open: "Otwórz",
  openInBrowser: (name: string) => `Otwórz w przeglądarce: ${name}`,
  filesLoading: "Ładuję pliki…",
  fileError: "Nie udało się wczytać plików.",
  fileErrorHelp: "Jeśli problem się powtarza, napisz do sprzedawcy.",
  noFiles: "Do tego produktu nie dodano jeszcze plików.",
  noFilesHelp: "Napisz do sprzedawcy.",
  file: "Plik",
  fileFormatUnknown: "Plik",

  // Audiobook screen.
  chaptersCount: (count: number) =>
    `${count} ${plural(count, "rozdział", "rozdziały", "rozdziałów")}`,
  audioLoadError: "Nie udało się wczytać audiobooka.",
  audioLoadErrorHelp: "Sprawdź połączenie i spróbuj jeszcze raz.",
  audioNoChapters: "Ten audiobook nie ma jeszcze rozdziałów.",
  audioMissingChapters: (count: number) =>
    `Nie wszystkie rozdziały są dostępne (${count}).`,
  audioLoading: "Wczytuję audiobook…",
  appTitle: "Słuchaj w aplikacji Bitsnap",
  appOffline: "Pobierz rozdziały i słuchaj bez internetu.",
  appOnline: "Słuchaj też w aplikacji.",
  appStoreAlt: "Pobierz z App Store",
  googlePlayAlt: "Pobierz z Google Play",

  // Ticket screen.
  yourTicket: "Twój bilet",
  ticketLoading: "Wczytuję bilet…",
  ticketShowAtEntry: "Pokaż ten kod przy wejściu.",
  ticketBrightness: "Zwiększ jasność ekranu, żeby kod łatwiej się skanował.",
  ticketQrAlt: (name: string) => `Kod QR biletu: ${name}`,
  ticketSaveQr: "Zapisz kod QR",
  ticketAppleWallet: "Dodaj do Apple Wallet",
  ticketGoogleWallet: "Dodaj do Google Wallet",
  ticketError: "Nie udało się wczytać biletu.",
  ticketNotFound: "Nie znaleźliśmy tego biletu na Twoim koncie.",
  ticketNotFoundHelp:
    "Sprawdź, czy jesteś zalogowany na ten sam e-mail, którego użyłeś przy zakupie.",
  ticketImageError: "Kod nie załadował się.",
  ticketOffline: "Brak połączenia – pokazujemy zapisany kod.",
  ticketSavedCode: "Nie udało się odświeżyć biletu – pokazujemy zapisany kod.",
  organizerInfo: "Informacje od organizatora",
};

const en: typeof pl = {
  hello: "Hi 👋",
  intro: "Your products are below",
  loading: "Loading products…",
  empty:
    "You have no products in this shop yet. Your purchases will show up here.",
  productsError: "Your products could not be loaded.",
  audio: "Audio",
  files: "Files",
  course: "Course",
  ticket: "Ticket",
  chat: "Chat",
  community: "Community",
  openMessages: "Open messages",
  listen: "Listen",
  openCourse: "Open course",
  downloadFiles: "Download files",
  showTicket: "Show ticket",
  back: "Back",
  retry: "Try again",
  aboutProduct: "About the product",

  yourFiles: "Your files",
  purchased: "Purchased",
  download: "Download",
  downloadFormat: (format: string) => `Download ${format}`,
  downloadFile: "Download file",
  open: "Open",
  openInBrowser: (name: string) => `Open in the browser: ${name}`,
  filesLoading: "Loading files…",
  fileError: "Your files could not be loaded.",
  fileErrorHelp: "If it keeps happening, contact the seller.",
  noFiles: "No files have been added to this product yet.",
  noFilesHelp: "Contact the seller.",
  file: "File",
  fileFormatUnknown: "File",

  chaptersCount: (count: number) =>
    `${count} ${count === 1 ? "chapter" : "chapters"}`,
  audioLoadError: "The audiobook could not be loaded.",
  audioLoadErrorHelp: "Check your connection and try again.",
  audioNoChapters: "This audiobook has no chapters yet.",
  audioMissingChapters: (count: number) =>
    `Some chapters are not available (${count}).`,
  audioLoading: "Loading the audiobook…",
  appTitle: "Listen in the Bitsnap app",
  appOffline: "Download chapters and listen offline.",
  appOnline: "You can also listen in the app.",
  appStoreAlt: "Download on the App Store",
  googlePlayAlt: "Get it on Google Play",

  yourTicket: "Your ticket",
  ticketLoading: "Loading the ticket…",
  ticketShowAtEntry: "Show this code at the entrance.",
  ticketBrightness: "Turn up the screen brightness so the code scans easily.",
  ticketQrAlt: (name: string) => `Ticket QR code: ${name}`,
  ticketSaveQr: "Save QR code",
  ticketAppleWallet: "Add to Apple Wallet",
  ticketGoogleWallet: "Add to Google Wallet",
  ticketError: "The ticket could not be loaded.",
  ticketNotFound: "We could not find this ticket in your account.",
  ticketNotFoundHelp:
    "Check that you are signed in with the e-mail you used for the purchase.",
  ticketImageError: "The code did not load.",
  ticketOffline: "No connection – showing the saved code.",
  ticketSavedCode: "Could not refresh the ticket – showing the saved code.",
  organizerInfo: "Information from the organiser",
};

export type ProductTexts = typeof pl;

/** Polish plural: 1 rozdział, 2-4 rozdziały, 5+ rozdziałów (12-14 too). */
function plural(count: number, one: string, few: string, many: string) {
  if (count === 1) return one;
  const tens = count % 100;
  const units = count % 10;
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
}

export function getProductTexts(locale?: string): ProductTexts {
  return (locale ?? getLocale()).toLowerCase().startsWith("en") ? en : pl;
}
