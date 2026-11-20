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
  // The server honours an `amount` only for `priceType === "pay_what_you_want"`
  // with no `recurring` (instapay `lib/pwyw-limits.ts`). Anything else, a missing
  // `priceType` included (classic product, older backend), is the catalog price
  // and goes through the price gate; the buyer's `amount` is not priced.
  if (details?.priceType !== "pay_what_you_want" || details.recurring != null) {
    return "none";
  }
  return line.amount != null ? "amount" : "suggested";
}

/** True when the line is priced at its `amount` and skips the price gate. */
export function isPayWhatYouWantLine(
  line: Pick<LocalCartLine, "amount">,
  details: Pick<CartLineDetails, "priceType" | "recurring"> | undefined,
): boolean {
  return payWhatYouWantKind(line, details) === "amount";
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
  /**
   * Product ids whose entry in `details` is a real server answer fetched
   * **after the drawer opened** (D18, part 1 §3.5 step 2): not `placeholderData`,
   * not an idle prefetch, not an answer that predates the open. Only these may
   * feed the price gate; a line outside this set makes `runPriceGate` answer
   * `needs-fresh`. Required on purpose: an omitted set must not read as "fresh".
   *
   * Slice 3 fills it from the query: a product id is in the set when the query
   * is not showing placeholder data and the entry's `dataUpdatedAt` is at or
   * after the moment the drawer opened (use the revalidation the click starts or
   * awaits when the data predates the open). After a `price-changed` answer the
   * set is only refilled by the `cache: "no-cache"` refetch.
   */
  gateFresh: ReadonlySet<string>;
  /** The revalidation failed (offline, 5xx). */
  failed?: boolean;
};

/**
 * A price the buyer was told is new, to be accepted by a later click.
 * `markedAt` is when the mark was made; it is the lower bound of how long the
 * marked price has been on screen when `ShownPrice` has no entry for the line.
 */
export type PriceMark = {
  priceVersion: string;
  shownPrice: number;
  markedAt: number;
};

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
  /** The answer was fetched after the drawer opened (`CartViewFresh.gateFresh`). */
  gateFresh: boolean;
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
      gateFresh: fresh?.gateFresh.has(line.productID) ?? false,
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
 * server answer (N15), whatever the line's stored version is. The mark carries
 * `markedAt: now`, so it cannot be adopted before the new price has been on
 * screen for `PRICE_SEEN_MS`. A mark is dropped when its line is gone or is a
 * pay-what-you-want line at its `amount`; the gate drops it on adoption.
 * Returns `state` itself when nothing changed.
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
    if (previous != null && item.source === "fresh" && version != null) {
      marks.set(item.line.id, { priceVersion: version, shownPrice: price, markedAt: now });
    }
  }

  for (const id of [...shown.keys()]) {
    if (!ids.has(id)) {
      shown.delete(id);
      changed = true;
    }
  }
  for (const item of view.lines) {
    if (item.payWhatYouWant === "amount" && marks.delete(item.line.id)) {
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
   * - `needs-fresh`: a line has no server answer from after the drawer opened
   *   (`confirmed`, `gateFresh`); revalidate first.
   */
  result: "pass" | "marked" | "needs-fresh";
  adopt: PriceAdoption[];
  state: PriceGateState;
};

/**
 * "Next step" gate (D18), run on a view whose lines the server answered after
 * the drawer opened. Per line that is not a pay-what-you-want line at its
 * `amount` and whose answer carries a `priceVersion` `F` (the server skips the
 * check without one), with the stored version `L`:
 *
 * - Every such line must have been showing the fresh price (same unit price and
 *   currency) for at least `PRICE_SEEN_MS`, `L === F` included. Otherwise it is
 *   marked `{F, shownPrice, markedAt: now}` and the gate blocks.
 * - Seen long enough: `L === F` passes; `L !== F` adopts `F` silently.
 * - A marked line adopts only when the mark is still the fresh version and the
 *   price has been on screen for `PRICE_SEEN_MS`: counted from the line's
 *   `shown.since` when it shows that price, else from `mark.markedAt`. A mark
 *   made 50 ms ago (by `trackPrices` or by the previous click) is not adopted.
 *   A newer version marks again and blocks.
 *
 * Marks and adoptions of lines that passed are only applied when nothing
 * blocks. A version is only ever taken from a server answer, never from the
 * snapshot.
 */
export function runPriceGate(
  state: PriceGateState,
  view: CartView,
  now: number,
): PriceGateResult {
  if (
    view.lines.some(
      (item) =>
        !item.confirmed ||
        !item.gateFresh ||
        item.details == null ||
        item.source !== "fresh",
    )
  ) {
    return { result: "needs-fresh", adopt: [], state };
  }

  const marks = new Map(state.marks);
  const clear: string[] = [];
  const adopt: PriceAdoption[] = [];
  let blocked = false;

  const block = (lineId: string, version: string, price: number) => {
    marks.set(lineId, { priceVersion: version, shownPrice: price, markedAt: now });
    blocked = true;
  };

  for (const item of view.lines) {
    const lineId = item.line.id;
    if (item.payWhatYouWant === "amount") {
      marks.delete(lineId);
      continue;
    }
    const current = freshVersion(item);
    if (current == null) {
      marks.delete(lineId);
      continue;
    }
    const details = item.details as CartLineDetails;
    const price = catalogUnitPrice(details);
    const seen = state.shown.get(lineId);
    const shownNow =
      seen != null && seen.price === price && seen.currency === details.currency
        ? seen
        : undefined;
    const mark = marks.get(lineId);

    let onScreenSince: number | undefined;
    if (mark != null) {
      if (mark.priceVersion !== current || mark.shownPrice !== price) {
        block(lineId, current, price);
        continue;
      }
      // A line that shows another price (or none) than the marked one has not
      // shown the marked price yet.
      onScreenSince = shownNow?.since ?? (seen == null ? mark.markedAt : undefined);
    } else {
      onScreenSince = shownNow?.since;
    }

    if (onScreenSince == null || now - onScreenSince < PRICE_SEEN_MS) {
      if (mark != null && onScreenSince != null) {
        // Same mark, still too fresh: keep `markedAt`, do not restart the clock.
        blocked = true;
      } else {
        block(lineId, current, price);
      }
      continue;
    }
    if (current !== item.line.priceVersion) {
      adopt.push({ lineId, priceVersion: current });
    }
    clear.push(lineId);
  }

  if (blocked) {
    return { result: "marked", adopt: [], state: { shown: state.shown, marks } };
  }
  for (const lineId of clear) {
    marks.delete(lineId);
  }
  return { result: "pass", adopt, state: { shown: state.shown, marks } };
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
