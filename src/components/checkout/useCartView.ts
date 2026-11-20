import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import {
  adoptPriceVersion,
  fetchCartProducts,
  rememberCartAnswer,
  getProjectID,
  localCartVersionSnapshot,
  readLocalCartLines,
  removeLocalCartLines,
  subscribeToLocalCart,
  type CartProductsAnswer,
  type LocalCartLine,
} from "./CartProvider";
import {
  CART_PRODUCTS_KEY,
  cartProductsKey,
  cartProductsQuery,
} from "./cart-queries";
import {
  readSnapshot,
  type CartLineDetails,
  type CartSnapshot,
} from "./cart-snapshot";
import {
  buildCartView,
  createCartViewStore,
  EMPTY_PRICE_GATE_STATE,
  PRICE_SEEN_MS,
  runPriceGate,
  trackPrices,
  type CartView,
  type CartViewFresh,
  type PriceGateResult,
  type PriceGateState,
} from "./cart-view";
import { getLocale, normalizeLocale } from "./locale";

/**
 * Paints the drawer from the local snapshot at once (plan part 1, slice 3).
 * `false` restores the network-only drawer: no snapshot is read, the lines wait
 * for `/products` as before 1.31.0. Kept for one release (rollback switch).
 */
export const INSTANT_CART = true;

/** A snapshot price older than this shows the "refreshing" state while a revalidation runs. */
const REFRESHING_AGE_MS = 60_000;

type Answered = {
  details: CartLineDetails;
  catalogProductID?: string;
  startedAt: number;
  noCache: boolean;
};

/**
 * What this drawer learned from the server since it opened (also from answers
 * the query cache already had). Reset when the project or the locale changes.
 */
type Session = {
  key: string;
  answers: Map<string, Answered>;
  /** Product ids the latest answer for them did not know, with its start time. */
  missing: Map<string, number>;
  merged: WeakSet<object>;
  gate: PriceGateState;
  /** The unit price a marked line showed before its price changed on screen. */
  was: Map<string, number>;
  /** After a `price-changed` answer only `no-cache` answers from then on feed the gate. */
  floor?: number;
  revalidateFailed: boolean;
};

function newSession(key: string): Session {
  return {
    key,
    answers: new Map(),
    missing: new Map(),
    merged: new WeakSet(),
    gate: EMPTY_PRICE_GATE_STATE,
    was: new Map(),
    revalidateFailed: false,
  };
}

/** The newest answer per product wins (by request start), so a slow older request cannot undo a newer one. */
function merge(session: Session, answer: CartProductsAnswer): void {
  if (session.merged.has(answer)) {
    return;
  }
  session.merged.add(answer);
  const known = new Map(answer.entries.map((entry) => [entry.productID, entry]));
  for (const productID of answer.requested) {
    const latest = Math.max(
      session.answers.get(productID)?.startedAt ?? -Infinity,
      session.missing.get(productID) ?? -Infinity,
    );
    if (answer.startedAt < latest) {
      continue;
    }
    const entry = known.get(productID);
    if (entry == null) {
      session.answers.delete(productID);
      session.missing.set(productID, answer.startedAt);
    } else {
      session.missing.delete(productID);
      session.answers.set(productID, {
        details: entry.details,
        ...(entry.catalogProductID != null
          ? { catalogProductID: entry.catalogProductID }
          : {}),
        startedAt: answer.startedAt,
        noCache: answer.noCache,
      });
    }
  }
}

/** The view already shows exactly the marks of `state`. */
function sameMarks(view: CartView, state: PriceGateState): boolean {
  return view.lines.every(
    (item) => item.marked === state.marks.has(item.line.id),
  );
}

/** An answer for `productIDs` built from this session, when every one is answered. */
function answerFromSession(
  session: Session,
  productIDs: readonly string[],
): CartProductsAnswer | undefined {
  if (productIDs.length === 0) {
    return undefined;
  }
  const entries: CartProductsAnswer["entries"] = [];
  let startedAt = Infinity;
  let noCache = true;
  for (const productID of productIDs) {
    const answer = session.answers.get(productID);
    if (answer == null) {
      return undefined;
    }
    entries.push({
      productID,
      details: answer.details,
      ...(answer.catalogProductID != null
        ? { catalogProductID: answer.catalogProductID }
        : {}),
    });
    startedAt = Math.min(startedAt, answer.startedAt);
    noCache &&= answer.noCache;
  }
  return { requested: [...productIDs], entries, startedAt, noCache };
}

