import { HOST } from "./constants";
import { getLocale, normalizeLocale } from "./locale";
import type { ProductPricing } from "./product.details.model";

/**
 * A small local copy of what `/products` last said about the products in the
 * cart (name, image, unit price, `priceVersion`), so the cart can be painted
 * before the network answers. It is never a source for a payment: `/buy`
 * carries no price and the server refuses a stale `priceVersion`.
 *
 * Hand-written validation on purpose (no zod, plan decision D3). No React, no
 * import of the cart provider: the storage, the project and the clock are
 * injected, so the module runs under plain `node --test`.
 */

export const CART_SNAPSHOT_KEY = "bitsnap-cart-view";
export const CART_SNAPSHOT_VERSION = 1;
export const CART_SNAPSHOT_MAX_ENTRIES = 100;
export const CART_SNAPSHOT_MAX_BYTES = 48 * 1024;
export const CART_SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const MAX_NAME_LENGTH = 200;
/** The server builds `priceVersion` from a JSON array of price parts (product.pricing.ts), so it can be long. */
const MAX_PRICE_VERSION_LENGTH = 1000;
/** A raw string longer than this is not parsed (a hostile or corrupt value). */
const MAX_RAW_LENGTH = 2 * CART_SNAPSHOT_MAX_BYTES;
/** Ids that would act on the prototype of a plain object keyed by product id. */
const UNSAFE_PRODUCT_IDS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_URL_LENGTH = 600;
const MAX_SHORT_LENGTH = 64;

/** Exactly what the cart reads about a line; the server details satisfy it. */
export type CartLineDetails = {
  id: string;
  name: string;
  /** For a variant line: the product name without the variant. */
  baseName?: string;
  variantName?: string;
  /** Unit price in minor units. */
  price: number;
  currency: string;
  pricing?: ProductPricing;
  image_url: string | null;
  /** Trimmed to the first image in the snapshot. */
  images?: string[];
  isDeliverable?: boolean;
  availableQuantity?: number;
  /** Needed by the pay-what-you-want rule of the view. */
  priceType?: string;
  /** Present for a recurring variant; only its presence is used. */
  recurring?: {
    billingPeriod: string;
    trialDays?: number;
    subscriptionSchedule?: number;
  };
};

export type CartSnapshotEntry = {
  /** Ms since epoch (client clock) when the server answered; capped at `now` on read. */
  at: number;
  details: CartLineDetails;
  /** Analytics: the catalog product id of the line. */
  catalogProductID?: string;
};

/** The entries of one locale, by product id (a variant id is a product id here). */
export type CartSnapshot = Readonly<Record<string, CartSnapshotEntry>>;

export type SnapshotStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type CartSnapshotEnv = {
  /** The page's project; without one nothing is read or written. */
  projectID: string | undefined;
  /** Defaults to the current API host. */
  host?: string;
  /** Defaults to `localStorage`; `null` means "no storage" (memory only). */
  storage?: SnapshotStorage | null;
  /** Defaults to `Date.now()`. */
  now?: number;
};

type SnapshotFile = {
  v: 1;
  projectID: string;
  host: string;
  entries: Record<string, CartSnapshotEntry>;
};

// ---------------------------------------------------------------- guards

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

/** `value` cut to `max` UTF-16 units without leaving half a surrogate pair. */
function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  const last = value.charCodeAt(max - 1);
  return value.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoundedString(
  value: unknown,
  max: number,
  { allowEmpty = false } = {},
): value is string {
  return (
    typeof value === "string" &&
    value.length <= max &&
    (allowEmpty || value.length > 0)
  );
}

