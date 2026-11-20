import type { LocalCartLine } from "./CartProvider";
import {
  isSnapshotPriceExpired,
  snapshotVersionSnapshot,
  subscribeToSnapshot,
  type CartLineDetails,
  type CartSnapshot,
} from "./cart-snapshot";

/**
 * The cart as the drawer shows it: the local lines joined with what the server
 * said (the revalidation query) or, until it answers, with the local snapshot.
 * Pure: no React, no storage, no clock (`now` is passed in).
 *
 * Also holds the pure parts of the price gate (decision D18) and the wallet
 * rules (D12), so they test without a DOM.
 */

// ------------------------------------------------------- pay what you want

/**
 * - `amount`: the buyer's own price is honoured: priced at `line.amount`,
 *   skips the price gate.
 * - `suggested`: a pay-what-you-want product without a chosen amount; the
 *   server charges the suggested price. Counts only for the wallet rule.
 * - `none`: an ordinary line at the catalog price, gated.
 */
export type PayWhatYouWantKind = "none" | "amount" | "suggested";

export function payWhatYouWantKind(
  line: Pick<LocalCartLine, "amount">,
  details: Pick<CartLineDetails, "priceType" | "recurring"> | undefined,
): PayWhatYouWantKind {
  // The server ignores the amount of a recurring variant.
  if (details?.recurring != null) {
    return "none";
  }
  if (details?.priceType === "pay_what_you_want") {
    return line.amount != null ? "amount" : "suggested";
  }
  if (details?.priceType !== undefined) {
    // The product stopped being pay-what-you-want (fixed price, free, ...).
    return "none";
  }
  // `priceType` absent (classic product, or a backend that does not send it):
  // interim rule, an `amount` is honoured until the server says otherwise.
  return line.amount != null ? "amount" : "none";
}

/** True when the line is priced at its `amount` and skips the price gate. */
export function isPayWhatYouWantLine(
  line: Pick<LocalCartLine, "amount">,
  details: Pick<CartLineDetails, "priceType" | "recurring"> | undefined,
): boolean {
  return payWhatYouWantKind(line, details) === "amount";
}

/**
 * Lines whose `amount` the interim rule honours (`priceType` unknown) and a
 * `price-changed` answer named by `productId`: the server does not treat them
 * as pay-what-you-want, so the caller drops their `amount` and gates them
 * normally. Without a `productId` nothing is dropped (the buyer's amount is
 * not discarded on a guess); the gate still runs on every line.
 */
export function interimPayWhatYouWantLineIDs(
  view: Pick<CartView, "lines">,
  productId: string | undefined,
): string[] {
  if (productId == null) {
    return [];
  }
  return view.lines
    .filter(
      ({ line, details }) =>
        line.productID === productId &&
        line.amount != null &&
        details != null &&
        details.priceType === undefined &&
        details.recurring == null,
    )
    .map(({ line }) => line.id);
}

// -------------------------------------------------------------------- view

/** The server's current answers, from the revalidation query. */
export type CartViewFresh = {
  /**
   * Details by product id from the query result, `keepPreviousData` included:
   * every entry is a server answer.
   */
  details: ReadonlyMap<string, CartLineDetails>;
  /** Product ids the server answered at least once in this page session. */
  confirmed: ReadonlySet<string>;
  /** The revalidation failed (offline, 5xx). */
  failed?: boolean;
};

/** A price the buyer was told is new, to be accepted by a second click. */
export type PriceMark = { priceVersion: string; shownPrice: number };

export type CartViewStatus =
  | "empty"
  | "snapshot"
  | "partial"
  | "fresh"
  | "unavailable-refresh";

