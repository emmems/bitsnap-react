import { getLocale } from "../components/checkout/locale";
import { resolveTexts, type LocaleTables } from "../lib/texts";

/**
 * Every string of the chat (panel "Wiadomości", `ChatThread`, `Channel`).
 * Pass a partial object through the `texts` prop to override any of them,
 * whatever the locale. Placeholders like `{count}` stay in overrides.
 *
 * Counts use three forms (`One`, `Few`, `Many`) for Polish; English uses
 * `One` and `Many`.
 */
export type ChatTexts = {
  inboxHeading: string;
  inboxIntro: string;
  inboxEmpty: string;
  inboxError: string;
  loading: string;
  retry: string;
  back: string;
  selectConversation: string;
  kindChat: string;
  kindChannel: string;
  startSection: string;
  startChat: string;
  openChannel: string;
  channelNotReady: string;
  chatFallbackTitle: string;
  channelFallbackTitle: string;
  /** Placeholder `{count}`. */
  repliesLeftOne: string;
  repliesLeftFew: string;
  repliesLeftMany: string;
  noRepliesLeft: string;
  /** Placeholder `{date}`. */
  expiresOn: string;
  /** Placeholder `{date}`. */
  expiredOn: string;
  /** Placeholder `{hours}`. */
  responseHours: string;
  /** Placeholder `{count}`. */
  unread: string;
  /** Placeholder `{count}`. */
  members: string;
  mutedBadge: string;
  noMessagesYet: string;
  emptyThread: string;
  emptyChannel: string;
  privacyNote: string;
  loadOlder: string;
  you: string;
  creator: string;
  systemLabel: string;
  pinned: string;
  deletedPlaceholder: string;
  attachment: string;
  composerLabel: string;
  composerPlaceholder: string;
  send: string;
  composerExpired: string;
  composerCreatorOnly: string;
  composerMuted: string;
  composerReadOnly: string;
  lockRepliesTitle: string;
  lockRepliesBody: string;
  lockExpiredTitle: string;
  lockExpiredBody: string;
  lockThreadTitle: string;
  lockThreadBody: string;
  lockChannelTitle: string;
  lockChannelBody: string;
  buyPack: string;
  buyAccess: string;
  buying: string;
  buyError: string;
  pending: string;
  notConfirmed: string;
  rejectedLink: string;
  rejectedBannedWord: string;
  rejectedMedia: string;
  /** Placeholder `{seconds}`. */
  rejectedCooldown: string;
  rejectedBlocked: string;
  rejectedMuted: string;
  rejectedReadOnly: string;
  rejectedPackEmpty: string;
  rejectedForbidden: string;
  rejectedGeneric: string;
  failedNetwork: string;
  editMessage: string;
  retrySend: string;
  dismiss: string;
  messageActions: string;
  deleteMessage: string;
  deleteConfirm: string;
  reportMessage: string;
  conversationActions: string;
  muteThread: string;
  unmuteThread: string;
  muteError: string;
  reportConversation: string;
  reportTitle: string;
  reportConversationTitle: string;
  reportReason: string;
  reasonSpam: string;
  reasonAbuse: string;
  reasonIllegal: string;
  reasonOther: string;
  reportNote: string;
  reportSend: string;
  reportCancel: string;
  reportSent: string;
  reportError: string;
  liveLabel: string;
  pollingLabel: string;
  errorNoToken: string;
  errorUnauthorized: string;
  errorPlan: string;
  errorNotFound: string;
  errorUnavailable: string;
  errorGeneric: string;
};

