import { getLocale } from "../components/checkout/locale";
import { pickLocaleTable, type LocaleTables } from "../lib/texts";

/** Panel strings that are not part of the returns views. */
export type PanelTexts = {
  returnsNavLabel: string;
  openCourse: string;
};

const PANEL_TEXT_TABLES: LocaleTables<keyof PanelTexts> = {
  pl: { returnsNavLabel: "Zwroty", openCourse: "Otwórz kurs" },
  en: { returnsNavLabel: "Returns", openCourse: "Open the course" },
};

/** Panel strings for the library locale (`setLocale`), Polish by default. */
export function getPanelTexts(locale: string = getLocale()): PanelTexts {
  return pickLocaleTable(PANEL_TEXT_TABLES, locale);
}
