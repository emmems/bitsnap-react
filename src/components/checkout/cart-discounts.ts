import { getPanelSession } from "@/src/panel/session-storage";

/**
 * The buyer's discounts before checkout (`GetCartDiscountContext`), asked with
 * a plain Connect JSON `fetch`: `@connectrpc` is not in the cart bundle.
 *
 * The same rule as the Bitsnap checkout: a customer discount never adds to the
 * club or the coupon, the better one applies and the other is struck. The
 * server decides; the drawer only shows the answer. Any failure (network, an
 * older server without the method, a product the catalog does not sell, a
 * malformed answer) is `null`, and the drawer shows its footer as before.
 */

export type CartDiscountKind = "customer" | "club" | "coupon";

export type CartDiscountLine = {
  kind: CartDiscountKind;
  /** Minor units: what it takes off when applied, what it would have taken when struck. */
  minor: number;
  code?: string;
  /** Basis points (1000 = 10 %), for the customer discount. */
  bp?: number;
  /** The club's name. */
  name?: string;
};

export type CartDiscountContext = {
  /** `""` when the server did not price the cart (no `outcome` then). */
  currency: string;
  itemsSubtotalMinor: number;
  authenticated: boolean;
  customerDiscountsAvailable: boolean;
  outcome?: {
    applied: CartDiscountLine[];
    struck: CartDiscountLine[];
    customerWon: boolean;
  };
  productsAfterDiscountsMinor: number;
};

export type CartDiscountItem = {
  productId: string;
  quantity: number;
  /**
   * A pay-what-you-want line: the amount per item, in minor units, the same
   * value the cart sends to `/buy` as `items[].amount`. Absent otherwise.
   */
  amount?: number;
};

/** The server takes 1 to 100 lines of 1 to 10 000 items each. */
export const MAX_DISCOUNT_ITEMS = 100;
export const MAX_DISCOUNT_QUANTITY = 10_000;

/**
 * A signed-in buyer's express buttons wait for the answer; a server that does
 * not answer in this time is a failure, and they show. One deadline for the
 * whole request: the session exchange and the context call share it.
 */
const DEFAULT_DEADLINE_MS = 8_000;
let deadlineMs = DEFAULT_DEADLINE_MS;

/** For tests: a shorter deadline; no argument restores the default. */
export function setCartDiscountDeadlineForTests(ms?: number) {
  deadlineMs = ms ?? DEFAULT_DEADLINE_MS;
}

const SERVICE = "/api/rpc/public.v1.LoyaltyCustomerService/";

async function connectCall(
  host: string,
  method: string,
  body: unknown,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const response = await fetch(host + SERVICE + method, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    },
    body: JSON.stringify(body),
    credentials: "omit",
    signal,
  });
  if (!response.ok) {
    throw new Error(`${method}: HTTP ${response.status}`);
  }
  return await response.json();
}

/**
 * A short, non-secret fingerprint of a string (FNV-1a, 32 bits, base 36): a
 * cache key that changes with the panel access token without holding it.
 */
export function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** An int64 in proto3 JSON is a string; a number is accepted too. Absent is 0. */
function int64(value: unknown): number | undefined {
  if (value == null) return 0;
  const parsed =
    typeof value === "string" && /^-?\d+$/.test(value)
      ? Number(value)
      : typeof value === "number" && Number.isInteger(value)
        ? value
        : NaN;
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

const KINDS: readonly string[] = ["customer", "club", "coupon"];

function parseLine(raw: unknown): CartDiscountLine | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const line = raw as Record<string, unknown>;
  const minor = int64(line.minor);
  if (typeof line.kind !== "string" || !KINDS.includes(line.kind) || minor == null) {
    return undefined;
  }
  return {
    kind: line.kind as CartDiscountKind,
    minor,
    ...(typeof line.code === "string" && line.code !== "" ? { code: line.code } : {}),
    ...(typeof line.bp === "number" && line.bp > 0 ? { bp: line.bp } : {}),
    ...(typeof line.name === "string" && line.name !== "" ? { name: line.name } : {}),
  };
}

/**
 * The lines of a known kind. A kind this version does not know (a newer
 * server) is skipped, so the rest of the answer, `customerWon` included, stays.
 */
function parseLines(raw: unknown): CartDiscountLine[] | undefined {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return undefined;
  const lines: CartDiscountLine[] = [];
  for (const item of raw) {
    const kind = (item as Record<string, unknown> | null)?.kind;
    if (typeof kind === "string" && kind !== "" && !KINDS.includes(kind)) continue;
    const line = parseLine(item);
    if (line == null) return undefined;
    lines.push(line);
  }
  return lines;
}

