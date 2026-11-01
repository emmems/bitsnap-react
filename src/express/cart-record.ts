import type { CartEnvironment } from "./contracts";

/**
 * The browser-side record of a durable express cart.
 *
 * It is a capability cache, not the cart itself: the server row is the truth
 * and the SDK cart in `localStorage` stays the buyer's convenient copy. The
 * token is scoped to one project + host (+ environment) so two shops, two
 * Bitsnap hosts or a test and a production cart on one page can never reuse
 * each other's authorization.
 *
 * Nothing here is a merchant secret: the token only opens this one guest cart.
 */

export const EXPRESS_CART_KEY_PREFIX = "bitsnap-express-cart";

/** A payment attempt the buyer may return to (mobile redirect, popup close). */
export type PendingExpressAttempt = {
  provider: "inpostPay" | "revolutPay";
  /** The provider's public order/basket id. */
  providerOrderId?: string;
  /** Lines frozen for this attempt; only these are removed once it completes. */
  lines: { id: string; quantity: number }[];
  /** When the attempt started (ms since epoch). */
  ts: number;
};

export type ExpressCartRecord = {
  projectID: string;
  host: string;
  environment: CartEnvironment;
  cartId: string;
  cartToken: string;
  revision: number;
  updatedAt: number;
  /**
   * The lines the server last confirmed. Reconciliation compares the local
   * cart against them, so products added after the last upload are never
   * mistaken for lines removed in the provider's app.
   */
  syncedLines?: { id: string; quantity: number }[];
  /** InPost Pay basket binding key, reused by the widget. */
  inpostBindingApiKey?: string;
  pending?: PendingExpressAttempt;
};

/**
 * A provider attempt younger than this is still worth reconciling; an older
 * one is left alone instead of asking the backend forever.
 */
export const PENDING_EXPRESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type ExpressStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

/** The pending attempt, unless it is older than `PENDING_EXPRESS_MAX_AGE_MS`. */
export function activePendingAttempt(
  record: ExpressCartRecord | undefined,
  now: number = Date.now(),
): PendingExpressAttempt | undefined {
  const pending = record?.pending;
  if (pending == null) {
    return undefined;
  }
  return now - pending.ts <= PENDING_EXPRESS_MAX_AGE_MS ? pending : undefined;
}

function defaultStorage(): ExpressStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function expressCartKey(host: string, projectID: string): string {
  return `${EXPRESS_CART_KEY_PREFIX}:${encodeURIComponent(host)}:${encodeURIComponent(projectID)}`;
}

export function readExpressCartRecord(args: {
  host: string;
  projectID: string;
  storage?: ExpressStorage;
}): ExpressCartRecord | undefined {
  const storage = args.storage ?? defaultStorage();
  if (storage == null) {
    return undefined;
  }
  const key = expressCartKey(args.host, args.projectID);
  let value: unknown;
  try {
    const raw = storage.getItem(key);
    if (raw == null) {
      return undefined;
    }
    value = JSON.parse(raw);
  } catch {
    clearExpressCartRecord(args);
    return undefined;
  }
  if (!isRecord(value)) {
    clearExpressCartRecord(args);
    return undefined;
  }
  if (
    value.projectID !== args.projectID ||
    value.host !== args.host ||
    typeof value.cartId !== "string" ||
    value.cartId.length === 0 ||
    typeof value.cartToken !== "string" ||
    value.cartToken.length === 0 ||
    typeof value.revision !== "number" ||
    (value.environment !== "test" && value.environment !== "production")
  ) {
    // Another project's or an older build's record is not ours to use.
    clearExpressCartRecord(args);
    return undefined;
  }
  return {
    projectID: value.projectID,
    host: value.host,
    environment: value.environment,
    cartId: value.cartId,
    cartToken: value.cartToken,
    revision: value.revision,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    ...(Array.isArray(value.syncedLines)
      ? {
          syncedLines: value.syncedLines.filter(
            (line): line is { id: string; quantity: number } =>
              isRecord(line) &&
              typeof line.id === "string" &&
              typeof line.quantity === "number",
          ),
        }
      : {}),
    ...(typeof value.inpostBindingApiKey === "string"
      ? { inpostBindingApiKey: value.inpostBindingApiKey }
      : {}),
    ...(isPendingAttempt(value.pending) ? { pending: value.pending } : {}),
  };
}

export function writeExpressCartRecord(
  record: ExpressCartRecord,
  storage: ExpressStorage | undefined = defaultStorage(),
): boolean {
  if (storage == null) {
    return false;
  }
  try {
    storage.setItem(
      expressCartKey(record.host, record.projectID),
      JSON.stringify(record),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearExpressCartRecord(args: {
  host: string;
  projectID: string;
  storage?: ExpressStorage;
}): void {
  const storage = args.storage ?? defaultStorage();
  if (storage == null) {
    return;
  }
  try {
    storage.removeItem(expressCartKey(args.host, args.projectID));
  } catch {
    // storage is unavailable
  }
}

/** Updates a stored record in place; `undefined` when there is none. */
export function updateExpressCartRecord(
  args: { host: string; projectID: string; storage?: ExpressStorage },
  update: (record: ExpressCartRecord) => ExpressCartRecord,
): ExpressCartRecord | undefined {
  const current = readExpressCartRecord(args);
  if (current == null) {
    return undefined;
  }
  const next = update(current);
  writeExpressCartRecord(next, args.storage);
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isPendingAttempt(value: unknown): value is PendingExpressAttempt {
  if (!isRecord(value)) {
    return false;
  }
  if (
    value.provider !== "inpostPay" &&
    value.provider !== "revolutPay"
  ) {
    return false;
  }
  if (typeof value.ts !== "number" || !Array.isArray(value.lines)) {
    return false;
  }
  return value.lines.every(
    (line) =>
      isRecord(line) &&
      typeof line.id === "string" &&
      typeof line.quantity === "number",
  );
}
