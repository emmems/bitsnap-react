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
 * has no date. An unknown locale falls back to Polish.
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
  let label: string;
  try {
    label = format(locale);
  } catch {
    label = format("pl-PL");
  }
  return { label, iso: date.toISOString() };
}
