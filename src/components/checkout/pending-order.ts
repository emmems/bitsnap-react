/**
 * The cart is cleared once the payment is confirmed, not when the buyer is
 * sent to the payment page: a buyer who comes back from the gateway unpaid
 * still has the cart. Before redirecting we remember which order was created;
 * `reconcilePendingOrder` later asks the backend for its status.
 */

export const PENDING_ORDER_KEY = "bitsnap-pending-order";
/** A pending order older than this is forgotten without asking the backend. */
export const PENDING_ORDER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** A cart line as it was when the buyer left: the line id and how many were ordered. */
export type PendingOrderLine = { id: string; quantity: number };

export type PendingOrder = {
  orderId: string;
  /** The project id of the order, as the payment page URL / `/buy` response gives it. */
  projectId: string;
  /** The project id of the cart the order was made from (the page's project). */
  cartProjectId?: string;
  /** The cart lines the order was made of; only these are removed once it is paid. */
  lines: PendingOrderLine[];
  /** When the buyer was sent to the payment page (ms since epoch). */
  ts: number;
};

/** The cart without the lines (and quantities) of a paid order; lines added afterwards stay. */
export function subtractOrderLines<T extends { id: string; quantity: number }>(
  cart: T[],
  lines: PendingOrderLine[],
): T[] {
  const ordered = new Map<string, number>();
  for (const line of lines) {
    ordered.set(line.id, (ordered.get(line.id) ?? 0) + line.quantity);
  }
  const rest: T[] = [];
  for (const item of cart) {
    const quantity = ordered.get(item.id);
    if (quantity == null) {
      rest.push(item);
    } else if (item.quantity > quantity) {
      rest.push({ ...item, quantity: item.quantity - quantity });
    }
  }
  return rest;
}

/** `unknown` is an order the backend does not know (yet) or a status we do not recognise. */
export type OrderStatus = "created" | "paid" | "canceled" | "unknown";

export type PendingOrderOutcome =
  /** Nothing was pending. */
  | "none"
  /** Paid: its cart lines were removed and the order forgotten. */
  | "paid"
  /** Canceled: the order was forgotten, the cart stays. */
  | "canceled"
  /** Older than 24 hours: the order was forgotten, the cart stays. */
  | "expired"
  /** Not paid yet or the backend could not be asked: kept for the next time. */
  | "pending";

export type PendingOrderStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

/** The backend is asked about the same pending order at most this often. */
export const PENDING_ORDER_MIN_ASK_INTERVAL_MS = 60 * 1000;

/**
 * Wraps `fetchStatus` so the same order is asked about at most once per
 * `minIntervalMs`; in between it rejects, which `reconcilePendingOrder` treats
 * as "keep it for the next time". A new order is asked about right away.
 */
export function throttleOrderStatus(
  fetchStatus: (order: PendingOrder) => Promise<OrderStatus>,
  now: () => number = Date.now,
  minIntervalMs: number = PENDING_ORDER_MIN_ASK_INTERVAL_MS,
): (order: PendingOrder) => Promise<OrderStatus> {
  let last: { key: string; at: number } | undefined;
  return (order) => {
    const key = `${order.orderId}:${order.ts}`;
    const at = now();
    if (last?.key === key && at - last.at < minIntervalMs) {
      return Promise.reject(new Error("pending order was asked about recently"));
    }
    last = { key, at };
    return fetchStatus(order);
  };
}

/** `/payment/common/<projectId>/<orderId>` of the payment page the /buy response points to. */
export function parseOrderFromPaymentUrl(
  url: string | undefined,
): { orderId: string; projectId: string } | undefined {
  if (url == null || url.length === 0) {
    return undefined;
  }
  try {
    const path = new URL(url, "https://bitsnap.invalid").pathname;
    const match = /\/payment\/common\/([^/]+)\/([^/]+)\/?$/.exec(path);
    if (match == null) {
      return undefined;
    }
    return {
      projectId: decodeURIComponent(match[1]),
      orderId: decodeURIComponent(match[2]),
    };
  } catch {
    return undefined;
  }
}

/**
 * `/payment/manualPayment/<projectId>/<orderId>`: the page with the transfer /
 * BLIK details of an order the buyer chose to pay by hand. The order is placed
 * there and paid outside of Bitsnap, often days later.
 */
export function isManualPaymentUrl(url: string | undefined): boolean {
  if (url == null || url.length === 0) {
    return false;
  }
  try {
    const path = new URL(url, "https://bitsnap.invalid").pathname;
    return /\/payment\/manualPayment\/[^/]+\/[^/]+\/?$/.test(path);
  } catch {
    return false;
  }
}

/**
 * The order to wait for after redirecting to `response.url`: the ids of the
 * /buy response, else the ones in the payment page URL. `undefined` when
 * neither tells which order it is, and for a manual payment page: that order
 * is already placed (the buyer only transfers the money), so the cart is
 * cleared right away instead of being kept for a day and offered again.
 */
export function resolvePendingOrder(
  response: { url: string; orderId?: string; projectId?: string },
  now: number = Date.now(),
  cart: { cartProjectId?: string; lines?: PendingOrderLine[] } = {},
): PendingOrder | undefined {
  if (isManualPaymentUrl(response.url)) {
    return undefined;
  }
  const fromUrl = parseOrderFromPaymentUrl(response.url);
  const orderId = nonEmpty(response.orderId) ?? fromUrl?.orderId;
  const projectId = nonEmpty(response.projectId) ?? fromUrl?.projectId;
  if (orderId == null || projectId == null) {
    return undefined;
  }
  return {
    orderId,
    projectId,
    ...(cart.cartProjectId != null ? { cartProjectId: cart.cartProjectId } : {}),
    lines: cart.lines ?? [],
    ts: now,
  };
}