export type CartViewLine = {
  line: LocalCartLine;
  /** From the query when it has the product, else from the snapshot. */
  details?: CartLineDetails;
  source: "fresh" | "snapshot" | "none";
  /** The server answered for this product in this page session. */
  confirmed: boolean;
  payWhatYouWant: PayWhatYouWantKind;
  /** False when the snapshot price is known to be stale (a scheduled change passed). */
  priceKnown: boolean;
  /** Unit price in minor units: the `amount` of a pay-what-you-want line, else `effectivePrice ?? price`. */
  unitPrice?: number;
  /** The line carries a "price updated" mark that the buyer has not accepted yet. */
  marked: boolean;
};

export type CartView = {
  lines: CartViewLine[];
  /** Sum of `unitPrice * quantity` over the lines with a known price, in minor units. */
  sum: number;
  /** False when some line has no known price yet. */
  sumComplete: boolean;
  currency: string;
  isSomeProductDeliverable: boolean;
  status: CartViewStatus;
  /** The revalidation failed (also true with no snapshot, for the error row). */
  failed: boolean;
};

const DEFAULT_CURRENCY = "PLN";

/** The price the catalog shows for a unit: `pricing.effectivePrice ?? price`. */
export function catalogUnitPrice(details: CartLineDetails): number {
  return details.pricing?.effectivePrice ?? details.price;
}

export function buildCartView(
  localLines: readonly LocalCartLine[],
  snapshot: CartSnapshot,
  fresh: CartViewFresh | undefined,
  now: number,
  marks?: ReadonlyMap<string, PriceMark>,
): CartView {
  const lines: CartViewLine[] = localLines.map((line) => {
    const freshDetails = fresh?.details.get(line.productID);
    const snapshotDetails = snapshot[line.productID]?.details;
    const details = freshDetails ?? snapshotDetails;
    const source: CartViewLine["source"] =
      freshDetails != null ? "fresh" : snapshotDetails != null ? "snapshot" : "none";
    const kind = payWhatYouWantKind(line, details);
    const expired =
      source === "snapshot" && details != null && isSnapshotPriceExpired(details, now);
    const priceKnown = details != null && (kind === "amount" || !expired);
    const viewLine: CartViewLine = {
      line,
      details,
      source,
      confirmed: fresh?.confirmed.has(line.productID) ?? false,
      payWhatYouWant: kind,
      priceKnown,
      marked: marks?.has(line.id) ?? false,
    };
    if (priceKnown && details != null) {
      viewLine.unitPrice =
        kind === "amount" ? (line.amount as number) : catalogUnitPrice(details);
    }
    return viewLine;
  });

  let sum = 0;
  let sumComplete = true;
  for (const item of lines) {
    if (item.unitPrice == null) {
      sumComplete = false;
    } else {
      sum += item.unitPrice * item.line.quantity;
    }
  }

  const failed = fresh?.failed === true;
  const confirmedCount = lines.filter((item) => item.confirmed).length;
  let status: CartViewStatus;
  if (lines.length === 0) {
    status = "empty";
  } else if (confirmedCount === lines.length) {
    status = "fresh";
  } else if (confirmedCount > 0) {
    // A confirmed line stays confirmed; a later error never demotes it.
    status = "partial";
  } else if (failed) {
    status = lines.some((item) => item.details != null)
      ? "unavailable-refresh"
      : "partial";
  } else {
    status = lines.every((item) => item.details != null) ? "snapshot" : "partial";
  }

  return {
    lines,
    sum,
    sumComplete,
    currency:
      lines.find((item) => item.details != null)?.details?.currency ??
      DEFAULT_CURRENCY,
    isSomeProductDeliverable: lines.some(
      (item) => item.details?.isDeliverable === true,
    ),
    status,
    failed,
  };
}

// ------------------------------------------------------------- stable store

export type VersionStore = {
  subscribe: (listener: () => void) => () => void;
  version: () => number;
};

/**
 * One store for `useSyncExternalStore` over the local cart and the snapshot:
 * `getVersion()` is the sum of two monotonic counters, so it only grows and is
 * the same number until something changed. The view itself is never returned
 * from `getSnapshot` (that would re-render in a loop); the hook builds it in a
 * `useMemo` keyed on this version.
 *
 * The local cart store is passed in (the provider owns it), so this module
 * does not import the provider's code.
 */
