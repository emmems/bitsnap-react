/** Event times are shown in the organiser's zone, wherever the buyer is. */
export const EVENT_TIME_ZONE = "Europe/Warsaw";

export type EventDate = {
  /** "12 grudnia 2026, 19:00" */
  label: string;
  /** ISO 8601, for `<time dateTime>`. */
  iso: string;
};

/**
 * The event start (unix seconds from `event_start_date`) as one line in the
 * panel's locale and the Warsaw time zone, or `undefined` when the ticket
 * has no date. The locale maps like the panel texts (`getProductTexts`):
 * `en*` gives English, anything else Polish, so the date never comes out in
 * another language than the words around it.
 */
export function formatEventDate(
  seconds: bigint | number | undefined,
  locale: string,
): EventDate | undefined {
  if (seconds == null) return undefined;
  const ms = Number(seconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return undefined;
  const format = (tag: string) => {
    const day = new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: EVENT_TIME_ZONE,
    }).format(date);
    const time = new Intl.DateTimeFormat(tag, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: EVENT_TIME_ZONE,
    }).format(date);
    return `${day}, ${time}`;
  };
  const label = format(locale.toLowerCase().startsWith("en") ? "en-US" : "pl-PL");
  return { label, iso: date.toISOString() };
}
