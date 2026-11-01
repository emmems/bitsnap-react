import {
  clearExpressCartRecord,
  readExpressCartRecord,
  writeExpressCartRecord,
  type ExpressCartRecord,
  type ExpressStorage,
  type PendingExpressAttempt,
} from "./cart-record";
import type {
  CartEnvironment,
  CartLineConflict,
  CartSnapshot,
  CartWriteResult,
  ExpressCartUpload,
  ExpressResult,
  ProviderStart,
  RevolutPayStatus,
} from "./contracts";

/**
 * The durable cart of an express payment.
 *
 * Rules encoded here (they match the backend contract):
 * - the local cart is only a cache; the server snapshot is authoritative;
 * - an update always names the revision it saw, so a stale tab is refused
 *   instead of overwriting a newer cart;
 * - a rejected revision is reconciled and the *local* content is retried, so a
 *   buyer's newer lines are never replaced by an older server snapshot;
 * - the cart is kept on cancel, failure and page reload; only the lines of a
 *   server-confirmed purchase are removed, and products added meanwhile stay;
 * - after a purchase the record is dropped, because the paid cart is frozen:
 *   the next express attempt starts a new server cart from what is left.
 */

export type LocalCartLineId = { id: string; quantity: number };

/** The local (browser) cart, injected so this module stays free of React. */
export type ExpressCartLocal = {
  /** Current lines; `id` is the same id the cart upload takes. */
  lines(): LocalCartLineId[];
  /** Stable content signature used to notice an edit during a request. */
  signature(): string;
  /** The upload body, or `undefined` when the cart is empty. */
  upload(locale: string): ExpressCartUpload | undefined;
  /** Replaces the local lines with a canonical server snapshot. */
  adoptSnapshot(snapshot: CartSnapshot): void;
  /** Adds quantities to the local cart (lines added during a request). */
  appendLines(lines: LocalCartLineId[]): void;
  /** Removes the purchased quantities only. */
  removeLines(lines: LocalCartLineId[]): void;
  /**
   * Replaces the local lines with a merged set after a revision conflict.
   * Absent when the SDK does not own the cart (explicit `items`): a merge that
   * would change those lines is then reported as a visible conflict instead of
   * being written silently.
   */
  replaceLines?(lines: LocalCartLineId[]): void;
};

export type ExpressCartSessionOptions = {
  projectID: string;
  host: string;
  local: ExpressCartLocal;
  storage?: ExpressStorage;
  write: (
    upload: ExpressCartUpload,
    current?: {
      cartId: string;
      cartToken: string;
      expectedRevision: number;
    },
  ) => Promise<CartWriteResult>;
  read: (
    cartId: string,
    cartToken: string,
  ) => Promise<ExpressResult<CartSnapshot>>;
  now?: () => number;
  /** Attempts of one upload before giving up on a moving cart. */
  maxAttempts?: number;
};

const CART_ATTEMPTS = 3;

type EnsuredCart = {
  record: ExpressCartRecord;
  snapshot: CartSnapshot;
};

export class ExpressCartSession {
  private readonly options: ExpressCartSessionOptions;
  private running: Promise<unknown> = Promise.resolve();

  constructor(options: ExpressCartSessionOptions) {
    this.options = options;
  }

  getRecord(): ExpressCartRecord | undefined {
    return readExpressCartRecord(this.options);
  }

  /** The InPost basket key the widget should start with, when it is known. */
  getInpostBindingApiKey(): string | undefined {
    return this.getRecord()?.inpostBindingApiKey;
  }

  /** The upload the next `ensure` would send, without writing anything. */
  previewUpload(locale: string): ExpressCartUpload | undefined {
    return this.options.local.upload(locale);
  }

  getPendingAttempt(): PendingExpressAttempt | undefined {
    return this.getRecord()?.pending;
  }

  /**
   * Uploads the current local cart. Creates a cart when there is no usable
   * record; updates it with the stored revision otherwise. Reconciles stale
   * revisions and cart locks instead of losing edits.
   */
  ensure(args: {
    locale: string;
    environment?: CartEnvironment;
  }): Promise<ExpressResult<EnsuredCart>> {
    return this.serialize(() => this.ensureNow(args));
  }