export function createCartViewStore(
  local: VersionStore,
  snapshot: VersionStore = {
    subscribe: subscribeToSnapshot,
    version: snapshotVersionSnapshot,
  },
): { subscribe: VersionStore["subscribe"]; getVersion: () => number } {
  return {
    subscribe(listener) {
      const stopLocal = local.subscribe(listener);
      const stopSnapshot = snapshot.subscribe(listener);
      return () => {
        stopLocal();
        stopSnapshot();
      };
    },
    getVersion: () => local.version() + snapshot.version(),
  };
}

// --------------------------------------------------------------- price gate

/** What a line has been showing: its unit price, and since when. */
export type ShownPrice = { price: number; currency: string; since: number };

export type PriceGateState = {
  shown: ReadonlyMap<string, ShownPrice>;
  marks: ReadonlyMap<string, PriceMark>;
};

export const EMPTY_PRICE_GATE_STATE: PriceGateState = {
  shown: new Map(),
  marks: new Map(),
};

/** A price shown for less than this before the click counts as unseen (N15). */
export const PRICE_SEEN_MS = 1000;

function freshVersion(item: CartViewLine): string | undefined {
  return item.details?.pricing?.priceVersion;
}

/**
 * Remembers what each line is showing and marks a line at once when its
 * rendered unit price changes while the drawer is open and the new price is a
 * server answer (N15). A mark is dropped when its line is gone or already
 * carries the fresh version (adopted). Returns `state` itself when nothing
 * changed.
 *
 * The compared field is `pricing.effectivePrice ?? price` plus `currency`.
 * Pay-what-you-want lines at their `amount` are never shown-tracked or marked.
 */
export function trackPrices(
  state: PriceGateState,
  view: CartView,
  now: number,
): PriceGateState {
  const shown = new Map(state.shown);
  const marks = new Map(state.marks);
  let changed = false;
  const ids = new Set<string>();

  for (const item of view.lines) {
    ids.add(item.line.id);
    const { details } = item;
    if (details == null || item.payWhatYouWant === "amount" || !item.priceKnown) {
      continue;
    }
    const price = catalogUnitPrice(details);
    const previous = shown.get(item.line.id);
    if (previous != null && previous.price === price && previous.currency === details.currency) {
      continue;
    }
    shown.set(item.line.id, { price, currency: details.currency, since: now });
    changed = true;
    const version = freshVersion(item);
    if (
      previous != null &&
      item.source === "fresh" &&
      version != null &&
      version !== item.line.priceVersion
    ) {
      marks.set(item.line.id, { priceVersion: version, shownPrice: price });
    }
  }

  for (const id of [...shown.keys()]) {
    if (!ids.has(id)) {
      shown.delete(id);
      changed = true;
    }
  }
  for (const item of view.lines) {
    const mark = marks.get(item.line.id);
    const version = freshVersion(item);
    if (mark != null && (item.payWhatYouWant === "amount" || version === item.line.priceVersion)) {
      marks.delete(item.line.id);
      changed = true;
    }
  }
  for (const id of [...marks.keys()]) {
    if (!ids.has(id)) {
      marks.delete(id);
      changed = true;
    }
  }
  return changed ? { shown, marks } : state;
}

/** A fresh `priceVersion` to write into a local line. */
export type PriceAdoption = { lineId: string; priceVersion: string };

export type PriceGateResult = {
  /**
   * - `pass`: `/buy` may start (after writing `adopt`);
   * - `marked`: a line shows a price the buyer has not seen long enough or has
   *   not accepted; do not send `/buy`, wait for another click;
   * - `needs-fresh`: a line has no server answer yet; revalidate first.
   */
  result: "pass" | "marked" | "needs-fresh";
  adopt: PriceAdoption[];
  state: PriceGateState;
};