function productIDsOf(lines: readonly LocalCartLine[]): string[] {
  return [...new Set(lines.map((line) => line.productID))].sort();
}

export type CartViewState = {
  /** The cart as shown, marks of the price gate included. */
  view: CartView;
  /** A revalidation request is running. */
  isFetching: boolean;
  /**
   * `productID:quantity` of every local line, sorted: what `/buy` and
   * `/payment-methods` would get (`readLocalCartSignature`).
   */
  localSignature: string;
  /** The unit price a marked line showed before its price changed on screen. */
  priceWas(lineId: string): number | undefined;
  /** The line shows a snapshot price older than 60 s while a revalidation runs. */
  isRefreshing(productID: string): boolean;
  /** The catalog product of a line whose product id is a variant (analytics). */
  catalogProductID(productID: string): string | undefined;
  /**
   * The price gate of "Next step" (D18). Awaits or starts a revalidation when
   * a line has no answer from after the drawer opened.
   * - `pass`: `/buy` may start; adopted versions are already written;
   * - `marked`: a price the buyer has not seen (long enough); wait for a click;
   * - `failed`: the server could not be asked; do not send `/buy`.
   */
  checkPrices(): Promise<"pass" | "marked" | "failed">;
  /**
   * After `/buy` answered `price-changed`: asks the server again bypassing the
   * HTTP cache and marks the changed lines (also writes silent adoptions).
   */
  recheckPrices(): Promise<"pass" | "marked" | "failed">;
  /** Asks the server again (the retry button). */
  retry(): void;
};

/**
 * The drawer's lines: local lines joined with the snapshot until the server
 * answers, then with the answer (part 1 §3.3). Renders at once from what is on
 * the device; the `/products` query only revalidates.
 */