export const CHAT_TEXT_TABLES: LocaleTables<keyof ChatTexts> = {
  pl: {
    inboxHeading: "Wiadomości",
    inboxIntro: "Rozmowy z twórcami i kanały, do których należysz.",
    inboxEmpty:
      "Nie masz jeszcze rozmów. Po zakupie pakietu konsultacji lub dostępu do społeczności rozmowa pojawi się tutaj.",
    inboxError: "Nie udało się wczytać wiadomości.",
    loading: "Wczytywanie…",
    retry: "Spróbuj ponownie",
    back: "Wróć",
    selectConversation: "Wybierz rozmowę z listy.",
    kindChat: "Czat",
    kindChannel: "Kanał",
    startSection: "Do rozpoczęcia",
    startChat: "Rozpocznij rozmowę",
    openChannel: "Otwórz kanał",
    channelNotReady: "Twórca jeszcze nie otworzył tego kanału.",
    chatFallbackTitle: "Czat z twórcą",
    channelFallbackTitle: "Kanał",
    repliesLeftOne: "Została {count} odpowiedź",
    repliesLeftFew: "Zostały {count} odpowiedzi",
    repliesLeftMany: "Zostało {count} odpowiedzi",
    noRepliesLeft: "Brak odpowiedzi w pakiecie",
    expiresOn: "Ważny do {date}",
    expiredOn: "Wygasł {date}",
    responseHours: "Odpowiedź w ciągu {hours} h",
    unread: "Nieprzeczytane: {count}",
    members: "Członkowie: {count}",
    mutedBadge: "Wyciszony",
    noMessagesYet: "Brak wiadomości",
    emptyThread:
      "Napisz pierwszą wiadomość. Twórca odpowie w ramach Twojego pakietu.",
    emptyChannel: "W kanale nie ma jeszcze wiadomości.",
    privacyNote:
      "Wiadomości czyta druga strona rozmowy. Bitsnap przechowuje je przez 90 dni.",
    loadOlder: "Wcześniejsze wiadomości",
    you: "Ty",
    creator: "Twórca",
    systemLabel: "Wiadomość automatyczna",
    pinned: "Przypięta",
    deletedPlaceholder: "Wiadomość została usunięta",
    attachment: "Załącznik",
    composerLabel: "Wiadomość",
    composerPlaceholder: "Napisz wiadomość…",
    send: "Wyślij",
    composerExpired: "Pakiet wygasł, więc nie możesz już pisać w tej rozmowie.",
    composerCreatorOnly: "W tym kanale pisze tylko twórca.",
    composerMuted: "Masz wyciszone pisanie w tym kanale.",
    composerReadOnly: "Ten dostęp pozwala tylko czytać.",
    lockRepliesTitle: "Odpowiedzi w pakiecie się skończyły",
    lockRepliesBody:
      "Możesz dalej pisać, ale twórca odpowie dopiero po zakupie kolejnego pakietu.",
    lockExpiredTitle: "Pakiet wygasł",
    lockExpiredBody:
      "Rozmowa zostaje do wglądu. Kup nowy pakiet, aby ją kontynuować.",
    lockThreadTitle: "Nie masz pakietu odpowiedzi",
    lockThreadBody: "Kup pakiet, aby napisać do twórcy.",
    lockChannelTitle: "Kanał dla członków",
    lockChannelBody: "Kup dostęp, aby czytać i pisać w tym kanale.",
    buyPack: "Kup pakiet",
    buyAccess: "Kup dostęp",
    buying: "Dodawanie do koszyka…",
    buyError: "Nie udało się dodać do koszyka. Spróbuj ponownie.",
    pending: "Wysyłanie…",
    notConfirmed: "Czekamy na potwierdzenie wysłania",
    rejectedLink: "Linki są w tym kanale zablokowane. Usuń link i wyślij ponownie.",
    rejectedBannedWord:
      "Wiadomość zawiera słowo zablokowane w tym kanale. Popraw ją i wyślij ponownie.",
    rejectedMedia: "Załączniki są w tym kanale zablokowane.",
    rejectedCooldown: "Piszesz za szybko. Spróbuj ponownie za {seconds} s.",
    rejectedBlocked: "Twórca zablokował Ci możliwość pisania w tym sklepie.",
    rejectedMuted: "Masz wyciszone pisanie w tym kanale.",
    rejectedReadOnly: "Ten dostęp pozwala tylko czytać.",
    rejectedPackEmpty: "Pakiet nie ma już odpowiedzi.",
    rejectedForbidden: "Nie możesz pisać w tej rozmowie.",
    rejectedGeneric: "Nie udało się wysłać wiadomości.",
    failedNetwork: "Brak połączenia. Wiadomość nie została wysłana.",
    editMessage: "Popraw",
    retrySend: "Wyślij ponownie",
    dismiss: "Odrzuć",
    messageActions: "Opcje wiadomości",
    deleteMessage: "Usuń wiadomość",
    deleteConfirm: "Na pewno usunąć?",
    reportMessage: "Zgłoś wiadomość",
    conversationActions: "Opcje rozmowy",
    muteThread: "Wycisz powiadomienia",
    unmuteThread: "Włącz powiadomienia",
    muteError: "Nie udało się zmienić powiadomień.",
    reportConversation: "Zgłoś rozmowę",
    reportTitle: "Zgłoś wiadomość",
    reportConversationTitle: "Zgłoś rozmowę",
    reportReason: "Powód zgłoszenia",
    reasonSpam: "Spam",
    reasonAbuse: "Nękanie lub obraźliwe treści",
    reasonIllegal: "Treści niezgodne z prawem",
    reasonOther: "Inny powód",
    reportNote: "Opis (opcjonalnie)",
    reportSend: "Wyślij zgłoszenie",
    reportCancel: "Anuluj",
    reportSent: "Dziękujemy. Zgłoszenie trafiło do moderacji.",
    reportError: "Nie udało się wysłać zgłoszenia. Spróbuj ponownie.",
    liveLabel: "Nowe wiadomości pojawiają się na bieżąco",
    pollingLabel: "Nowe wiadomości odświeżają się co kilka sekund",
    errorNoToken: "Zaloguj się w panelu klienta, aby zobaczyć rozmowę.",
    errorUnauthorized: "Sesja wygasła. Zaloguj się ponownie.",
    errorPlan: "Czat nie jest dostępny w tym sklepie.",
    errorNotFound: "Nie znaleziono tej rozmowy.",
    errorUnavailable: "Czat jest chwilowo niedostępny. Spróbuj za chwilę.",
    errorGeneric: "Nie udało się wczytać rozmowy.",
  },
  en: {
    inboxHeading: "Messages",
    inboxIntro: "Your conversations with creators and the channels you belong to.",
    inboxEmpty:
      "No conversations yet. When you buy a consultation pack or community access, it shows up here.",
    inboxError: "Your messages could not be loaded.",
    loading: "Loading…",
    retry: "Try again",
    back: "Back",
    selectConversation: "Pick a conversation from the list.",
    kindChat: "Chat",
    kindChannel: "Channel",
    startSection: "Ready to start",
    startChat: "Start the conversation",
    openChannel: "Open the channel",
    channelNotReady: "The creator has not opened this channel yet.",
    chatFallbackTitle: "Chat with the creator",
    channelFallbackTitle: "Channel",
    repliesLeftOne: "{count} reply left",
    repliesLeftFew: "{count} replies left",
    repliesLeftMany: "{count} replies left",
    noRepliesLeft: "No replies left in your pack",
    expiresOn: "Valid until {date}",
    expiredOn: "Expired on {date}",
    responseHours: "Replies within {hours} h",
    unread: "Unread: {count}",
    members: "Members: {count}",
    mutedBadge: "Muted",
    noMessagesYet: "No messages yet",
    emptyThread: "Write the first message. The creator replies within your pack.",
    emptyChannel: "There are no messages in this channel yet.",
    privacyNote:
      "The other side of the conversation reads your messages. Bitsnap keeps them for 90 days.",
    loadOlder: "Earlier messages",
    you: "You",
    creator: "Creator",
    systemLabel: "Automatic message",
    pinned: "Pinned",
    deletedPlaceholder: "This message was deleted",
    attachment: "Attachment",
    composerLabel: "Message",
    composerPlaceholder: "Write a message…",
    send: "Send",
    composerExpired: "Your pack has expired, so you can no longer write here.",
    composerCreatorOnly: "Only the creator posts in this channel.",
    composerMuted: "You are muted in this channel.",
    composerReadOnly: "This access is read only.",
    lockRepliesTitle: "Your pack has no replies left",
    lockRepliesBody:
      "You can keep writing, but the creator can reply only after you buy another pack.",
    lockExpiredTitle: "Your pack has expired",
    lockExpiredBody:
      "You can still read the conversation. Buy a new pack to continue it.",
    lockThreadTitle: "You have no reply pack",
    lockThreadBody: "Buy a pack to write to the creator.",
    lockChannelTitle: "Members-only channel",
    lockChannelBody: "Buy access to read and post in this channel.",
    buyPack: "Buy a pack",
    buyAccess: "Buy access",
    buying: "Adding to cart…",
    buyError: "Could not add it to the cart. Try again.",
    pending: "Sending…",
    notConfirmed: "Waiting for the send to be confirmed",
    rejectedLink: "Links are blocked in this channel. Remove the link and send again.",
    rejectedBannedWord:
      "Your message contains a word blocked in this channel. Edit it and send again.",
    rejectedMedia: "Attachments are blocked in this channel.",
    rejectedCooldown: "You are posting too fast. Try again in {seconds} s.",
    rejectedBlocked: "The creator has blocked you from posting in this shop.",
    rejectedMuted: "You are muted in this channel.",
    rejectedReadOnly: "This access is read only.",
    rejectedPackEmpty: "The pack has no replies left.",
    rejectedForbidden: "You cannot post in this conversation.",
    rejectedGeneric: "Your message could not be sent.",
    failedNetwork: "No connection. Your message was not sent.",
    editMessage: "Edit",
    retrySend: "Send again",
    dismiss: "Discard",
    messageActions: "Message options",
    deleteMessage: "Delete message",
    deleteConfirm: "Delete for sure?",
    reportMessage: "Report message",
    conversationActions: "Conversation options",
    muteThread: "Mute notifications",
    unmuteThread: "Unmute notifications",
    muteError: "Notifications could not be changed.",
    reportConversation: "Report conversation",
    reportTitle: "Report message",
    reportConversationTitle: "Report conversation",
    reportReason: "Reason",
    reasonSpam: "Spam",
    reasonAbuse: "Harassment or abusive content",
    reasonIllegal: "Illegal content",
    reasonOther: "Something else",
    reportNote: "Details (optional)",
    reportSend: "Send report",
    reportCancel: "Cancel",
    reportSent: "Thank you. Your report went to moderation.",
    reportError: "Your report could not be sent. Try again.",
    liveLabel: "New messages appear live",
    pollingLabel: "New messages refresh every few seconds",
    errorNoToken: "Log in to the customer panel to see this conversation.",
    errorUnauthorized: "Your session has expired. Log in again.",
    errorPlan: "Chat is not available in this shop.",
    errorNotFound: "This conversation was not found.",
    errorUnavailable: "Chat is unavailable right now. Try again in a moment.",
    errorGeneric: "The conversation could not be loaded.",
  },
};

