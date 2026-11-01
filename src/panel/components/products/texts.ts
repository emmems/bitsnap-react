import { getLocale } from "../../../components/checkout/locale";
const pl = {
  hello: "Hej 👋",
  intro: "Poniżej znajdziesz swoje produkty",
  loading: "Ładowanie produktów…",
  empty:
    "Nie masz jeszcze produktów w tym sklepie. Twoje zakupy pojawią się tutaj.",
  audio: "Audio",
  files: "Pliki",
  course: "Kurs",
  ticket: "Bilet",
  listen: "Słuchaj",
  openCourse: "Otwórz kurs",
  downloadFiles: "Pobierz pliki",
  showTicket: "Pokaż bilet",
  back: "Wróć",
  yourFiles: "Twoje pliki",
  download: "Pobierz",
  retry: "Spróbuj ponownie",
  fileError: "Nie udało się wczytać plików.",
  noFiles: "Brak plików do pobrania.",
  ticketInfo: "Twój zakupiony bilet",
  file: "Plik",
};
const en: typeof pl = {
  hello: "Hi 👋",
  intro: "Your products are below",
  loading: "Loading products…",
  empty:
    "You have no products in this shop yet. Your purchases will show up here.",
  audio: "Audio",
  files: "Files",
  course: "Course",
  ticket: "Ticket",
  listen: "Listen",
  openCourse: "Open course",
  downloadFiles: "Download files",
  showTicket: "Show ticket",
  back: "Back",
  yourFiles: "Your files",
  download: "Download",
  retry: "Try again",
  fileError: "Your files could not be loaded.",
  noFiles: "No files to download.",
  ticketInfo: "Your purchased ticket",
  file: "File",
};
export function getProductTexts() {
  return getLocale().toLowerCase().startsWith("en") ? en : pl;
}
