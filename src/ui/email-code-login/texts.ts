import {
  pickLocaleTable,
  type LocaleTables,
  type TextTable,
} from "@/src/lib/texts";

/**
 * Strings of the shared e-mail + 6-digit-code login (panel, notifications).
 * Strings with `{name}` placeholders keep them in overrides.
 */
export type EmailCodeTexts = {
  emailLabel: string;
  emailPlaceholder: string;
  /** Submit button of the e-mail step. */
  sendCode: string;
  /** Same button while the code is being sent. */
  sending: string;
  invalidEmail: string;

  /** Placeholder `{email}`. */
  codeSentTo: string;
  /** Link back to the e-mail step ("Zmień"). */
  changeEmail: string;
  codeLabel: string;
  /** Submit button of the code step. */
  verify: string;
  verifying: string;
  codeIncomplete: string;
  spamHint: string;
  validity: string;

  resend: string;
  /** Placeholder `{seconds}`. */
  resendIn: string;
  /** Resend button after the code expired or ran out of attempts. */
  resendNew: string;
  resent: string;

  /** "Masz już kod?" next to the {@link haveCode} link. */
  haveCodePrompt: string;
  haveCode: string;
  /** In the "I already have a code" view: link back to sending one. */
  noCode: string;

  stepEmail: string;
  stepCode: string;

  wrongCode: string;
  expired: string;
  tooManyAttempts: string;
  /** Placeholder `{time}`, for example "45 s" or "2 min". */
  rateLimited: string;
  /** Placeholder `{time}`. */
  alreadySent: string;
  emailNotFound: string;
  deliveryFailed: string;
  deliveryUnavailable: string;
  network: string;
  generic: string;
};

export type EmailCodeTextKey = keyof EmailCodeTexts;

export const EMAIL_CODE_TEXT_TABLES: LocaleTables<EmailCodeTextKey> = {
  pl: {
    emailLabel: "E-mail",
    emailPlaceholder: "m@example.com",
    sendCode: "Wyślij kod",
    sending: "Wysyłanie…",
    invalidEmail: "Podaj poprawny adres e-mail.",
    codeSentTo: "Wysłaliśmy kod na {email}.",
    changeEmail: "Zmień",
    codeLabel: "Kod z e-maila",
    verify: "Zaloguj się",
    verifying: "Sprawdzanie…",
    codeIncomplete: "Wpisz wszystkie 6 cyfr kodu.",
    spamHint: "Nie widzisz e-maila? Sprawdź folder spam.",
    validity: "Kod jest ważny 10 minut.",
    resend: "Wyślij ponownie",
    resendIn: "Wyślij ponownie za {seconds} s",
    resendNew: "Wyślij nowy kod",
    resent: "Wysłaliśmy nowy kod.",
    haveCodePrompt: "Masz już kod?",
    haveCode: "Mam już kod",
    noCode: "Nie masz kodu? Wyślij go",
    stepEmail: "Krok 1 z 2: podaj adres e-mail.",
    stepCode: "Krok 2 z 2: wpisz kod z e-maila.",
    wrongCode: "Nieprawidłowy kod. Spróbuj jeszcze raz.",
    expired: "Kod wygasł. Wyślij nowy kod.",
    tooManyAttempts:
      "Zbyt wiele błędnych prób. Wyślij nowy kod albo zmień adres e-mail.",
    rateLimited: "Zbyt wiele prób. Spróbuj ponownie za {time}.",
    alreadySent: "Kod został już wysłany. Nowy możesz poprosić za {time}.",
    emailNotFound: "Nie znaleźliśmy konta z tym adresem e-mail.",
    deliveryFailed: "Nie udało się wysłać kodu. Spróbuj ponownie.",
    deliveryUnavailable:
      "Nie możemy teraz wysłać kodu na ten adres. Spróbuj później.",
    network: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.",
    generic: "Coś poszło nie tak. Spróbuj ponownie.",
  },
  en: {
    emailLabel: "Email",
    emailPlaceholder: "m@example.com",
    sendCode: "Send code",
    sending: "Sending…",
    invalidEmail: "Enter a valid email address.",
    codeSentTo: "We sent a code to {email}.",
    changeEmail: "Change",
    codeLabel: "Code from the email",
    verify: "Sign in",
    verifying: "Checking…",
    codeIncomplete: "Enter all 6 digits of the code.",
    spamHint: "Can't see the email? Check your spam folder.",
    validity: "The code is valid for 10 minutes.",
    resend: "Resend",
    resendIn: "Resend in {seconds}s",
    resendNew: "Send a new code",
    resent: "We sent a new code.",
    haveCodePrompt: "Already have a code?",
    haveCode: "I have a code",
    noCode: "No code yet? Send one",
    stepEmail: "Step 1 of 2: enter your email address.",
    stepCode: "Step 2 of 2: enter the code from the email.",
    wrongCode: "Incorrect code. Please try again.",
    expired: "The code has expired. Send a new one.",
    tooManyAttempts:
      "Too many wrong attempts. Send a new code or change the email address.",
    rateLimited: "Too many attempts. Try again in {time}.",
    alreadySent: "A code was already sent. You can ask for a new one in {time}.",
    emailNotFound: "We could not find an account with this email address.",
    deliveryFailed: "We could not send the code. Please try again.",
    deliveryUnavailable:
      "We cannot send a code to this address right now. Try again later.",
    network: "Cannot reach the server. Check your connection and try again.",
    generic: "Something went wrong. Please try again.",
  },
};

/**
 * Texts for a locale (Polish unless it starts with `en`), then each override
 * object in order; `undefined` entries keep what is there.
 */
export function resolveEmailCodeTexts(
  locale: string,
  ...overrides: Array<Partial<EmailCodeTexts> | undefined>
): EmailCodeTexts {
  const result: Record<string, string> = {
    ...pickLocaleTable(EMAIL_CODE_TEXT_TABLES, locale),
  };
  for (const layer of overrides) {
    if (layer == null) continue;
    for (const [key, value] of Object.entries<string | undefined>(layer)) {
      if (value != null) result[key] = value;
    }
  }
  return result as EmailCodeTexts;
}

export type EmailCodeTextTable = TextTable<EmailCodeTextKey>;

/** Whether `locale` selects English, as everywhere else in the library. */
export function isEnglish(locale: string): boolean {
  return locale.toLowerCase().startsWith("en");
}

/**
 * Human wait time: seconds up to one minute, whole minutes (rounded up) above.
 * Never longer than needed to read ("90" seconds is "2 min").
 */
export function formatWait(seconds: number): string {
  const total = Math.max(1, Math.ceil(seconds));
  return total <= 60 ? `${total} s` : `${Math.ceil(total / 60)} min`;
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
