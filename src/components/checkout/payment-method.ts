/**
 * The buyer's choice between paying online, paying the seller by hand (bank
 * transfer or "BLIK przelew na telefon") and paying the courier on delivery,
 * offered when the seller turned on "show at checkout" for the manual payment
 * gateway or offers cash on delivery.
 *
 * `POST /public-commerce/payment-methods` takes the body of `/buy` and answers
 * `{ success: true, choice: null }` (nothing to choose) or
 * `{ success: true, choice: { methods, manualAccountTypes } }`. The pick goes
 * to `/buy` as `paymentMethod`. Anything else (an old backend, an error, a
 * timeout) counts as "nothing to choose", so the cart buys as before.
 */

import type { CheckoutTextKey } from "./texts";

/** `cod` is cash on delivery: the buyer pays the courier (Poland only, shipped carts). */
export type PaymentMethod = "online" | "manual" | "cod";
export type ManualAccountType = "bankTransfer" | "blik";

export type PaymentMethodChoice = {
  /** In the seller's order (cash on delivery last); the first one is selected by default. */
  methods: PaymentMethod[];
  /** How the manual option is paid; decides its label. */
  manualAccountTypes: ManualAccountType[];
};

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
  return {
    methods,
    manualAccountTypes: uniqueKnown(
      (choice as { manualAccountTypes?: unknown }).manualAccountTypes,
      ACCOUNT_TYPES,
    ),
  };
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