  private async ensureNow(args: {
    locale: string;
    environment?: CartEnvironment;
  }): Promise<ExpressResult<EnsuredCart>> {
    let record = this.getRecord();
    if (
      record != null &&
      args.environment != null &&
      record.environment !== args.environment
    ) {
      // A test cart token must not drive a production checkout (or the other
      // way round): start a fresh cart in this environment.
      clearExpressCartRecord(this.options);
      record = undefined;
    }

    let lastFailure: Extract<CartWriteResult, { ok: false }> | undefined;
    const attempts = this.options.maxAttempts ?? CART_ATTEMPTS;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const upload = this.options.local.upload(args.locale);
      if (upload == null) {
        return {
          ok: false,
          code: "invalid-cart",
          message: "The cart is empty.",
        };
      }
      const signatureBefore = this.options.local.signature();
      const result = await this.options.write(
        upload,
        record != null
          ? {
              cartId: record.cartId,
              cartToken: record.cartToken,
              expectedRevision: record.revision,
            }
          : undefined,
      );

      if (result.ok) {
        const cartToken = result.cartToken ?? record?.cartToken;
        if (cartToken == null) {
          return {
            ok: false,
            code: "internal",
            message: "The created cart has no access token.",
          };
        }
        const snapshot = result.snapshot;
        record = {
          projectID: this.options.projectID,
          host: this.options.host,
          environment: snapshot.environment,
          cartId: snapshot.cartId,
          cartToken,
          revision: snapshot.revision,
          updatedAt: (this.options.now ?? Date.now)(),
          syncedLines: upload.items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
          })),
          ...(record?.inpostBindingApiKey != null
            ? { inpostBindingApiKey: record.inpostBindingApiKey }
            : {}),
        };
        writeExpressCartRecord(record, this.options.storage);
        const stillCurrent = this.options.local.signature() === signatureBefore;
        if (stillCurrent) {
          return { ok: true, value: { record, snapshot } };
        }
        // The buyer changed the cart while it was being uploaded: retry with
        // the new revision so those lines survive.
        continue;
      }

      lastFailure = result;
      switch (result.code) {
        case "revision-conflict": {
          const nextRevision =
            result.snapshot?.revision ?? result.currentRevision;
          if (record == null || nextRevision == null) {
            return result;
          }
          // A real three-way merge: the local cart is compared against what the
          // server last confirmed (`syncedLines`). Disjoint edits are combined;
          // a line both sides changed differently is never last-write-wins.
          const merged = mergeRevisionConflict({
            base: record.syncedLines,
            local: this.options.local.lines(),
            server: snapshotLinesToLocal(result.snapshot?.lines),
          });
          if (!merged.ok) {
            return {
              ...result,
              currentRevision: nextRevision,
              snapshot: result.snapshot,
              conflicts: merged.conflicts,
            };
          }
          if (!sameLines(merged.lines, this.options.local.lines())) {
            if (this.options.local.replaceLines == null) {
              // Explicit merchant cart: the SDK cannot adopt server changes, so
              // it asks the buyer instead of overwriting either side.
              return {
                ...result,
                currentRevision: nextRevision,
                snapshot: result.snapshot,
                conflicts: merged.conflicts,
              };
            }
            this.options.local.replaceLines(merged.lines);
          }
          record = { ...record, revision: nextRevision };
          if (result.snapshot?.environment != null) {
            record.environment = result.snapshot.environment;
          }
          if (result.snapshot != null) {
            // Keep the baseline in step with the revision we are about to
            // write; the successful write below replaces it with the upload.
            record.syncedLines = snapshotLinesToLocal(result.snapshot.lines);
          }
          writeExpressCartRecord(record, this.options.storage);
          // Retry with the merged content and the newer revision.
          continue;
        }
        case "cart-locked": {
          // The stored cart became an order. What is left in the local cart is
          // a new purchase, so it gets a new cart; nothing is overwritten.
          clearExpressCartRecord(this.options);
          record = undefined;
          continue;
        }
        case "cart-not-found":
        case "cart-forbidden": {
          clearExpressCartRecord(this.options);
          record = undefined;
          continue;
        }
        case "invalid-request":
        case "product-not-available":
        case "currency-unsupported": {
          return result;
        }
        default: {
          return result;
        }
      }
    }

    return (
      lastFailure ?? {
        ok: false,
        code: "internal",
        message: "The cart could not be saved.",
      }
    );
  }

  /**
   * Reads the canonical snapshot and adopts it into the local cart (what the
   * InPost app changed must be what the browser shows). Lines added while the
   * request was in flight are kept and uploaded again.
   */
  reconcileFromServer(): Promise<ExpressResult<CartSnapshot>> {
    return this.serialize(async () => {
      const record = this.getRecord();
      if (record == null) {
        return {
          ok: false,
          code: "cart-not-found" as const,
          message: "There is no cart to read.",
        };
      }
      const before = countLines(this.options.local.lines());
      const result = await this.options.read(
        record.cartId,
        record.cartToken,
      );      if (!result.ok) {
        if (
          result.code === "cart-not-found" ||
          result.code === "cart-forbidden"
        ) {
          clearExpressCartRecord(this.options);
        }
        return result;
      }
      const snapshot = result.value;
      const after = countLines(this.options.local.lines());
      // The server last confirmed `syncedLines`; without it (older record) the
      // local cart right before this read was in sync.
      const synced = countLines(record.syncedLines ?? []);
      const baseline = record.syncedLines != null ? synced : before;
      this.options.local.adoptSnapshot(snapshot);
      // Keep what the buyer added after the server last confirmed the cart;
      // everything the provider changed stays as the provider set it.
      const added = additionsBeyond(after, baseline);
      if (added.length > 0) {
        this.options.local.appendLines(added);
      }
      const current = this.getRecord();
      if (current != null && current.cartId === snapshot.cartId) {
        writeExpressCartRecord(
          {
            ...current,
            revision: snapshot.revision,
            environment: snapshot.environment,
            updatedAt: (this.options.now ?? Date.now)(),
          },
          this.options.storage,
        );
      }
      if (added.length > 0) {
        const reuploaded = await this.ensureNow({
          locale: snapshot.locale,
          environment: snapshot.environment,
        });
        if (!reuploaded.ok) {
          return {
            ok: false,
            code: reuploaded.code,
            message: reuploaded.message,
            ...(reuploaded.status != null ? { status: reuploaded.status } : {}),
            ...(reuploaded.currentRevision != null
              ? { currentRevision: reuploaded.currentRevision }
              : {}),
            ...(reuploaded.snapshot != null
              ? { snapshot: reuploaded.snapshot }
              : {}),
            ...(reuploaded.conflicts != null
              ? { conflicts: reuploaded.conflicts }
              : {}),
          };
        }
      }
      return { ok: true, value: snapshot };
    });
  }

  /** Binds the cart to a provider. The cart is uploaded and reconciled first. */
  async start(
    provider: "inpostPay" | "revolutPay",
    args: {
      locale: string;
      environment?: CartEnvironment;
      returnUrl?: string;
      cancelUrl?: string;
      embedOrigin?: string;
      start: (request: {
        cartId: string;
        cartToken: string;
        returnUrl?: string;
        cancelUrl?: string;
        embedOrigin?: string;
      }) => Promise<ExpressResult<ProviderStart>>;
    },
  ): Promise<ExpressResult<{ start: ProviderStart; snapshot: CartSnapshot }>> {
    const ensured = await this.ensure({
      locale: args.locale,
      ...(args.environment != null ? { environment: args.environment } : {}),
    });
    if (!ensured.ok) {
      return ensured;
    }
    const { record, snapshot } = ensured.value;
    const started = await args.start({
      cartId: record.cartId,
      cartToken: record.cartToken,
      ...(args.returnUrl != null ? { returnUrl: args.returnUrl } : {}),
      ...(args.cancelUrl != null ? { cancelUrl: args.cancelUrl } : {}),
      ...(args.embedOrigin != null ? { embedOrigin: args.embedOrigin } : {}),
    });
    if (!started.ok) {
      if (
        started.code === "cart-locked" ||
        started.code === "cart-not-found" ||
        started.code === "cart-forbidden"
      ) {
        // The stored cart belongs to another purchase now.
        clearExpressCartRecord(this.options);
      }
      return started;
    }

    const current = this.getRecord();
    if (current != null && current.cartId === record.cartId) {
      writeExpressCartRecord(
        {
          ...current,
          revision: Math.max(current.revision, started.value.cartRevision),
          updatedAt: (this.options.now ?? Date.now)(),
          ...(started.value.publicConfig?.basketBindingApiKey != null
            ? {
                inpostBindingApiKey:
                  started.value.publicConfig.basketBindingApiKey,
              }
            : {}),
          pending: {
            provider,
            ...(started.value.providerOrderId.length > 0
              ? { providerOrderId: started.value.providerOrderId }
              : {}),
            lines: snapshot.lines.map((line) => ({
              id: line.productId,
              quantity: line.quantity,
            })),
            ts: (this.options.now ?? Date.now)(),
          },
        },
        this.options.storage,
      );
    }
    return { ok: true, value: { start: started.value, snapshot } };
  }

  /** Stores the InPost basket key so a remounted widget starts already bound. */
  storeInpostBindingApiKey(basketBindingApiKey: string): void {
    const record = this.getRecord();
    if (record == null || basketBindingApiKey.length === 0) {
      return;
    }
    writeExpressCartRecord(
      {
        ...record,
        inpostBindingApiKey: basketBindingApiKey,
        updatedAt: (this.options.now ?? Date.now)(),
      },
      this.options.storage,
    );
  }

  /**
   * Removes only the purchased lines and forgets the (now frozen) cart record,
   * so a later express attempt starts a new cart from the remaining products.
   */
  completePurchase(lines?: LocalCartLineId[]): void {
    const record = this.getRecord();
    const purchased = lines ?? record?.pending?.lines ?? [];
    if (purchased.length > 0) {
      this.options.local.removeLines(purchased);
    }
    clearExpressCartRecord(this.options);
  }

  /** Cancel or failure: the cart and its record stay exactly as they are. */
  keepCart(): void {
    // Intentionally empty: kept for call sites that speak in intentions.
  }

  /** Forgets the provider attempt but keeps the cart authorization. */
  clearPending(): void {
    const record = this.getRecord();
    if (record == null || record.pending == null) {
      return;
    }
    const { pending: _pending, ...rest } = record;
    writeExpressCartRecord(rest, this.options.storage);
  }

  status(
    fetchStatus: (
      cartId: string,
      cartToken: string,
    ) => Promise<RevolutPayStatus>,
  ): Promise<RevolutPayStatus> {
    const record = this.getRecord();
    if (record == null) {
      return Promise.resolve({
        ok: false,
        code: "cart-not-found",
        message: "There is no cart to check.",
      });
    }
    return fetchStatus(record.cartId, record.cartToken);
  }

  /** Runs cart work one at a time: two clicks never race the same revision. */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.running.then(task, task);
    this.running = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

