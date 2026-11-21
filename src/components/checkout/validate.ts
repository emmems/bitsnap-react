/**
 * Small hand-written validators for the data the cart reads from places it
 * does not control: `localStorage`, the `/countries` answer, and the payloads
 * of `window.cart.buyProduct` and the `ADD_TO_CART` message. They replace the
 * zod schemas the cart used (PLAN D3), so `zod` is not in the cart's bundle
 * (`bitsnap-react/cart`), which saves about 50 KB gzip.
 *
 * The rules are zod 4's, on purpose: an object is any non-null, non-array
 * object; unknown keys are dropped from the result; a number is finite (no
 * `NaN`, no `Infinity`); a `Record` is a plain object; an optional key may be
 * missing or `undefined`, and a missing key stays missing in the result.
 * `validate.test.ts` runs these validators and the zod schemas they replaced
 * side by side on the same inputs.
 *
 * Each validator throws `InvalidInputError` with a message that names the
 * field (`"buyProduct.productID: expected a string"`). Callers catch it where
 * they caught a `ZodError`.
 */

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

type Obj = Record<string, unknown>;

const fail = (path: string, expected: string): never => {
  throw new InvalidInputError(`${path}: expected ${expected}`);
};

const isObject = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** zod's check: constructor-based, so an object from another frame still counts. */
const isPlainObject = (value: unknown): value is Obj => {
  if (!isObject(value)) return false;
  const constructor = (value as { constructor?: { prototype?: unknown } }).constructor;
  if (constructor === undefined) return true;
  const prototype = constructor.prototype;
  return isObject(prototype) && Object.prototype.hasOwnProperty.call(prototype, "isPrototypeOf");
};

const object = (value: unknown, path: string): Obj =>
  isObject(value) ? value : fail(path, "an object");

const string = (value: unknown, path: string): string =>
  typeof value === "string" ? value : fail(path, "a string");

const boolean = (value: unknown, path: string): boolean =>
  typeof value === "boolean" ? value : fail(path, "a boolean");

const number = (value: unknown, path: string): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fail(path, "a number");

const nonNegativeInteger = (value: unknown, path: string): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : fail(path, "a non-negative integer");

/** Every index is read, holes included (`Array.prototype.map` skips them; zod does not). */
function readArray<T>(value: unknown, path: string, read: (item: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) return fail(path, "an array");
  const out: T[] = [];
  for (let index = 0; index < value.length; index++) out.push(read(value[index], `${path}[${index}]`));
  return out;
}

/** An own property that may be missing or `undefined`; anything else goes through `read`. */
function optional<T>(
  source: Obj,
  key: string,
  read: (value: unknown, path: string) => T,
  path: string,
  into: Obj,
): void {
  if (!(key in source)) return;
  const value = source[key];
  into[key] = value === undefined ? undefined : read(value, `${path}.${key}`);
}

/** `Record<string, string | undefined>` (`metadata`): a plain object whose values are strings. */
function metadataRecord(value: unknown, path: string): Record<string, string | undefined> {
  if (!isPlainObject(value)) return fail(path, "an object of strings");
  const out: Record<string, string | undefined> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return fail(path, "an object with string keys");
    // zod drops a `__proto__` key; assigning it would only set the prototype.
    if (key === "__proto__") continue;
    const item = value[key];
    out[key] = item === undefined ? undefined : string(item, `${path}.${key}`);
  }
  return out;
}

// --------------------------------------------------------------- buyProduct

export type BuyProductArgs = {
  productID: string;
  email?: string | undefined;
  name?: string | undefined;
  country?: string | undefined;
  marketingAgreement?: boolean | undefined;
  locale?: string | undefined;
};

/** The argument of `window.cart.buyProduct`. */
export function parseBuyProductArgs(args: unknown): BuyProductArgs {
  const path = "buyProduct";
  const source = object(args, path);
  const out: Obj = { productID: string(source.productID, `${path}.productID`) };
  optional(source, "email", string, path, out);
  optional(source, "name", string, path, out);
  optional(source, "country", string, path, out);
  optional(source, "marketingAgreement", boolean, path, out);
  optional(source, "locale", string, path, out);
  return out as BuyProductArgs;
}

// --------------------------------------------------------------- add to cart

