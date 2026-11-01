import { lookupText, resolveTexts, type LocaleTables } from "@/src/lib/texts";

/**
 * Every string the returns views render. Pass a partial object through the
 * `texts` prop of `BitsnapReturns`/`ReturnsProvider` to override any of them,
 * whatever the locale. Strings with `{name}` placeholders keep them in
 * overrides; unknown placeholders are left untouched.
 */
export type ReturnsTexts = {
  // Frame
  /** Label of the back buttons. */
  back: string;
  /** Step indicator, placeholders `{current}` and `{total}`. */
  stepIndicator: string;
  /** Skeleton accessible label. */
  loading: string;
  /** Button that opens the list of previous returns. */
  myReturnsLink: string;

  // Email step
  emailStepTitle: string;
  emailStepDescription: string;
  emailLabel: string;
  emailPlaceholder: string;
  emailSubmit: string;

  // Code step
  codeStepTitle: string;
  /** Placeholder `{email}`. */
  codeStepDescription: string;
  codeLabel: string;
  codeSubmit: string;
  resend: string;
  /** Placeholder `{seconds}`. */
  resendIn: string;
  /** Confirmation after a new code was sent. */
  resendSent: string;
  /** Hint under the code field. */
  codeSpamHint: string;
  codeValidity: string;
  /** Shown when the form is submitted with fewer than 6 digits. */
  codeIncomplete: string;
  logout: string;

  // Orders
  ordersTitle: string;
  ordersDescription: string;
  ordersEmpty: string;
  /** Placeholder `{reference}`. */
  orderTitle: string;
  /** Placeholder `{count}`. */
  orderReturnableLines: string;
  orderSelect: string;
  paginationPrevious: string;
  paginationNext: string;
  /** Placeholders `{page}` and `{total}` (number of orders). */
  paginationInfo: string;

  // Order detail
  /** Placeholder `{reference}`. */
  orderDetailTitle: string;
  orderDetailDescription: string;
  /** Placeholder `{name}`. */
  quantityLabel: string;
  /** Placeholder `{name}`. */
  quantityDecrease: string;
  /** Placeholder `{name}`. */
  quantityIncrease: string;
  /** Placeholder `{available}`. */
  quantityOfAvailable: string;
  /** Shown for an ineligible line without a reason from the backend. */
  lineIneligibleFallback: string;
  noteLabel: string;
  notePlaceholder: string;
  selectionContinue: string;
  selectionEmpty: string;
  previousReturnsTitle: string;

  // Confirmation
  confirmationTitle: string;
  confirmationDescription: string;
  confirmationSummary: string;
  /** Placeholder `{quantity}`. */
  confirmationQuantity: string;
  confirmationNote: string;
  confirmationSubmit: string;

  // Result
  successTitle: string;
  successDescription: string;
  successReference: string;
  successInstructions: string;
  successDone: string;

  // My returns
  myReturnsTitle: string;
  myReturnsDescription: string;
  myReturnsEmpty: string;
  myReturnOpen: string;
  myReturnDetailTitle: string;
  /** Placeholder `{reference}`. */
  myReturnTitle: string;
  myReturnCreatedAt: string;
  myReturnRefund: string;
  myReturnLines: string;
  /** Placeholders `{requested}`, `{approved}`, `{received}`. */
  myReturnLineQuantities: string;
  myReturnNote: string;
  myReturnHistory: string;

  // Request status labels
  statusSubmitted: string;
  statusApproved: string;
  statusRejected: string;
  statusAwaitingReceipt: string;
  statusReceived: string;
  statusCompleted: string;
  statusCancelled: string;
  statusRefunded: string;
  /** Any status the backend adds later. */
  statusFallback: string;

  // Refund status labels
  refundStatusNotStarted: string;
  refundStatusPending: string;
  refundStatusSucceeded: string;
  refundStatusFailed: string;
  refundStatusFallback: string;

  // Error messages
  errorGeneric: string;
  errorNetwork: string;
  errorInvalidEmail: string;
  errorInvalidCode: string;
  errorSessionExpired: string;
  errorOrderNotFound: string;
  errorReturnNotFound: string;
  errorQuantityUnavailable: string;
  errorItemNotReturnable: string;
  errorReturnsDisabled: string;
  errorRateLimited: string;
  errorIdempotencyConflict: string;
  errorDeliveryFailed: string;
  errorRetry: string;
};