/** `http(s)` only, no `data:` or `javascript:`, same rule as `cartItemURL`. */
function isImageURL(value: unknown): value is string {
  if (!isBoundedString(value, MAX_URL_LENGTH)) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const DISCOUNT_STATUSES = ["ACTIVE", "SCHEDULED", "EXPIRED", "DISABLED"];
const DISCOUNT_TYPES = ["FIXED", "PERCENTAGE"];

/**
 * A new pricing object from known fields, or `undefined` when anything is
 * wrong. A missing or malformed `referencePrice` (an older backend) reads as
 * "no price history", so the line keeps its sale price.
 */
function parsePricing(raw: unknown): ProductPricing | undefined {
  if (
    !isRecord(raw) ||
    !isFiniteNumber(raw.regularPrice) ||
    !isFiniteNumber(raw.effectivePrice) ||
    !isBoundedString(raw.currency, MAX_SHORT_LENGTH) ||
    !isBoundedString(raw.priceVersion, MAX_PRICE_VERSION_LENGTH)
  ) {
    return undefined;
  }
  const given = raw.referencePrice;
  const reference: Record<string, unknown> =
    isRecord(given) &&
    typeof given.historyAvailable === "boolean" &&
    (given.amount === undefined || isFiniteNumber(given.amount))
      ? given
      : {};
  const historyAvailable = reference.historyAvailable === true;
  if (
    raw.nextPriceChangeAt !== undefined &&
    !isFiniteNumber(raw.nextPriceChangeAt)
  ) {
    return undefined;
  }
  const pricing: ProductPricing = {
    regularPrice: raw.regularPrice,
    effectivePrice: raw.effectivePrice,
    currency: raw.currency,
    referencePrice: {
      windowDays: 30,
      asOf: isFiniteNumber(reference.asOf) ? reference.asOf : 0,
      basis: "observed-history",
      historyAvailable,
    },
    priceVersion: raw.priceVersion,
  };
  if (isFiniteNumber(reference.amount)) {
    pricing.referencePrice.amount = reference.amount;
  }
  if (raw.nextPriceChangeAt !== undefined) {
    pricing.nextPriceChangeAt = raw.nextPriceChangeAt;
  }
  if (raw.discount !== undefined) {
    const discount = raw.discount;
    if (
      !isRecord(discount) ||
      !isBoundedString(discount.id, MAX_NAME_LENGTH) ||
      !DISCOUNT_TYPES.includes(discount.type as string) ||
      !isFiniteNumber(discount.value) ||
      !DISCOUNT_STATUSES.includes(discount.status as string) ||
      (discount.startsAt !== undefined && !isFiniteNumber(discount.startsAt)) ||
      (discount.endsAt !== undefined && !isFiniteNumber(discount.endsAt))
    ) {
      return undefined;
    }
    pricing.discount = {
      id: discount.id,
      type: discount.type as "FIXED" | "PERCENTAGE",
      value: discount.value,
      status: discount.status as "ACTIVE" | "SCHEDULED" | "EXPIRED" | "DISABLED",
    };
    if (discount.startsAt !== undefined) {
      pricing.discount.startsAt = discount.startsAt as number;
    }
    if (discount.endsAt !== undefined) {
      pricing.discount.endsAt = discount.endsAt as number;
    }
  }
  return pricing;
}

/** A new details object from known fields, or `undefined` when anything is wrong. */
function parseDetails(raw: unknown): CartLineDetails | undefined {
  if (
    !isRecord(raw) ||
    !isBoundedString(raw.id, MAX_NAME_LENGTH) ||
    typeof raw.name !== "string" ||
    raw.name.length === 0 ||
    !isFiniteNumber(raw.price) ||
    raw.price < 0 ||
    !isBoundedString(raw.currency, MAX_SHORT_LENGTH)
  ) {
    return undefined;
  }
  const details: CartLineDetails = {
    id: raw.id,
    name: truncate(raw.name, MAX_NAME_LENGTH),
    price: raw.price,
    currency: raw.currency,
    image_url: null,
  };

  // A long name is cut, not a reason to lose the entry (and its price version).
  for (const key of ["baseName", "variantName"] as const) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== "string") {
        return undefined;
      }
      details[key] = truncate(raw[key] as string, MAX_NAME_LENGTH);
    }
  }

  // A relative or `data:` image is left out; the entry (and its price) stays.
  if (isImageURL(raw.image_url)) {
    details.image_url = raw.image_url;
  }
  if (Array.isArray(raw.images) && isImageURL(raw.images[0])) {
    details.images = [raw.images[0]];
  }

  if (raw.isDeliverable !== undefined) {
    if (typeof raw.isDeliverable !== "boolean") {
      return undefined;
    }
    details.isDeliverable = raw.isDeliverable;
  }
  if (raw.availableQuantity !== undefined) {
    if (!isFiniteNumber(raw.availableQuantity)) {
      return undefined;
    }
    details.availableQuantity = raw.availableQuantity;
  }
  if (raw.priceType !== undefined) {
    if (!isBoundedString(raw.priceType, MAX_SHORT_LENGTH)) {
      return undefined;
    }
    details.priceType = raw.priceType;
  }
  if (raw.recurring != null) {
    const recurring = raw.recurring;
    if (
      !isRecord(recurring) ||
      !isBoundedString(recurring.billingPeriod, MAX_SHORT_LENGTH) ||
      (recurring.trialDays !== undefined &&
        !isFiniteNumber(recurring.trialDays)) ||
      (recurring.subscriptionSchedule !== undefined &&
        !isFiniteNumber(recurring.subscriptionSchedule))
    ) {
      return undefined;
    }
    details.recurring = { billingPeriod: recurring.billingPeriod };
    if (recurring.trialDays !== undefined) {
      details.recurring.trialDays = recurring.trialDays as number;
    }
    if (recurring.subscriptionSchedule !== undefined) {
      details.recurring.subscriptionSchedule =
        recurring.subscriptionSchedule as number;
    }
  }
  // A bad pricing is left out (the gate never reads snapshot pricing).
  const pricing = parsePricing(raw.pricing);
  if (pricing != null) {
    details.pricing = pricing;
  }
  return details;
}