/**
 * "Next step" gate (D18), run on a view whose lines the server answered.
 * Per line that is not a pay-what-you-want line at its `amount`, compare the
 * stored `priceVersion` `L` with the server's `F`:
 *
 * - `L === F`: pass.
 * - `L !== F`, no mark, the fresh price equals the price the line has been
 *   showing for at least `PRICE_SEEN_MS`: adopt `F` silently.
 * - `L !== F`, no mark, otherwise (a different price, or one that appeared less
 *   than `PRICE_SEEN_MS` ago, or nothing shown yet): mark `{F, shownPrice}`
 *   and block.
 * - A marked line (second click): adopt only when the fresh version is still
 *   the marked one; a newer version marks again and blocks.
 *
 * A version is only ever taken from a server answer, never from the snapshot.
 */
export function runPriceGate(
  state: PriceGateState,
  view: CartView,
  now: number,
): PriceGateResult {
  if (
    view.lines.some(
      (item) => !item.confirmed || item.details == null || item.source !== "fresh",
    )
  ) {
    return { result: "needs-fresh", adopt: [], state };
  }

  const marks = new Map(state.marks);
  const adopt: PriceAdoption[] = [];
  let blocked = false;

  for (const item of view.lines) {
    if (item.payWhatYouWant === "amount") {
      marks.delete(item.line.id);
      continue;
    }
    const current = freshVersion(item);
    const stored = item.line.priceVersion;
    if (current == null || current === stored) {
      marks.delete(item.line.id);
      continue;
    }
    const details = item.details as CartLineDetails;
    const price = catalogUnitPrice(details);
    const mark = marks.get(item.line.id);
    if (mark != null) {
      if (mark.priceVersion === current) {
        adopt.push({ lineId: item.line.id, priceVersion: current });
        marks.delete(item.line.id);
      } else {
        marks.set(item.line.id, { priceVersion: current, shownPrice: price });
        blocked = true;
      }
      continue;
    }
    const seen = state.shown.get(item.line.id);
    if (
      seen != null &&
      seen.price === price &&
      seen.currency === details.currency &&
      now - seen.since >= PRICE_SEEN_MS
    ) {
      adopt.push({ lineId: item.line.id, priceVersion: current });
    } else {
      marks.set(item.line.id, { priceVersion: current, shownPrice: price });
      blocked = true;
    }
  }

  const next: PriceGateState = { shown: state.shown, marks };
  return { result: blocked ? "marked" : "pass", adopt: blocked ? [] : adopt, state: next };
}

// ------------------------------------------------------------------ wallets

/**
 * Every wallet button is inert while any local line is unconfirmed or carries
 * an unaccepted price mark (D12, N1).
 */
export function walletsInert(view: Pick<CartView, "lines">): boolean {
  return view.lines.some((item) => !item.confirmed || item.marked);
}

/** What the wallet buttons take as `items`. */
export type WalletItem = {
  name: string;
  id: string;
  /** Catalog price, never the `amount` of a pay-what-you-want line (N2). */
  price: number;
  currency: string | undefined;
  quantity: number;
  isDeliverable: boolean;
  metadata: LocalCartLine["metadata"];
};

/** Always the whole local cart, in local order, with each line's metadata (N1). */
export function walletItems(view: Pick<CartView, "lines">): WalletItem[] {
  return view.lines.map(({ line, details }) => ({
    name: details?.name ?? "",
    id: line.productID,
    price: details != null ? catalogUnitPrice(details) : 0,
    currency: details?.currency,
    quantity: line.quantity,
    isDeliverable: details?.isDeliverable ?? false,
    metadata: line.metadata,
  }));
}

/**
 * Apple Pay and Google Pay send no `amount`, so they are hidden while a line
 * is pay-what-you-want: `amount != null`, or a pay-what-you-want product
 * without an amount (N2).
 */
export function hasPayWhatYouWantLine(view: Pick<CartView, "lines">): boolean {
  return view.lines.some(
    (item) => item.line.amount != null || item.payWhatYouWant === "suggested",
  );
}
