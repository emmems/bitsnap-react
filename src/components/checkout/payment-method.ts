/**
 * The buyer's choice between paying online, paying the seller by hand (bank
 * transfer or "BLIK przelew na telefon") and paying the courier on delivery,
 * offered when the seller turned on "show at checkout" for the manual payment
 * gateway or offers cash on delivery.
 *
 * `POST /public-commerce/payment-methods` takes the body of `/buy` and answers
 * `{ success: true, choice: null }` (nothing to choose) or
 * `{ success: true, choice: { methods, manualAccountTypes, logos? } }`. The pick
 * goes to `/buy` as `paymentMethod`. Anything else (an old backend, an error, a
 * timeout) counts as "nothing to choose", so the cart buys as before.
 */

import type { CheckoutTextKey } from "./texts";

/** `cod` is cash on delivery: the buyer pays the courier (Poland only, shipped carts). */
export type PaymentMethod = "online" | "manual" | "cod";
export type ManualAccountType = "bankTransfer" | "blik";

/**
 * A payment logo the server picked for a method's card. Decorative: the card
 * text already names the methods.
 */
export type PaymentLogo = {
  id: string;
  /** Absolute `https:` URL (`http:` only on localhost, for local development). */
  src: string;
  alt: string;
  /** Intrinsic size: only the aspect ratio is used, the height is the slot's. */
  width: number;
  height: number;
  /** Drawn for a white background: shown on a white tile in the dark theme. */
  chip?: boolean;
};

export type PaymentMethodChoice = {
  /** In the seller's order (cash on delivery last); the first one is selected by default. */
  methods: PaymentMethod[];
  /** How the manual option is paid; decides its label. */
  manualAccountTypes: ManualAccountType[];
  /** Logos per method, in the server's order; absent when the server sent none (older servers). */
  logos?: Partial<Record<PaymentMethod, PaymentLogo[]>>;
};

/** At most this many logos per card; the rest are dropped. */
export const MAX_LOGOS_PER_METHOD = 6;

/** A slow answer must not hold up the "Next step" button for long. */
export const PAYMENT_METHODS_TIMEOUT_MS = 5000;

const METHODS: readonly PaymentMethod[] = ["online", "manual", "cod"];
const ACCOUNT_TYPES: readonly ManualAccountType[] = ["bankTransfer", "blik"];

function uniqueKnown<T extends string>(value: unknown, known: readonly T[]): T[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: T[] = [];
  for (const item of value) {
    if (known.includes(item as T) && !result.includes(item as T)) {
      result.push(item as T);
    }
  }
  return result;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** `https:`, or `http:` on localhost (a local backend in development). */
function isLogoUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))
    );
  } catch {
    return false;
  }
}

const isSize = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

function parseLogo(value: unknown): PaymentLogo | null {
  if (typeof value !== "object" || value == null) {
    return null;
  }
  const { id, src, alt, width, height, chip } = value as Record<string, unknown>;
  if (typeof id !== "string" || !id || typeof alt !== "string") {
    return null;
  }
  if (!isLogoUrl(src) || !isSize(width) || !isSize(height)) {
    return null;
  }
  return chip === true ? { id, src, alt, width, height, chip } : { id, src, alt, width, height };
}

/**
 * The valid logos of the methods this version knows, at most
 * `MAX_LOGOS_PER_METHOD` each, without repeated ids; `undefined` when none
 * is left. A bad entry is dropped, never the whole answer.
 */