function parseEntry(raw: unknown): CartSnapshotEntry | undefined {
  if (!isRecord(raw) || !isFiniteNumber(raw.at) || raw.at < 0) {
    return undefined;
  }
  const details = parseDetails(raw.details);
  if (details == null) {
    return undefined;
  }
  const entry: CartSnapshotEntry = { at: raw.at, details };
  if (raw.catalogProductID !== undefined) {
    if (!isBoundedString(raw.catalogProductID, MAX_NAME_LENGTH)) {
      return undefined;
    }
    entry.catalogProductID = raw.catalogProductID;
  }
  return entry;
}

function emptyFile(env: ResolvedEnv): SnapshotFile {
  return {
    v: CART_SNAPSHOT_VERSION,
    projectID: env.projectID,
    host: env.host,
    entries: {},
  };
}

/**
 * Builds a new file from `raw` (anything). An invalid entry is dropped and the
 * rest stays; a wrong version or shape, or malformed JSON, gives `undefined`.
 */
export function parseSnapshotFile(raw: unknown): SnapshotFile | undefined {
  if (
    !isRecord(raw) ||
    raw.v !== CART_SNAPSHOT_VERSION ||
    typeof raw.projectID !== "string" ||
    typeof raw.host !== "string" ||
    !isRecord(raw.entries)
  ) {
    return undefined;
  }
  const entries: Record<string, CartSnapshotEntry> = {};
  for (const [key, value] of Object.entries(raw.entries)) {
    const separator = key.indexOf("|");
    if (
      separator <= 0 ||
      separator === key.length - 1 ||
      UNSAFE_PRODUCT_IDS.has(key.slice(separator + 1))
    ) {
      continue;
    }
    const entry = parseEntry(value);
    if (entry != null) {
      entries[key] = entry;
    }
  }
  return {
    v: CART_SNAPSHOT_VERSION,
    projectID: raw.projectID,
    host: raw.host,
    entries,
  };
}

// ------------------------------------------------------------- environment

type ResolvedEnv = {
  projectID: string;
  host: string;
  storage: SnapshotStorage | null;
  now: number;
};

function defaultStorage(): SnapshotStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function resolveEnv(env: CartSnapshotEnv): ResolvedEnv | undefined {
  // On the server the module state (`memoryFile`, `parseCache`) is shared by
  // every request: the snapshot is a browser-only cache, so reads and writes
  // are no-ops there.
  if (typeof window === "undefined") {
    return undefined;
  }
  if (env.projectID == null || env.projectID.length === 0) {
    return undefined;
  }
  return {
    projectID: env.projectID,
    host: env.host ?? HOST,
    storage: env.storage === undefined ? defaultStorage() : env.storage,
    now: env.now ?? Date.now(),
  };
}

// ------------------------------------------------------------------ state

/** Parsed file of the last raw string seen; dropped on a `storage` event. */
let parseCache: { raw: string | null; file: SnapshotFile | undefined } | undefined;
/** Entries kept in memory while the storage refuses writes (quota, blocked). */
let memoryFile: SnapshotFile | undefined;

let snapshotVersion = 0;
const listeners = new Set<() => void>();
let storageListenerAttached = false;

function notifySnapshotChanged(): void {
  snapshotVersion += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // a listener must not break a cart write
    }
  }
}

function handleSnapshotStorage(event: StorageEvent): void {
  // `sessionStorage` has its own events; only `localStorage` holds the snapshot.
  const area = event.storageArea;
  if (area != null && area !== defaultStorage()) {
    return;
  }
  if (event.key === CART_SNAPSHOT_KEY || event.key === null) {
    parseCache = undefined;
    // Another tab wrote (or cleared) the key: what it says wins over the
    // in-memory fallback this tab kept while its own writes failed.
    memoryFile = undefined;
    notifySnapshotChanged();
  }
}

