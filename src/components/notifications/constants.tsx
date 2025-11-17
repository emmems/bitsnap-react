import type { CustomizationTexts } from "./types";

export const DEFAULT_TEXTS: Required<CustomizationTexts> = {
  title: null,
  description: null,
  managingDescription:
    "Zarządzaj rodzajami powiadomień i sposobem dostarczania.",
  formTitle: "Podaj Email aby zapisać się do powiadomień",
  formEmailLabel: "Email",
  formPhoneLabel: "Numer telefonu",
  formPhoneOptional: "(opcjonalnie)",
  formEmailPlaceholder: "np. mail@gmail...",
  formPhonePlaceholder: "np. 663...",
  formSubmitButton: "Zapisz się",
  formSuccessMessage: "Zapisałeś się do powiadomień.",
  agreementText: (
    <>
      <span style={{ color: "red" }}>*</span>
      Wyrażam zgodę na przetwarzanie moich danych w celach marketingowych
      zgodnie z{" "}
      <a
        href="/regulations/polityka-prywatnosci"
        target="_blank"
        className="cursor-alias font-bold hover:font-medium"
      >
        regulaminem
      </a>{" "}
      <span className="text-xs font-light">
        (zgodę można w każdej chwili wycofać)
      </span>
    </>
  ),
  qrCodeTitle: "lub zainstaluj aplikację mobilną",
  qrCodeSubtitle: "Aplikacja mobilna",
  qrCodeScanText: "zeskanuj kod QR",
  groupsNoSelectionWarning:
    "Jeśli żadna z grup nie jest zaznaczona, nie otrzymasz żadnych powiadomień.",
  groupsSelectAllButton: "Zaznacz wszystkie",
  groupsUpdateButton: "Aktualizuj",
  groupsUpdateSuccess: "Zaktualizowano pomyślnie.",
  groupsTitle: "Zarządzaj grupami z których chcesz otrzymywać powiadomienia",
  manageDataTitle: "Ustawienia powiadomień",
  manageDataDescription: "W jaki sposób chcesz otrzymywać powiadomienia?",
  manageDataUnsubscribeButton: "Odsubskrybuj",
  manageDataUpdatedMessage: "Zaktualizowano",
  manageDataUnsubscribeDescription:
    "Wypisz mnie z wszystkich powiadomień i grup.",
  loginEmailLabel: "Email",
  loginEmailPlaceholder: "Wprowadź swój email",
  loginSendCodeButton: "Wyślij kod weryfikacyjny",
  loginSendingButton: "Wysyłanie...",
  loginCodeLabel: "Wprowadź kod weryfikacyjny",
  loginCodeSentMessage: "Wysłaliśmy kod weryfikacyjny na adres",
  loginChangeEmailButton: "Popraw email",
  loginResendCodeButton: "Wyślij kod ponownie",
  loginInvalidEmailError: "Wprowadź prawidłowy adres email",
  loginSlugRequiredError: "Wymagany jest identyfikator projektu",
  loginInvalidCodeError: "Nieprawidłowy kod weryfikacyjny",
  loginVerificationFailedError:
    "Weryfikacja nie powiodła się. Sprawdź swój kod.",
  loginSendEmailError: "Nie udało się wysłać kodu weryfikacyjnego",
  loginVerifyCodeError: "Nie udało się zweryfikować kodu",
  loginResendEmailError: "Nie udało się ponownie wysłać kodu weryfikacyjnego",
  loginTitle: "Wpisz email aby zarządzać powiadomieniami",
  loginDescription: "Dostaniesz kod weryfikacyjny na email.",
  loginIHaveCode: "Mam już kod",
};