/** The answer, or `undefined` when it is not the shape the contract promises. */
export function parseCartDiscountContext(raw: unknown): CartDiscountContext | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  const answer = raw as Record<string, unknown>;
  const itemsSubtotalMinor = int64(answer.itemsSubtotalMinor);
  const productsAfterDiscountsMinor = int64(answer.productsAfterDiscountsMinor);
  if (
    typeof (answer.currency ?? "") !== "string" ||
    itemsSubtotalMinor == null ||
    productsAfterDiscountsMinor == null
  ) {
    return undefined;
  }
  const currency = (answer.currency ?? "") as string;
  let outcome: CartDiscountContext["outcome"];
  if (answer.discountOutcome != null) {
    if (typeof answer.discountOutcome !== "object") return undefined;
    const raw = answer.discountOutcome as Record<string, unknown>;
    const applied = parseLines(raw.applied);
    const struck = parseLines(raw.struck);
    // An outcome is priced: it has the cart's currency.
    if (applied == null || struck == null || currency === "") return undefined;
    outcome = { applied, struck, customerWon: raw.customerWon === true };
  }
  return {
    currency,
    itemsSubtotalMinor,
    authenticated: answer.authenticated === true,
    customerDiscountsAvailable: answer.customerDiscountsAvailable === true,
    ...(outcome != null ? { outcome } : {}),
    productsAfterDiscountsMinor,
  };
}

// ------------------------------------------------------------ panel session

/** A panel access token and the host it was issued by. */
export type PanelSession = { token: string; host: string };

/**
 * The panel session of this shop, if the buyer signed in to the panel on this
 * device against the cart's host. A token of another host (a panel set up for
 * another server, the default key) is never sent to this one.
 */
export function findPanelSession(projectID: string, host: string): PanelSession | undefined {
  try {
    const token = getPanelSession(projectID, host);
    if (token) return { token, host };
  } catch {
    // The host page may block localStorage.
  }
  return undefined;
}

type Exchanged = { token: string | undefined; expiresAtMs: number };

/** One exchange per access token and page, kept until shortly before it expires. */
const exchanged = new Map<string, Promise<Exchanged>>();

/** A failed exchange is asked again after this long. */
const FAILED_EXCHANGE_MS = 60_000;

const STORED_PREFIX = "bitsnap-cart-loyalty-session:";

/**
 * Where a page keeps an exchanged session for the next page of the same shop
 * (`sessionStorage`, this tab only), so a multi-page shop does not open a new
 * server session on every page load.
 */
export function loyaltySessionKey(host: string, projectID: string, accessToken: string) {
  return `${STORED_PREFIX}${encodeURIComponent(host)}:${encodeURIComponent(projectID)}:${shortHash(accessToken)}`;
}

function sessionStore(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function readStored(key: string): Exchanged | undefined {
  try {
    const raw = sessionStore()?.getItem(key);
    if (raw == null) return undefined;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof stored.token === "string" &&
      stored.token !== "" &&
      typeof stored.expiresAtMs === "number" &&
      stored.expiresAtMs > Date.now()
    ) {
      return { token: stored.token, expiresAtMs: stored.expiresAtMs };
    }
    sessionStore()?.removeItem(key);
  } catch {
    // Blocked or full storage: the page exchanges again.
  }
  return undefined;
}

function writeStored(key: string, value: Exchanged) {
  try {
    if (value.token != null) {
      sessionStore()?.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Blocked or full storage: the next page exchanges again.
  }
}

/** For tests: forgets the exchanges of this page (not what `sessionStorage` keeps). */
export function forgetDiscountSessions() {
  exchanged.clear();
}

/**
 * `ExchangePanelSession`: the loyalty session token of a panel access token,
 * `undefined` when it cannot be had (the buyer is then anonymous). Kept in
 * memory and in `sessionStorage` until a minute before it expires.
 */
export async function loyaltySessionToken(
  host: string,
  projectID: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const key = loyaltySessionKey(host, projectID, accessToken);
  let entry = exchanged.get(key);
  if (entry != null && (await entry).expiresAtMs <= Date.now()) {
    exchanged.delete(key);
    entry = undefined;
  }
  if (entry == null) {
    const stored = readStored(key);
    entry =
      stored != null
        ? Promise.resolve(stored)
        : connectCall(host, "ExchangePanelSession", {
            projectId: projectID,
            accessToken,
            environment: "PRODUCTION",
          }, signal).then(
            (raw): Exchanged => {
              const answer = (raw ?? {}) as Record<string, unknown>;
              const token =
                typeof answer.sessionToken === "string" && answer.sessionToken !== ""
                  ? answer.sessionToken
                  : undefined;
              // `expiresAt` is in seconds; a minute early, so a token never expires mid-request.
              const expiresAt = int64(answer.expiresAt) ?? 0;
              const result: Exchanged = {
                token,
                expiresAtMs:
                  token != null && expiresAt > 0
                    ? expiresAt * 1000 - 60_000
                    : Date.now() + FAILED_EXCHANGE_MS,
              };
              if (result.expiresAtMs > Date.now()) writeStored(key, result);
              return result;
            },
            (): Exchanged => ({ token: undefined, expiresAtMs: Date.now() + FAILED_EXCHANGE_MS }),
          );
    exchanged.set(key, entry);
  }
  return (await entry).token;
}

// ----------------------------------------------------------------- the call

export type CartDiscountRequest = {
  host: string;
  projectID: string;
  items: readonly CartDiscountItem[];
  locale?: string;
  /** The cart's coupon code, as `/buy` sends it. */
  couponCode?: string;
  /** The panel session stored on this device, if any; used only when issued by `host`. */
  panelSession?: PanelSession;
};

/** The JSON body of `GetCartDiscountContext`. */
export function cartDiscountRequestBody(
  projectID: string,
  items: readonly CartDiscountItem[],
  sessionToken: string | undefined,
  locale: string | undefined,
  couponCode?: string,
) {
  return {
    projectId: projectID,
    environment: "PRODUCTION",
    items: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      // An int64 in proto3 JSON is a string.
      ...(item.amount != null ? { amount: String(item.amount) } : {}),
    })),
    ...(sessionToken != null ? { sessionToken } : {}),
    ...(couponCode ? { couponCode } : {}),
    ...(locale ? { locale } : {}),
  };
}