/** For `useSyncExternalStore`: a `storage` event of another tab also notifies. */
export function subscribeToSnapshot(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageListenerAttached && typeof window !== "undefined") {
    window.addEventListener("storage", handleSnapshotStorage);
    storageListenerAttached = true;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && storageListenerAttached) {
      window.removeEventListener("storage", handleSnapshotStorage);
      storageListenerAttached = false;
    }
  };
}

/** Monotonic; grows on every snapshot write and on a `storage` event of the key. */
export function snapshotVersionSnapshot(): number {
  return snapshotVersion;
}

/** Forgets the in-memory fallback and the parse cache. Test aid. */
export function resetCartSnapshotState(): void {
  parseCache = undefined;
  memoryFile = undefined;
}

// --------------------------------------------------------------- read/write

function matchesEnv(file: SnapshotFile, env: ResolvedEnv): boolean {
  return file.projectID === env.projectID && file.host === env.host;
}

function readFile(env: ResolvedEnv): SnapshotFile | undefined {
  let file: SnapshotFile | undefined;
  if (memoryFile != null) {
    file = memoryFile;
  } else if (env.storage != null) {
    let raw: string | null = null;
    try {
      raw = env.storage.getItem(CART_SNAPSHOT_KEY);
    } catch {
      raw = null;
    }
    if (parseCache == null || parseCache.raw !== raw) {
      let parsed: SnapshotFile | undefined;
      if (raw != null && raw.length <= MAX_RAW_LENGTH) {
        try {
          parsed = parseSnapshotFile(JSON.parse(raw));
        } catch {
          parsed = undefined;
        }
      }
      parseCache = { raw, file: parsed };
    }
    file = parseCache.file;
  }
  return file != null && matchesEnv(file, env) ? file : undefined;
}

function splitKey(key: string): { locale: string; productID: string } {
  const separator = key.indexOf("|");
  return { locale: key.slice(0, separator), productID: key.slice(separator + 1) };
}

export function snapshotEntryKey(
  locale: string | undefined,
  productID: string,
): string {
  return `${normalizeLocale(locale) ?? getLocale()}|${productID}`;
}

/**
 * The entries of `locale` (`"en"` and `"en-US"` read the same ones), by
 * product id. An entry older than 30 days is left out; a future `at` reads as
 * `now`. Empty for another project or host, a wrong version or broken JSON.
 */
export function readSnapshot(
  locale: string | undefined,
  env: CartSnapshotEnv,
): CartSnapshot {
  const resolved = resolveEnv(env);
  if (resolved == null) {
    return {};
  }
  const file = readFile(resolved);
  if (file == null) {
    return {};
  }
  const wanted = normalizeLocale(locale) ?? getLocale();
  const result: Record<string, CartSnapshotEntry> = {};
  for (const [key, entry] of Object.entries(file.entries)) {
    const { locale: entryLocale, productID } = splitKey(key);
    if (entryLocale !== wanted || UNSAFE_PRODUCT_IDS.has(productID)) {
      continue;
    }
    const at = Math.min(entry.at, resolved.now);
    if (resolved.now - at > CART_SNAPSHOT_MAX_AGE_MS) {
      continue;
    }
    result[productID] = { ...entry, at };
  }
  return result;
}

/** One server answer to remember. */
export type SnapshotAnswer = {
  productID: string;
  details: CartLineDetails;
  catalogProductID?: string;
};

/**
 * Picks the fields the snapshot keeps from any resolved product details (the
 * server answer carries more: description, metadata, tax, variants, ...).
 */
export function toLineDetails(source: {
  id: string;
  name: string;
  baseName?: string;
  variantName?: string;
  price: number;
  currency: string;
  pricing?: ProductPricing;
  image_url?: string | null;
  images?: string[];
  isDeliverable?: boolean;
  availableQuantity?: number;
  priceType?: string;
  recurring?: CartLineDetails["recurring"];
}): CartLineDetails {
  const details: CartLineDetails = {
    id: source.id,
    name: source.name,
    price: source.price,
    currency: source.currency,
    image_url: source.image_url ?? null,
  };
  if (source.baseName !== undefined) details.baseName = source.baseName;
  if (source.variantName !== undefined) details.variantName = source.variantName;
  if (source.pricing !== undefined) details.pricing = source.pricing;
  if (source.images !== undefined) details.images = source.images;
  if (source.isDeliverable !== undefined) details.isDeliverable = source.isDeliverable;
  if (source.availableQuantity !== undefined) details.availableQuantity = source.availableQuantity;
  if (source.priceType !== undefined) details.priceType = source.priceType;
  if (source.recurring != null) details.recurring = source.recurring;
  return details;
}

