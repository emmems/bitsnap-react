import type { CustomizationTexts } from "./types";

export const DEFAULT_TEXTS: Required<CustomizationTexts> = {
  title: "Powiadomienia",
  description:
    "Otrzymuj powiadomienia za pomocą aplikacji mobilnej, smsów lub emaili. Ty decydujesz jakie treści Cię interesują i w jaki sposób chcesz je otrzymywać.",
  managingDescription: "Zarządzaj rodzajami powiadomień i sposobem dostarczania.",
  formTitle: "Podaj Email i telefon(opcjonalnie)",
  formEmailLabel: "Email",
  formPhoneLabel: "Numer telefonu",
  formPhoneOptional: "(opcjonalnie)",
  formEmailPlaceholder: "np. mail@gmail...",
  formPhonePlaceholder: "np. 663...",
  formSubmitButton: "Zapisz się",
  formSuccessMessage: "Zasubskrybowano Cię. Na maila otrzymasz instrukcję jak zarządzać swoimi powiadomieniami.",
  agreementText: (
    <>
      <span style={{ color: "red" }}>*</span>
      Wyrażam zgodę na przetwarzanie moich danych w celach marketingowych zgodnie z{" "}
      <a
        href="/regulations/polityka-prywatnosci"
        target="_blank"
        className="cursor-alias font-bold hover:font-medium"
      >
        regulaminem
      </a>{" "}
      <span className="text-xs font-light">(zgodę można w każdej chwili wycofać)</span>
    </>
  ),
  qrCodeTitle: "lub zainstaluj aplikację mobilną",
  qrCodeSubtitle: "Aplikacja mobilna",
  qrCodeScanText: "zeskanuj kod QR",
  groupsNoSelectionWarning: "Jeśli żadna z grup nie jest zaznaczona, nie otrzymasz żadnych powiadomień.",
  groupsSelectAllButton: "Zaznacz wszystkie",
  groupsUpdateButton: "Aktualizuj",
  groupsUpdateSuccess: "Zaktualizowano pomyślnie.",
  manageDataTitle: "Zarządzaj powiadomieniami",
  manageDataDescription: "W jaki sposób chcesz otrzymywać powiadomienia?",
  manageDataUnsubscribeButton: "Odsubskrybuj",
  manageDataUnsubscribeDescription: "Wypisz mnie z wszystkich powiadomień i grup.",
};