/**
 * Remembers the order of a payment page the buyer is about to be sent to.
 * `false` when it cannot tell which order it is (or cannot store it): the
 * caller then keeps clearing the cart on its own.
 */
export function rememberPendingOrder(
  response: { url: string; orderId?: string; projectId?: string },
  options: {
    storage?: PendingOrderStorage;
    cartProjectId?: string;
    lines?: PendingOrderLine[];
    now?: number;
  } = {},
): boolean {
  const order = resolvePendingOrder(response, options.now, options);
  return order != null && savePendingOrder(order, options.storage);
}

function nonEmpty(value: string | undefined): string | undefined {
  return value != null && value.length > 0 ? value : undefined;
}

function defaultStorage(): PendingOrderStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function savePendingOrder(
  order: PendingOrder,
  storage: PendingOrderStorage | undefined = defaultStorage(),
): boolean {
  try {
    storage?.setItem(PENDING_ORDER_KEY, JSON.stringify(order));
    return storage != null;
  } catch {
    return false;
  }
}

export function readPendingOrder(
  storage: PendingOrderStorage | undefined = defaultStorage(),
): PendingOrder | undefined {
  try {
    const raw = storage?.getItem(PENDING_ORDER_KEY);
    if (raw == null) {
      return undefined;
    }
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value != null &&
      typeof (value as PendingOrder).orderId === "string" &&
      typeof (value as PendingOrder).projectId === "string" &&
      typeof (value as PendingOrder).ts === "number" &&
      (value as PendingOrder).orderId.length > 0
    ) {
      const { orderId, projectId, cartProjectId, ts, lines } = value as PendingOrder;
      return {
        orderId,
        projectId,
        ...(typeof cartProjectId === "string" ? { cartProjectId } : {}),
        lines: Array.isArray(lines)
          ? lines.filter(
              (line) =>
                typeof line?.id === "string" && typeof line.quantity === "number",
            )
          : [],
        ts,
      };
    }
  } catch {
    // a broken value is dropped below
  }
  clearPendingOrder(storage);
  return undefined;
}

export function clearPendingOrder(
  storage: PendingOrderStorage | undefined = defaultStorage(),
) {
  try {
    storage?.removeItem(PENDING_ORDER_KEY);
  } catch {
    // storage is not available
  }
}

/** Status text of the `getOrder` answer (`details.status`), `unknown` when missing. */
export function orderStatusFromResponse(response: {
  details?: { status?: string; $unknown?: unknown };
}): OrderStatus {
  const status =
    response.details?.status ?? readUnknownStatus(response.details?.$unknown);
  return status === "created" || status === "paid" || status === "canceled"
    ? status
    : "unknown";
}

/**
 * `status` is field 3 of `OrderDetails`. A generated client that predates it
 * keeps the field as an unknown field; read the string from there.
 */
function readUnknownStatus(unknown: unknown): string | undefined {
  if (!Array.isArray(unknown)) {
    return undefined;
  }
  for (const field of unknown as { no?: number; wireType?: number; data?: Uint8Array }[]) {
    if (field?.no === 3 && field.wireType === 2 && field.data instanceof Uint8Array) {
      // `data` is the length varint followed by the bytes.
      let length = 0;
      let offset = 0;
      for (let shift = 0; offset < field.data.length && shift < 35; shift += 7) {
        const byte = field.data[offset++];
        length |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
      }
      if (offset + length !== field.data.length) {
        return undefined;
      }
      try {
        return new TextDecoder().decode(field.data.subarray(offset));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Settles the order that was pending when the buyer left for the payment
 * page. Paid: removes the order's cart lines (not what was added since),
 * forgets the order. Canceled or older than 24 hours: forgets the order only.
 * Anything else (not paid yet, backend or network error) keeps it for the
 * next call. An order of another project (`projectId` is the cart's project
 * id) is left alone and not asked about.
 */
export async function reconcilePendingOrder(deps: {
  fetchStatus: (order: PendingOrder) => Promise<OrderStatus>;
  removeLines: (lines: PendingOrderLine[]) => Promise<unknown> | unknown;
  /** The project of the page; an order made from another project's cart is skipped. */
  projectId?: string;
  storage?: PendingOrderStorage;
  now?: () => number;
}): Promise<PendingOrderOutcome> {
  const storage = deps.storage ?? defaultStorage();
  const order = readPendingOrder(storage);
  if (order == null) {
    return "none";
  }

  const now = (deps.now ?? Date.now)();
  if (now - order.ts > PENDING_ORDER_MAX_AGE_MS) {
    clearPendingOrder(storage);
    return "expired";
  }

  if (
    deps.projectId != null &&
    order.cartProjectId != null &&
    order.cartProjectId !== deps.projectId
  ) {
    return "pending";
  }

  let status: OrderStatus;
  try {
    status = await deps.fetchStatus(order);
  } catch {
    return "pending";
  }

  // The buyer may have started another payment while we were asking.
  const current = readPendingOrder(storage);
  if (current?.orderId !== order.orderId || current.ts !== order.ts) {
    return "pending";
  }

  if (status === "paid") {
    try {
      await deps.removeLines(order.lines);
    } catch {
      return "pending";
    }
    clearPendingOrder(storage);
    return "paid";
  }
  // A canceled order may still be paid again (PayU keeps it payable after a
  // declined attempt), so it is kept until it is paid or too old.
  return "pending";
}