function serialisedSize(file: SnapshotFile): number {
  return JSON.stringify(file).length;
}

/** Drops the oldest entries until the file fits the entry and size caps. */
function enforceLimits(file: SnapshotFile): void {
  const byAge = () =>
    Object.keys(file.entries).sort(
      (a, b) => file.entries[a]!.at - file.entries[b]!.at,
    );
  let keys = byAge();
  while (keys.length > CART_SNAPSHOT_MAX_ENTRIES) {
    delete file.entries[keys.shift()!];
  }
  while (keys.length > 0 && serialisedSize(file) > CART_SNAPSHOT_MAX_BYTES) {
    delete file.entries[keys.shift()!];
  }
}

/**
 * Writes server answers into the snapshot and prunes it. The one write path.
 *
 * - Every answer replaces whatever is stored under its key (a server answer
 *   always wins, there is no "newest `at`" merge).
 * - Answers for products not in `referencedProductIDs` are not written, and
 *   entries of unreferenced products and entries older than 30 days are removed.
 * - Never throws. When the storage refuses the write (quota, blocked) the
 *   snapshot key is removed so the cart's own keys keep the space, and the
 *   entries stay in memory for the session.
 *
 * Bumps the snapshot version and notifies the subscribers on every call that
 * reaches the write.
 */
export function writeSnapshot(
  locale: string | undefined,
  answers: readonly SnapshotAnswer[],
  referencedProductIDs: Iterable<string>,
  env: CartSnapshotEnv,
): void {
  try {
    const resolved = resolveEnv(env);
    if (resolved == null) {
      return;
    }
    const referenced = new Set(referencedProductIDs);
    const current = readFile(resolved);
    const file: SnapshotFile = current
      ? { ...current, entries: { ...current.entries } }
      : emptyFile(resolved);

    for (const [key, entry] of Object.entries(file.entries)) {
      const { productID } = splitKey(key);
      const at = Math.min(entry.at, resolved.now);
      if (
        !referenced.has(productID) ||
        resolved.now - at > CART_SNAPSHOT_MAX_AGE_MS
      ) {
        delete file.entries[key];
      } else if (at !== entry.at) {
        // A future-dated entry must not outlive fresh ones in the pruning order.
        file.entries[key] = { ...entry, at };
      }
    }

    const wanted = normalizeLocale(locale) ?? getLocale();
    for (const answer of answers) {
      if (
        !referenced.has(answer.productID) ||
        answer.productID.length === 0 ||
        UNSAFE_PRODUCT_IDS.has(answer.productID)
      ) {
        continue;
      }
      // Through the same parser as a read, so what is written is read back.
      const entry = parseEntry({
        at: resolved.now,
        details: answer.details,
        catalogProductID: answer.catalogProductID,
      });
      if (entry != null) {
        file.entries[`${wanted}|${answer.productID}`] = entry;
      }
    }

    enforceLimits(file);
    persist(file, resolved);
  } catch {
    // a cache must never break the cart
  }
}

function persist(file: SnapshotFile, env: ResolvedEnv): void {
  let raw: string | undefined;
  try {
    raw = JSON.stringify(file);
    if (env.storage == null) {
      throw new Error("no storage");
    }
    env.storage.setItem(CART_SNAPSHOT_KEY, raw);
    memoryFile = undefined;
    parseCache = { raw, file };
  } catch {
    try {
      env.storage?.removeItem(CART_SNAPSHOT_KEY);
    } catch {
      // nothing more to do
    }
    memoryFile = file;
    parseCache = undefined;
  }
  notifySnapshotChanged();
}

/**
 * True when the snapshot's price is known to be wrong: a scheduled discount
 * has started or ended (`pricing.nextPriceChangeAt`, Unix seconds) since the
 * entry was written. The line then shows no price until a server answer.
 */
export function isSnapshotPriceExpired(
  details: Pick<CartLineDetails, "pricing">,
  now: number,
): boolean {
  const next = details.pricing?.nextPriceChangeAt;
  return next != null && next * 1000 <= now;
}