function countLines(lines: LocalCartLineId[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    counts.set(line.id, (counts.get(line.id) ?? 0) + line.quantity);
  }
  return counts;
}

function snapshotLinesToLocal(
  lines: CartSnapshot["lines"] | undefined,
): LocalCartLineId[] {
  return (lines ?? []).map((line) => ({
    id: line.productId,
    quantity: line.quantity,
  }));
}

function sameLines(a: LocalCartLineId[], b: LocalCartLineId[]): boolean {
  const left = countLines(a);
  const right = countLines(b);
  if (left.size !== right.size) {
    return false;
  }
  for (const [id, quantity] of left) {
    if (right.get(id) !== quantity) {
      return false;
    }
  }
  return true;
}

type MergeResult =
  | { ok: true; lines: LocalCartLineId[]; conflicts: CartLineConflict[] }
  | { ok: false; lines: LocalCartLineId[]; conflicts: CartLineConflict[] };

/**
 * Three-way merge of the browser cart against the last server-confirmed lines
 * and the current canonical snapshot.
 *
 * - only the browser changed a line → the browser value;
 * - only the server changed a line → the server value;
 * - both changed it to the same quantity → that quantity;
 * - both changed it to different quantities → a conflict, never a silent
 *   last-write-wins;
 * - a line absent on one side is quantity 0, so removals merge like edits.
 *
 * Without `syncedLines` there is no safe baseline (an older record): the caller
 * gets a visible conflict instead of overwriting the newer server cart.
 */
