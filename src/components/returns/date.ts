import { timestampDate, type Timestamp } from "@bufbuild/protobuf/wkt";

/** Medium date of a protobuf timestamp in the given locale, empty when unset. */
export function formatDate(
  timestamp: Timestamp | undefined,
  locale: string,
): string {
  if (timestamp == null) {
    return "";
  }

  const date = timestampDate(timestamp);

  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