/** Chat strings for a locale (default: the library locale), with overrides. */
export function getChatTexts(
  overrides?: Partial<ChatTexts>,
  locale: string = getLocale(),
): ChatTexts {
  return resolveTexts(CHAT_TEXT_TABLES, locale, overrides);
}

/** Fills `{name}` placeholders. */
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** "Zostały 3 odpowiedzi" with the plural form of the locale. */
export function repliesLeftText(
  texts: ChatTexts,
  count: number,
  locale: string = getLocale(),
): string {
  if (count <= 0) return texts.noRepliesLeft;
  let category: Intl.LDMLPluralRule = "other";
  try {
    category = new Intl.PluralRules(locale).select(count);
  } catch {
    // Unknown locale: "other".
  }
  const template =
    category === "one"
      ? texts.repliesLeftOne
      : category === "few"
        ? texts.repliesLeftFew
        : texts.repliesLeftMany;
  return fill(template, { count });
}

/** A short local date, `12.12.2026` / `12/12/2026`. */
export function formatChatDate(iso: string, locale: string = getLocale()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(date);
}

/** The time for today's messages, the date otherwise. */
export function formatMessageTime(
  iso: string,
  locale: string = getLocale(),
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(
    locale,
    sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  ).format(date);
}

/** The text of a refused send, by the error code or live reject reason. */
export function rejectionText(
  texts: ChatTexts,
  reason: string,
  retryAfter?: number,
): string {
  switch (reason) {
    case "moderation_link":
      return texts.rejectedLink;
    case "moderation_banned_word":
      return texts.rejectedBannedWord;
    case "moderation_media":
      return texts.rejectedMedia;
    case "cooldown":
      return fill(texts.rejectedCooldown, { seconds: retryAfter ?? 30 });
    case "blocked":
      return texts.rejectedBlocked;
    case "muted":
      return texts.rejectedMuted;
    case "read_only":
      return texts.rejectedReadOnly;
    case "pack_empty":
    case "replies_exhausted":
      return texts.rejectedPackEmpty;
    case "forbidden":
    case "locked":
      return texts.rejectedForbidden;
    case "network":
    case "unavailable":
      return texts.failedNetwork;
    default:
      return texts.rejectedGeneric;
  }
}