function mergeRevisionConflict(args: {
  base: LocalCartLineId[] | undefined;
  local: LocalCartLineId[];
  server: LocalCartLineId[] | undefined;
}): MergeResult {
  if (args.base == null || args.server == null) {
    return {
      ok: false,
      lines: args.local,
      conflicts: [],
    };
  }
  const base = countLines(args.base);
  const local = countLines(args.local);
  const server = countLines(args.server);
  const ids = new Set<string>([...base.keys(), ...local.keys(), ...server.keys()]);
  const merged: LocalCartLineId[] = [];
  const conflicts: CartLineConflict[] = [];
  for (const id of ids) {
    const b = base.get(id) ?? 0;
    const l = local.get(id) ?? 0;
    const s = server.get(id) ?? 0;
    const localChanged = l !== b;
    const serverChanged = s !== b;
    let quantity: number;
    if (!localChanged) {
      quantity = s;
    } else if (!serverChanged) {
      quantity = l;
    } else if (l === s) {
      quantity = l;
    } else {
      conflicts.push({ id, base: b, local: l, server: s });
      quantity = l;
    }
    if (quantity > 0 && !conflicts.some((conflict) => conflict.id === id)) {
      merged.push({ id, quantity });
    }
  }
  return { ok: conflicts.length === 0, lines: merged, conflicts };
}

function additionsBeyond(
  after: Map<string, number>,
  baseline: Map<string, number>,
): LocalCartLineId[] {
  const added: LocalCartLineId[] = [];
  for (const [id, quantity] of after) {
    const extra = quantity - (baseline.get(id) ?? 0);
    if (extra > 0) {
      added.push({ id, quantity: extra });
    }
  }
  return added;
}