/**
 * The buyer's discounts for these lines; `null` on any failure, and when the
 * exchange and the call together take longer than the deadline.
 */
export async function fetchCartDiscountContext(
  request: CartDiscountRequest,
): Promise<CartDiscountContext | null> {
  const controller = typeof AbortController === "function" ? new AbortController() : undefined;
  const signal = controller?.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The race also ends a wait for an exchange another request started, and a
  // `fetch` that ignores the signal.
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve(null);
    }, deadlineMs);
  });
  const ask = async (): Promise<CartDiscountContext | null> => {
    const panel = request.panelSession;
    const sessionToken =
      panel != null && panel.host === request.host
        ? await loyaltySessionToken(request.host, request.projectID, panel.token, signal)
        : undefined;
    const raw = await connectCall(
      request.host,
      "GetCartDiscountContext",
      cartDiscountRequestBody(
        request.projectID,
        request.items,
        sessionToken,
        request.locale,
        request.couponCode,
      ),
      signal,
    );
    return parseCartDiscountContext(raw) ?? null;
  };
  try {
    return await Promise.race([ask(), deadline]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --------------------------------------------------------------- the view

/** What the drawer shows about discounts; `null` shows the footer as before. */
export type CartDiscountsView = {
  /** The discount lines (only those that take something off), when there is a choice to show. */
  outcome?: {
    applied: CartDiscountLine[];
    struck: CartDiscountLine[];
    customerWon: boolean;
  };
  /** The products after the applied discounts, in minor units: the amount at checkout. */
  totalAfterDiscounts: number;
  /** An anonymous buyer in a shop with customer discounts: say they sign in at checkout. */
  signInHint: boolean;
  /** The answer is for an earlier cart and a new one is asked: amounts show "…". */
  pending: boolean;
};

/**
 * The answer checked against the cart on screen. Without an outcome the server
 * did not price the cart (an anonymous buyer, a shop without customer
 * discounts): nothing to compare, only the sign-in hint may show. With one, a
 * currency the cart does not show or a subtotal that is not the cart's total
 * (a price changed since) means the answer is not about this cart: `null`.
 * A `pending` answer (for the previous lines) keeps its labels, not its amounts.
 */
export function cartDiscountsView(
  context: CartDiscountContext | null | undefined,
  cart: { currency: string; total: number; totalComplete: boolean; pending: boolean },
): CartDiscountsView | null {
  if (context == null) return null;
  const signInHint = !context.authenticated && context.customerDiscountsAvailable;
  if (context.outcome == null) {
    return signInHint
      ? { totalAfterDiscounts: cart.total, signInHint, pending: cart.pending }
      : null;
  }
  if (context.currency.toUpperCase() !== cart.currency.toUpperCase()) return null;
  if (!cart.pending && (!cart.totalComplete || context.itemsSubtotalMinor !== cart.total)) {
    return null;
  }
  const applied = context.outcome.applied.filter((line) => line.minor > 0);
  const struck = context.outcome.struck.filter((line) => line.minor > 0);
  const outcome =
    applied.length + struck.length > 0
      ? { applied, struck, customerWon: context.outcome.customerWon }
      : undefined;
  if (outcome == null && !signInHint) return null;
  return {
    ...(outcome != null ? { outcome } : {}),
    totalAfterDiscounts:
      outcome != null ? context.productsAfterDiscountsMinor : cart.total,
    signInHint,
    pending: cart.pending,
  };
}
