import { pickLocaleTable, type LocaleTables } from "../../lib/texts";

/**
 * Strings of the panel's notification settings of the shop. The newsletter
 * strings follow the shop's notification page (the footer link of a campaign).
 */
export type PanelNotificationSettingsTexts = {
  description: string;
  channelEmail: string;
  channelSms: string;
  channelPush: string;
  emailOffNote: string;
  newsletter: string;
  newsletterOnNote: string;
  newsletterWithdrawn: string;
  newsletterResubscribe: string;
  newsletterResubscribeNoLink: string;
  saved: string;
  saveError: string;
  loading: string;
};

const TABLES: LocaleTables<keyof PanelNotificationSettingsTexts> = {
  pl: {
    description: "Wybierz, jak sklep może się z Tobą kontaktować.",
    channelEmail: "E-mail",
    channelSms: "SMS",
    channelPush: "Powiadomienia na telefon",
    emailOffNote: "Wyłączenie e-maili wypisuje też z newslettera.",
    newsletter: "Newsletter sklepu",
    newsletterOnNote: "Dostajesz newsletter tego sklepu. Wyłącz, aby się wypisać.",
    newsletterWithdrawn: "Nie dostajesz newslettera tego sklepu.",
    newsletterResubscribe: "Zapisz się ponownie na stronie sklepu",
    newsletterResubscribeNoLink: "Aby zapisać się ponownie, użyj formularza newslettera na stronie sklepu.",
    saved: "Zapisano zmiany.",
    saveError: "Nie udało się zapisać zmian. Spróbuj ponownie.",
    loading: "Wczytywanie ustawień powiadomień",
  },
  en: {
    description: "Choose how the shop may contact you.",
    channelEmail: "Email",
    channelSms: "SMS",
    channelPush: "Phone notifications",
    emailOffNote: "Turning email off also unsubscribes you from the newsletter.",
    newsletter: "Shop newsletter",
    newsletterOnNote: "You get this shop's newsletter. Switch it off to unsubscribe.",
    newsletterWithdrawn: "You don't get this shop's newsletter.",
    newsletterResubscribe: "Subscribe again on the shop's website",
    newsletterResubscribeNoLink: "To subscribe again, use the newsletter form on the shop's website.",
    saved: "Changes saved.",
    saveError: "Could not save your changes. Try again.",
    loading: "Loading notification settings",
  },
};

export function getPanelNotificationSettingsTexts(locale: string): PanelNotificationSettingsTexts {
  return pickLocaleTable(TABLES, locale);
}