function parseLogos(value: unknown): PaymentMethodChoice["logos"] {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return undefined;
  }
  const result: Partial<Record<PaymentMethod, PaymentLogo[]>> = {};
  for (const method of METHODS) {
    const list = (value as Record<string, unknown>)[method];
    if (!Array.isArray(list)) {
      continue;
    }
    const logos: PaymentLogo[] = [];
    for (const item of list) {
      const logo = parseLogo(item);
      if (logo && !logos.some((other) => other.id === logo.id)) {
        logos.push(logo);
      }
      if (logos.length === MAX_LOGOS_PER_METHOD) {
        break;
      }
    }
    if (logos.length) {
      result[method] = logos;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

/**
 * The choice in a `payment-methods` answer, or `null` when there is nothing
 * to choose: `choice: null`, a malformed answer, or fewer than two known
 * methods. Methods this version does not know are left out.
 */
export function parsePaymentMethodChoice(body: unknown): PaymentMethodChoice | null {
  if (typeof body !== "object" || body == null) {
    return null;
  }
  const choice = (body as { choice?: unknown }).choice;
  if (typeof choice !== "object" || choice == null) {
    return null;
  }
  const methods = uniqueKnown((choice as { methods?: unknown }).methods, METHODS);
  if (methods.length < 2) {
    return null;
  }
  const manualAccountTypes = uniqueKnown(
    (choice as { manualAccountTypes?: unknown }).manualAccountTypes,
    ACCOUNT_TYPES,
  );
  const logos = parseLogos((choice as { logos?: unknown }).logos);
  return logos ? { methods, manualAccountTypes, logos } : { methods, manualAccountTypes };
}

/** Every logo URL of a choice, without repeats. */
export function paymentLogoUrls(choice: PaymentMethodChoice | null | undefined): string[] {
  const urls = new Set<string>();
  for (const list of Object.values(choice?.logos ?? {})) {
    for (const logo of list ?? []) {
      urls.add(logo.src);
    }
  }
  return [...urls];
}

const preloaded = new Set<string>();

/**
 * Starts loading the choice's logos so the cards paint them at once. Browser
 * only, never awaited, at most once per URL for the page's life.
 */
export function preloadPaymentLogos(choice: PaymentMethodChoice | null | undefined): void {
  if (typeof Image === "undefined") {
    return;
  }
  for (const src of paymentLogoUrls(choice)) {
    if (preloaded.has(src)) {
      continue;
    }
    preloaded.add(src);
    const image = new Image();
    image.decoding = "async";
    image.src = src;
  }
}

/**
 * The choice without cash on delivery, `null` when fewer than two methods are
 * left: shown while the choice for a new country is asked for.
 */
export function withoutCod(choice: PaymentMethodChoice | null): PaymentMethodChoice | null {
  if (choice == null) {
    return null;
  }
  const methods = choice.methods.filter((method) => method !== "cod");
  return methods.length < 2 ? null : { ...choice, methods };
}

/** The method the buyer picked, or the seller's first one when the pick is not offered. */
export function effectivePaymentMethod(
  choice: PaymentMethodChoice,
  selected: PaymentMethod | undefined,
): PaymentMethod {
  return selected != null && choice.methods.includes(selected)
    ? selected
    : choice.methods[0];
}

/** Label of the manual option for the account types the seller has. */
export function manualPaymentTitleKey(types: ManualAccountType[]): CheckoutTextKey {
  const hasBank = types.includes("bankTransfer");
  const hasBlik = types.includes("blik");
  if (hasBlik && !hasBank) {
    return "paymentMethodManualBlik";
  }
  if (hasBank && !hasBlik) {
    return "paymentMethodManualTransfer";
  }
  return "paymentMethodManualBoth";
}

/**
 * Asks the backend whether the cart offers a choice. Never throws: any
 * failure is `null`, which keeps today's plain `/buy`.
 */
export async function fetchPaymentMethodChoice(
  url: string,
  init: { headers: Record<string, string>; body: string },
  timeoutMs: number = PAYMENT_METHODS_TIMEOUT_MS,
): Promise<PaymentMethodChoice | null> {
  const controller = typeof AbortController === "undefined" ? undefined : new AbortController();
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: init.headers,
      body: init.body,
      signal: controller?.signal,
    });
    if (!response.ok) {
      return null;
    }
    return parsePaymentMethodChoice(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