export type AddToCartEvent = {
  id: string;
  isSubscription: boolean;
  quantity: number;
  metadata?: Record<string, string | undefined> | undefined;
  url?: string | undefined;
};

/** The payload of the `ADD_TO_CART` message. `isSubscription` defaults to `false`. */
export function parseAddToCartPayload(payload: unknown): AddToCartEvent {
  const path = "addToCart";
  const source = object(payload, path);
  const out: Obj = {
    id: string(source.id, `${path}.id`),
    isSubscription:
      source.isSubscription === undefined ? false : boolean(source.isSubscription, `${path}.isSubscription`),
    quantity: number(source.quantity, `${path}.quantity`),
  };
  optional(source, "metadata", metadataRecord, path, out);
  optional(source, "url", string, path, out);
  return out as AddToCartEvent;
}

// ---------------------------------------------------------------- countries

export type CountryOption = { name: string; code: string };

/** The `/countries` answer: a list of `{ name, code }`. */
export function parseCountryList(value: unknown): CountryOption[] {
  return readArray(value, "countries", (item, path) => {
    const source = object(item, path);
    return {
      name: string(source.name, `${path}.name`),
      code: string(source.code, `${path}.code`),
    };
  });
}

// ------------------------------------------------------------ stored checkout

export type GooglePayConfig = {
  isAvailable: boolean;
  merchantId: string;
  merchantName: string;
  gateway: string;
  gatewayId: string;
  checkedAt?: number | undefined;
  checkedFor?: string | undefined;
};

export type CheckoutProduct = {
  id: string;
  productID: string;
  quantity: number;
  priceVersion?: string | undefined;
  amount?: number | undefined;
  metadata?: Record<string, string | undefined> | undefined;
  url?: string | undefined;
};

export type Checkout = {
  country?: string | undefined;
  couponCode?: string | undefined;
  selectedDeliveryMethod?: string | undefined;
  postalCode?: string | undefined;
  email?: string | undefined;
  products?: CheckoutProduct[] | undefined;
  googlePayConfig?: GooglePayConfig | undefined;
};

function storedProduct(value: unknown, path: string): CheckoutProduct {
  const source = object(value, path);
  const out: Obj = {
    id: string(source.id, `${path}.id`),
    productID: string(source.productID, `${path}.productID`),
    quantity: number(source.quantity, `${path}.quantity`),
  };
  optional(source, "priceVersion", string, path, out);
  optional(source, "amount", nonNegativeInteger, path, out);
  optional(source, "metadata", metadataRecord, path, out);
  optional(source, "url", string, path, out);
  return out as CheckoutProduct;
}

function storedGooglePayConfig(value: unknown, path: string): GooglePayConfig {
  const source = object(value, path);
  const out: Obj = {
    isAvailable: boolean(source.isAvailable, `${path}.isAvailable`),
    merchantId: string(source.merchantId, `${path}.merchantId`),
    merchantName: string(source.merchantName, `${path}.merchantName`),
    gateway: string(source.gateway, `${path}.gateway`),
    gatewayId: string(source.gatewayId, `${path}.gatewayId`),
  };
  // A bad stamp only expires a negative answer; it never breaks the cart.
  for (const [key, read] of [["checkedAt", number], ["checkedFor", string]] as const) {
    if (!(key in source)) continue;
    try {
      const stamp = source[key];
      out[key] = stamp === undefined ? undefined : read(stamp, `${path}.${key}`);
    } catch {
      out[key] = undefined;
    }
  }
  return out as GooglePayConfig;
}

/**
 * What the cart keeps in `localStorage` under `checkout`. A bad value throws
 * (the caller falls back to an empty cart); unknown keys are dropped.
 */
export function parseStoredCheckout(value: unknown): Checkout {
  const path = "checkout";
  const source = object(value, path);
  const out: Obj = {};
  optional(source, "country", string, path, out);
  optional(source, "couponCode", string, path, out);
  optional(source, "selectedDeliveryMethod", string, path, out);
  optional(source, "postalCode", string, path, out);
  optional(source, "email", string, path, out);
  optional(
    source,
    "products",
    (items, itemsPath) => readArray(items, itemsPath, storedProduct),
    path,
    out,
  );
  optional(source, "googlePayConfig", storedGooglePayConfig, path, out);
  return out as Checkout;
}