export function useCartView(locale: string): CartViewState {
  const projectID = getProjectID() ?? "";
  const queryClient = useQueryClient();
  const store = React.useMemo(
    () =>
      createCartViewStore({
        subscribe: subscribeToLocalCart,
        version: localCartVersionSnapshot,
      }),
    [],
  );
  const version = React.useSyncExternalStore(
    store.subscribe,
    store.getVersion,
    () => 0,
  );
  const localLines = React.useMemo(() => readLocalCartLines(), [version]);
  const snapshot = React.useMemo<CartSnapshot>(
    () => (INSTANT_CART ? readSnapshot(locale, { projectID }) : {}),
    [version, locale, projectID],
  );
  const productIDs = React.useMemo(() => productIDsOf(localLines), [localLines]);
  const localSignature = React.useMemo(
    () =>
      localLines
        .map((line) => `${line.productID}:${line.quantity}`)
        .sort()
        .join(","),
    [localLines],
  );
  // The content mounts when the drawer opens.
  const [openedAt] = React.useState(() => Date.now());
  const [, rerender] = React.useReducer((n: number) => n + 1, 0);

  const sessionKey = `${projectID}|${normalizeLocale(locale) ?? getLocale()}`;
  const sessionRef = React.useRef<Session | null>(null);
  if (sessionRef.current?.key !== sessionKey) {
    sessionRef.current = newSession(sessionKey);
  }
  const session = sessionRef.current;

  /**
   * The server's answer goes into the session before the snapshot write
   * notifies, so a new price reaches the screen as a server answer (and gets
   * its "price updated" mark, N15), never as a snapshot price.
   */
  async function ask(noCache: boolean): Promise<CartProductsAnswer> {
    const answer = await fetchCartProducts(projectID, locale, {
      revalidate: noCache,
      writeSnapshot: false,
    });
    merge(session, answer);
    session.revalidateFailed = false;
    rememberCartAnswer(projectID, locale, answer);
    return answer;
  }

  const query = useQuery({
    ...cartProductsQuery(projectID, locale, productIDs),
    queryFn: () => ask(false),
    enabled: productIDs.length > 0 && projectID.length > 0,
    // A smaller set (remove) is already answered in this drawer: no request,
    // `staleTime` counts from the oldest of those answers.
    initialData: () => answerFromSession(session, productIDs),
    initialDataUpdatedAt: () =>
      answerFromSession(session, productIDs)?.startedAt,
  });
  if (query.data != null && !query.isPlaceholderData) {
    merge(session, query.data);
  }
  const failed = query.isError || session.revalidateFailed;

  function freshNow(): CartViewFresh {
    const details = new Map<string, CartLineDetails>();
    const confirmed = new Set<string>();
    const gateFresh = new Set<string>();
    for (const [productID, answer] of session.answers) {
      details.set(productID, answer.details);
      confirmed.add(productID);
      if (
        answer.startedAt >= openedAt &&
        (session.floor == null ||
          (answer.noCache && answer.startedAt >= session.floor))
      ) {
        gateFresh.add(productID);
      }
    }
    return { details, confirmed, gateFresh, failed };
  }

  function buildView(
    lines: readonly LocalCartLine[],
    snap: CartSnapshot,
    now: number,
  ): CartView {
    return buildCartView(
      lines.filter((line) => !session.missing.has(line.productID)),
      snap,
      freshNow(),
      now,
      session.gate.marks,
    );
  }

  /** The view from what is stored right now (event handlers). */
  function currentView(now: number): CartView {
    return buildView(
      readLocalCartLines(),
      INSTANT_CART ? readSnapshot(locale, { projectID }) : {},
      now,
    );
  }

  const now = Date.now();
  const view = buildView(localLines, snapshot, now);

  // Remember what each line showed once it is painted; a price that changes on
  // screen is marked at once (N15). After every commit of the open drawer, with
  // the view that was committed, never from a render that was thrown away.
  React.useLayoutEffect(() => {
    const before = session.gate;
    const tracked = trackPrices(before, view, Date.now());
    if (tracked !== before) {
      for (const [lineId, mark] of tracked.marks) {
        const previous = before.shown.get(lineId);
        if (
          before.marks.get(lineId) !== mark &&
          previous != null &&
          previous.price !== mark.shownPrice
        ) {
          session.was.set(lineId, previous.price);
        }
      }
      session.gate = tracked;
    }
    for (const lineId of [...session.was.keys()]) {
      if (!session.gate.marks.has(lineId)) {
        session.was.delete(lineId);
      }
    }
    if (!sameMarks(view, session.gate)) {
      rerender();
    }
  });

  async function revalidate(noCache: boolean): Promise<boolean> {
    const ids = productIDsOf(readLocalCartLines());
    if (ids.length === 0) {
      return true;
    }
    try {
      const answer = await ask(noCache);
      queryClient.setQueryData(
        cartProductsKey(projectID, locale, answer.requested),
        answer,
      );
      return true;
    } catch {
      session.revalidateFailed = true;
      rerender();
      return false;
    }
  }

  function allGateFresh(): boolean {
    const fresh = freshNow();
    return currentView(Date.now()).lines.every((item) =>
      fresh.gateFresh.has(item.line.productID),
    );
  }

  /** Awaits the open's request when it is running, else asks bypassing the HTTP cache. */
  async function freshenForGate(): Promise<boolean> {
    const lines = readLocalCartLines();
    const key = cartProductsKey(projectID, locale, productIDsOf(lines));
    if (
      session.floor == null &&
      queryClient.getQueryState(key)?.fetchStatus === "fetching"
    ) {
      try {
        const answer = await queryClient.fetchQuery({
          ...cartProductsQuery(projectID, locale, productIDsOf(lines)),
          queryFn: () => ask(false),
        });
        merge(session, answer);
      } catch {
        // asked again below
      }
      if (allGateFresh()) {
        return true;
      }
    }
    return revalidate(true);
  }

  /** Runs the gate on what is stored now; the caller commits `result.state`. */
  function runGate(): { result: PriceGateResult; prior: PriceGateState; view: CartView } {
    const prior = session.gate;
    const now = Date.now();
    const view = currentView(now);
    return { result: runPriceGate(prior, view, now), prior, view };
  }

  /**
   * Removes the lines an answer from after the open did not know, so `/buy`,
   * the badge and the wallets see what the drawer shows (1.30 only hid them).
   * Never on the snapshot or an answer from before the open; no analytics.
   */
  function dropUnknownLines(): void {
    const gone = new Set(
      [...session.missing].filter(([, at]) => at >= openedAt).map(([id]) => id),
    );
    if (
      gone.size > 0 &&
      readLocalCartLines().some((line) => gone.has(line.productID))
    ) {
      try {
        removeLocalCartLines([...gone].map((id) => ({ id, quantity: Infinity })));
      } catch {
        // still hidden from the view
      }
    }
  }
  React.useEffect(dropUnknownLines);

  // The wallets wait for an answer from after the open (`gateFresh`, D12): an
  // answer cached before it (an earlier open, the warm-up) is asked again once.
  const stale = view.lines.some((item) => item.confirmed && !item.gateFresh);
  React.useEffect(() => {
    if (stale && session.floor == null && !query.isFetching) {
      void query.refetch();
    }
  }, [productIDs.join()]);

  /**
   * A block only because the drawer opened less than `PRICE_SEEN_MS` ago, on
   * lines whose stored version is the server's (the price is the one added,
   * nothing changed on screen): how long to wait it out, else `undefined`.
   */
  function waitInsteadOfMark(
    prior: PriceGateState,
    result: PriceGateResult,
    view: CartView,
    now: number,
  ): number | undefined {
    if (prior.marks.size > 0 || result.state.marks.size === 0) {
      return undefined;
    }
    let wait = 0;
    for (const [lineId] of result.state.marks) {
      const item = view.lines.find((entry) => entry.line.id === lineId);
      const current = item?.details?.pricing?.priceVersion;
      if (
        item == null ||
        !current ||
        item.line.priceVersion !== current ||
        session.was.has(lineId)
      ) {
        return undefined;
      }
      const shown = prior.shown.get(lineId);
      wait = Math.max(
        wait,
        shown != null ? PRICE_SEEN_MS - (now - shown.since) : PRICE_SEEN_MS,
      );
    }
    return Math.min(Math.max(wait, 0), PRICE_SEEN_MS) + 50;
  }

  function applyAdoptions(result: PriceGateResult): boolean {
    try {
      for (const adoption of result.adopt) {
        adoptPriceVersion(adoption.lineId, adoption.priceVersion);
      }
      return true;
    } catch {
      return false;
    }
  }

  /** The gate, asking the server first when a line has no answer from after the open. */
  async function askGate(): Promise<ReturnType<typeof runGate> | undefined> {
    const run = runGate();
    if (run.result.result !== "needs-fresh") {
      return run;
    }
    return (await freshenForGate()) ? runGate() : undefined;
  }

  async function checkPrices(): Promise<"pass" | "marked" | "failed"> {
    let run = await askGate();
    // A block only for the seen time is waited out with nothing marked on
    // screen meanwhile: the marks of that run are not committed (m1).
    const wait =
      run?.result.result === "marked"
        ? waitInsteadOfMark(run.prior, run.result, run.view, Date.now())
        : undefined;
    if (wait != null) {
      await new Promise((resolve) => setTimeout(resolve, wait));
      // The cart may have changed meanwhile: ask again rather than fail (m2).
      run = await askGate();
    }
    const result = run?.result;
    if (result != null) {
      session.gate = result.state;
    }
    rerender();
    if (result?.result === "pass") {
      dropUnknownLines();
      return applyAdoptions(result) ? "pass" : "failed";
    }
    return result?.result === "marked" ? "marked" : "failed";
  }

  async function recheckPrices(): Promise<"pass" | "marked" | "failed"> {
    session.floor = Date.now();
    void queryClient.invalidateQueries({
      queryKey: [CART_PRODUCTS_KEY],
      refetchType: "none",
    });
    if (!(await revalidate(true))) {
      return "failed";
    }
    const { result } = runGate();
    session.gate = result.state;
    rerender();
    if (result.result === "pass") {
      return applyAdoptions(result) ? "pass" : "failed";
    }
    return result.result === "needs-fresh" ? "failed" : "marked";
  }

  const isFetching = query.isFetching;
  return {
    view,
    isFetching,
    localSignature,
    priceWas: (lineId) => session.was.get(lineId),
    isRefreshing: (productID) => {
      const entry = snapshot[productID];
      return (
        isFetching &&
        !session.answers.has(productID) &&
        entry != null &&
        now - entry.at > REFRESHING_AGE_MS
      );
    },
    catalogProductID: (productID) =>
      session.answers.get(productID)?.catalogProductID ??
      snapshot[productID]?.catalogProductID,
    checkPrices,
    recheckPrices,
    retry: () => {
      session.revalidateFailed = false;
      void query.refetch();
    },
  };
}