export type ReturnsTextKey = keyof ReturnsTexts;

export const RETURNS_TEXT_TABLES: LocaleTables<ReturnsTextKey> = {
  en: {
    back: "Back",
    stepIndicator: "Step {current} of {total}",
    loading: "Loading",
    myReturnsLink: "My returns",

    emailStepTitle: "Return a product",
    emailStepDescription:
      "Enter the email address you used for the order. We will send you a verification code.",
    emailLabel: "Email address",
    emailPlaceholder: "name@example.com",
    emailSubmit: "Send code",

    codeStepTitle: "Enter the code",
    codeStepDescription: "We sent a verification code to {email}.",
    codeLabel: "Verification code",
    codeSubmit: "Verify",
    resend: "Send the code again",
    resendIn: "Send again in {seconds} s",
    resendSent: "We sent a new code.",
    codeSpamHint: "Can't see the email? Check your spam folder.",
    codeValidity: "The code is valid for 10 minutes.",
    codeIncomplete: "Enter all 6 digits of the code.",
    logout: "Sign out",

    ordersTitle: "Your orders",
    ordersDescription: "Choose the order that contains the product to return.",
    ordersEmpty: "There are no orders eligible for return.",
    orderTitle: "Order {reference}",
    orderReturnableLines: "Products available to return: {count}",
    orderSelect: "Choose",
    paginationPrevious: "Previous",
    paginationNext: "Next",
    paginationInfo: "Page {page}, {total} orders",

    orderDetailTitle: "Order {reference}",
    orderDetailDescription: "Select the products and quantities to return.",
    quantityLabel: "Quantity to return: {name}",
    quantityDecrease: "Decrease quantity: {name}",
    quantityIncrease: "Increase quantity: {name}",
    quantityOfAvailable: "of {available}",
    lineIneligibleFallback: "This product cannot be returned.",
    noteLabel: "Note (optional)",
    notePlaceholder: "Tell us why you are returning the product",
    selectionContinue: "Continue",
    selectionEmpty: "Select at least one item to return.",
    previousReturnsTitle: "Earlier returns for this order",

    confirmationTitle: "Confirm the return",
    confirmationDescription: "Check the products before you submit the request.",
    confirmationSummary: "Products to return",
    confirmationQuantity: "Quantity: {quantity}",
    confirmationNote: "Your note",
    confirmationSubmit: "Submit return request",

    successTitle: "Return request submitted",
    successDescription: "We received your request and will keep you posted.",
    successReference: "Request number",
    successInstructions: "What to do next",
    successDone: "Back to orders",

    myReturnsTitle: "My returns",
    myReturnsDescription: "Track the status of your return requests.",
    myReturnsEmpty: "You have not submitted any return requests yet.",
    myReturnOpen: "Details",
    myReturnDetailTitle: "Return details",
    myReturnTitle: "Return {reference}",
    myReturnCreatedAt: "Submitted",
    myReturnRefund: "Refund",
    myReturnLines: "Products",
    myReturnLineQuantities:
      "Requested: {requested}, approved: {approved}, received: {received}",
    myReturnNote: "Your note",
    myReturnHistory: "History",

    statusSubmitted: "Submitted",
    statusApproved: "Approved",
    statusRejected: "Rejected",
    statusAwaitingReceipt: "Awaiting the package",
    statusReceived: "Package received",
    statusCompleted: "Completed",
    statusCancelled: "Cancelled",
    statusRefunded: "Refunded",
    statusFallback: "In progress",

    refundStatusNotStarted: "Not started",
    refundStatusPending: "Refund in progress",
    refundStatusSucceeded: "Refunded",
    refundStatusFailed: "Refund failed",
    refundStatusFallback: "Unknown",

    errorGeneric: "Something went wrong. Please try again.",
    errorNetwork: "Cannot reach the server. Check your connection and try again.",
    errorInvalidEmail: "Enter a valid email address.",
    errorInvalidCode: "The code is invalid or has expired.",
    errorSessionExpired: "Your session has expired. Verify your email again.",
    errorOrderNotFound: "We could not find this order.",
    errorReturnNotFound: "We could not find this return request.",
    errorQuantityUnavailable:
      "The selected quantity is no longer available for return.",
    errorItemNotReturnable: "One of the selected products cannot be returned.",
    errorReturnsDisabled: "Returns are not available in this shop.",
    errorRateLimited: "Too many attempts. Please try again later.",
    errorIdempotencyConflict:
      "This request was already submitted with different contents. Reload and try again.",
    errorDeliveryFailed: "We could not send the code. Please try again.",
    errorRetry: "Try again",
  },
  pl: {
    back: "Wstecz",
    stepIndicator: "Krok {current} z {total}",
    loading: "Ładowanie",
    myReturnsLink: "Moje zwroty",

    emailStepTitle: "Zwróć produkt",
    emailStepDescription:
      "Podaj adres e-mail użyty w zamówieniu. Wyślemy na niego kod weryfikacyjny.",
    emailLabel: "Adres e-mail",
    emailPlaceholder: "jan@example.com",
    emailSubmit: "Wyślij kod",

    codeStepTitle: "Wpisz kod",
    codeStepDescription: "Wysłaliśmy kod weryfikacyjny na adres {email}.",
    codeLabel: "Kod weryfikacyjny",
    codeSubmit: "Zweryfikuj",
    resend: "Wyślij kod ponownie",
    resendIn: "Wyślij ponownie za {seconds} s",
    resendSent: "Wysłaliśmy nowy kod.",
    codeSpamHint: "Nie widzisz e-maila? Sprawdź folder spam.",
    codeValidity: "Kod jest ważny 10 minut.",
    codeIncomplete: "Wpisz wszystkie 6 cyfr kodu.",
    logout: "Wyloguj się",

    ordersTitle: "Twoje zamówienia",
    ordersDescription: "Wybierz zamówienie z produktem do zwrotu.",
    ordersEmpty: "Brak zamówień, które można zwrócić.",
    orderTitle: "Zamówienie {reference}",
    orderReturnableLines: "Produkty do zwrotu: {count}",
    orderSelect: "Wybierz",
    paginationPrevious: "Poprzednia",
    paginationNext: "Następna",
    paginationInfo: "Strona {page}, zamówień: {total}",

    orderDetailTitle: "Zamówienie {reference}",
    orderDetailDescription: "Wybierz produkty i ilości do zwrotu.",
    quantityLabel: "Ilość do zwrotu: {name}",
    quantityDecrease: "Zmniejsz ilość: {name}",
    quantityIncrease: "Zwiększ ilość: {name}",
    quantityOfAvailable: "z {available}",
    lineIneligibleFallback: "Ten produkt nie podlega zwrotowi.",
    noteLabel: "Uwagi (opcjonalnie)",
    notePlaceholder: "Napisz, dlaczego zwracasz produkt",
    selectionContinue: "Dalej",
    selectionEmpty: "Wybierz co najmniej jedną sztukę do zwrotu.",
    previousReturnsTitle: "Wcześniejsze zwroty tego zamówienia",

    confirmationTitle: "Potwierdź zwrot",
    confirmationDescription: "Sprawdź produkty przed wysłaniem zgłoszenia.",
    confirmationSummary: "Produkty do zwrotu",
    confirmationQuantity: "Ilość: {quantity}",
    confirmationNote: "Twoje uwagi",
    confirmationSubmit: "Wyślij zgłoszenie zwrotu",

    successTitle: "Zgłoszenie zwrotu zostało wysłane",
    successDescription: "Otrzymaliśmy zgłoszenie i będziemy informować o jego statusie.",
    successReference: "Numer zgłoszenia",
    successInstructions: "Co dalej",
    successDone: "Wróć do zamówień",

    myReturnsTitle: "Moje zwroty",
    myReturnsDescription: "Sprawdź status swoich zgłoszeń zwrotu.",
    myReturnsEmpty: "Nie masz jeszcze żadnych zgłoszeń zwrotu.",
    myReturnOpen: "Szczegóły",
    myReturnDetailTitle: "Szczegóły zwrotu",
    myReturnTitle: "Zwrot {reference}",
    myReturnCreatedAt: "Zgłoszono",
    myReturnRefund: "Zwrot środków",
    myReturnLines: "Produkty",
    myReturnLineQuantities:
      "Zgłoszono: {requested}, zaakceptowano: {approved}, odebrano: {received}",
    myReturnNote: "Twoje uwagi",
    myReturnHistory: "Historia",

    statusSubmitted: "Zgłoszony",
    statusApproved: "Zaakceptowany",
    statusRejected: "Odrzucony",
    statusAwaitingReceipt: "Oczekiwanie na paczkę",
    statusReceived: "Paczka odebrana",
    statusCompleted: "Zakończony",
    statusCancelled: "Anulowany",
    statusRefunded: "Środki zwrócone",
    statusFallback: "W trakcie",

    refundStatusNotStarted: "Nie rozpoczęto",
    refundStatusPending: "Zwrot środków w toku",
    refundStatusSucceeded: "Środki zwrócone",
    refundStatusFailed: "Zwrot środków nie powiódł się",
    refundStatusFallback: "Nieznany",

    errorGeneric: "Coś poszło nie tak. Spróbuj ponownie.",
    errorNetwork: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.",
    errorInvalidEmail: "Podaj poprawny adres e-mail.",
    errorInvalidCode: "Kod jest nieprawidłowy lub wygasł.",
    errorSessionExpired: "Sesja wygasła. Zweryfikuj adres e-mail ponownie.",
    errorOrderNotFound: "Nie znaleziono tego zamówienia.",
    errorReturnNotFound: "Nie znaleziono tego zgłoszenia zwrotu.",
    errorQuantityUnavailable:
      "Wybrana ilość nie jest już dostępna do zwrotu.",
    errorItemNotReturnable: "Jeden z wybranych produktów nie podlega zwrotowi.",
    errorReturnsDisabled: "Zwroty nie są dostępne w tym sklepie.",
    errorRateLimited: "Zbyt wiele prób. Spróbuj ponownie później.",
    errorIdempotencyConflict:
      "To zgłoszenie zostało już wysłane z inną zawartością. Odśwież stronę i spróbuj ponownie.",
    errorDeliveryFailed: "Nie udało się wysłać kodu. Spróbuj ponownie.",
    errorRetry: "Spróbuj ponownie",
  },
};

