import { resolveReturnsTexts, statusTextKey } from "../../components/returns/texts";
import { getPanelTexts, orderStatusLabel } from "../texts";
import { getOrderHistoryTexts, type OrderHistoryTexts } from "./texts";

/** What the panel needs of one `OrderHistoryEntry` (kept narrow so tests need no proto). */
export type OrderHistoryEntryInput = {
  kind: string;
  params: Record<string, string | undefined>;
  linkUrl?: string;
};

export type OrderHistoryIcon =
  | "paid"
  | "shipped"
  | "status"
  | "tracking"
  | "email"
  | "access"
  | "invoice"
  | "refund"
  | "return";

/** One rendered sentence of the buyer's order history. */
export type OrderHistoryLine = {
  icon: OrderHistoryIcon;
  text: string;
  /** An https URL (the invoice), with its link text. */
  link?: { url: string; label: string };
};

/** Display names of payment providers; an unknown code is left out of the sentence. */
const PROVIDER_NAMES: Record<string, string> = {
  stripe: "Stripe",
  payu: "PayU",
  przelewy24: "Przelewy24",
  p24: "Przelewy24",
  tpay: "Tpay",
  paynow: "Paynow",
  paypal: "PayPal",
  revolut: "Revolut",
  revolutpay: "Revolut Pay",
  inpost: "InPost Pay",
  inpostpay: "InPost Pay",
  applepay: "Apple Pay",
  googlepay: "Google Pay",
  imoje: "imoje",
  autopay: "Autopay",
  blik: "BLIK",
};

const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);

const param = (entry: OrderHistoryEntryInput, name: string): string =>
  (entry.params[name] ?? "").trim();

/** "12.50 PLN" in the locale's currency format; other shapes stay as they are. */
export function formatHistoryAmount(amount: string, locale: string): string {
  const match = /^(-?\d+(?:[.,]\d+)?)\s*([A-Za-z]{3})$/.exec(amount.trim());
  if (match == null) return amount.trim();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: match[2].toUpperCase(),
    }).format(Number(match[1].replace(",", ".")));
  } catch {
    return amount.trim();
  }
}

function httpsUrl(url: string | undefined): string | undefined {
  if (url == null || url.trim() === "") return undefined;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The sentence of one history entry in the panel's language, built from `kind`
 * and `params` only (`summary_key` is the dashboard's). `null` for a kind this
 * version does not know or an entry that has nothing to say, so a future kind
 * never shows up as a raw key.
 */
export function orderHistoryLine(
  entry: OrderHistoryEntryInput,
  locale: string,
  texts: OrderHistoryTexts = getOrderHistoryTexts(locale),
): OrderHistoryLine | null {
  const with1 = (
    icon: OrderHistoryIcon,
    value: string,
    full: string,
    bare: string,
    name: string,
  ): OrderHistoryLine => ({
    icon,
    text: value === "" ? bare : fill(full, { [name]: value }),
  });

  switch (entry.kind) {
    case "order.paid": {
      const provider =
        PROVIDER_NAMES[param(entry, "provider").toLowerCase().replace(/[^a-z0-9]/g, "")] ?? "";
      return with1("paid", provider, texts.paidWith, texts.paid, "provider");
    }
    case "order.status_changed": {
      const to = param(entry, "to").toLowerCase();
      if (to === "sent") return { icon: "shipped", text: texts.shipped };
      const label = orderStatusLabel(to, getPanelTexts(locale)) ?? "";
      return with1("status", label, texts.statusChangedTo, texts.statusChanged, "status");
    }
    case "order.tracking_set": {
      const number = param(entry, "number");
      if (number === "") return null;
      const carrier = param(entry, "carrier");
      return {
        icon: "tracking",
        text: fill(carrier === "" ? texts.trackingNumber : texts.trackingNumberCarrier, {
          number,
          carrier,
        }),
      };
    }
    case "email.sent": {
      const access = param(entry, "template") === "access";
      return with1(
        "email",
        param(entry, "email"),
        access ? texts.accessEmailSentTo : texts.emailSentTo,
        access ? texts.accessEmailSent : texts.emailSent,
        "email",
      );
    }
    case "access.granted":
      return with1(
        "access",
        param(entry, "product"),
        texts.accessGrantedProduct,
        texts.accessGranted,
        "product",
      );
    case "invoice.issued": {
      const line = with1(
        "invoice",
        param(entry, "number"),
        texts.invoiceIssuedNumber,
        texts.invoiceIssued,
        "number",
      );
      const url = httpsUrl(entry.linkUrl);
      return url == null ? line : { ...line, link: { url, label: texts.invoiceLink } };
    }
    case "refund.succeeded": {
      const amount = param(entry, "amount");
      return with1(
        "refund",
        amount === "" ? "" : formatHistoryAmount(amount, locale),
        texts.refundedAmount,
        texts.refunded,
        "amount",
      );
    }
    case "return.requested":
      return { icon: "return", text: texts.returnRequested };
    case "return.status_changed": {
      const to = param(entry, "to").toLowerCase();
      const key = statusTextKey(to);
      const label = key === "statusFallback" ? "" : resolveReturnsTexts(locale)[key];
      return with1(
        "return",
        label,
        texts.returnStatusChangedTo,
        texts.returnStatusChanged,
        "status",
      );
    }
    default:
      return null;
  }
}

const RELATIVE_STEPS: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number; below: number }> = [
  { unit: "second", seconds: 1, below: 45 },
  { unit: "minute", seconds: 60, below: 45 * 60 },
  { unit: "hour", seconds: 3600, below: 22 * 3600 },
  { unit: "day", seconds: 86400, below: 26 * 86400 },
  { unit: "month", seconds: 30 * 86400, below: 320 * 86400 },
  { unit: "year", seconds: 365 * 86400, below: Number.POSITIVE_INFINITY },
];

/** "3 dni temu" / "3 days ago"; under 45 s it is "now". */
export function formatRelativeTime(date: Date, locale: string, now: Date = new Date()): string {
  const diff = (date.getTime() - now.getTime()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 45) return format.format(0, "second");
  const step = RELATIVE_STEPS.find((candidate) => abs < candidate.below) ?? RELATIVE_STEPS[5];
  return format.format(Math.round(diff / step.seconds), step.unit);
}

/** The exact date and time for the title of a relative date. */
export function formatExactTime(date: Date, locale: string): string {
  return date.toLocaleString(locale, { dateStyle: "long", timeStyle: "short" });
}