/** Default texts for a locale merged with the caller overrides. */
export function resolveReturnsTexts(
  locale: string,
  overrides?: Partial<ReturnsTexts>,
): ReturnsTexts {
  return resolveTexts(RETURNS_TEXT_TABLES, locale, overrides);
}

export function getReturnsText(
  key: ReturnsTextKey,
  locale: string,
  overrides?: Partial<ReturnsTexts>,
): string {
  return lookupText(resolveReturnsTexts(locale, overrides), key);
}

/** Replaces `{name}` placeholders. Unknown placeholders stay as they are. */
export function fillText(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name)
      ? String(values[name])
      : match,
  );
}

const STATUS_TEXT_KEYS: Record<string, ReturnsTextKey> = {
  submitted: "statusSubmitted",
  approved: "statusApproved",
  rejected: "statusRejected",
  awaiting_receipt: "statusAwaitingReceipt",
  received: "statusReceived",
  completed: "statusCompleted",
  cancelled: "statusCancelled",
  refunded: "statusRefunded",
};

const REFUND_STATUS_TEXT_KEYS: Record<string, ReturnsTextKey> = {
  not_started: "refundStatusNotStarted",
  pending: "refundStatusPending",
  succeeded: "refundStatusSucceeded",
  failed: "refundStatusFailed",
};

/** Text key for a backend request status, with a fallback for unknown ones. */
export function statusTextKey(status: string): ReturnsTextKey {
  return STATUS_TEXT_KEYS[status] ?? "statusFallback";
}

/** Text key for a backend refund status, with a fallback for unknown ones. */
export function refundStatusTextKey(status: string): ReturnsTextKey {
  return REFUND_STATUS_TEXT_KEYS[status] ?? "refundStatusFallback";
}
