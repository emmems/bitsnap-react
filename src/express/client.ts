import { clientHeaders } from "@/src/lib/client-header";
import type {
  CartLineConflict,
  CartSnapshot,
  CartWriteFailureCode,
  CartWriteResult,
  ExpressAvailability,
  ExpressCartUpload,
  ExpressPayStatus,
  ExpressProviderName,
  ExpressResult,
  ProviderStart,
  RevolutPayStatus,
  StartFailure,
  StartFailureCode,
} from "./contracts";

/**
 * HTTP client of the cart-aware express API. Every function resolves, never
 * throws: an old backend (404 HTML), a provider that is not implemented (501)
 * or a network error is a typed failure the UI can hide a button for.
 */

export const CART_TOKEN_HEADER = "x-bitsnap-cart-token";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type ExpressClientOptions = {
  projectID: string;
  /** Defaults to the configured Bitsnap host. */
  host: string;
  fetch?: FetchLike;
  signal?: AbortSignal;
};

const warned = new Set<string>();

function warnOnce(key: string, message: string, detail: unknown) {
  if (warned.has(key)) {
    return;
  }
  warned.add(key);
  console.warn(message, detail);
}

/** Test seam: forget which warnings were already printed. */
export function resetExpressClientWarnings() {
  warned.clear();
}

export function expressApiUrl(
  host: string,
  projectID: string,
  path: string,
): string {
  const base = host.replace(/\/+$/, "");
  return `${base}/api/integrations/${encodeURIComponent(projectID)}/public-commerce/express${path}`;
}

type RawResponse = { status: number; json: unknown; text: string };

async function request(
  options: ExpressClientOptions,
  path: string,
  body: unknown,
  cartToken?: string,
): Promise<RawResponse | { transportError: unknown }> {
  const fetchImpl: FetchLike =
    options.fetch ??
    ((input, init) => globalThis.fetch(input, init) as Promise<Response>);
  try {
    const response = await fetchImpl(
      expressApiUrl(options.host, options.projectID, path),
      {
        method: "POST",
        headers: {
          ...clientHeaders,
          "Content-Type": "application/json",
          ...(cartToken != null ? { [CART_TOKEN_HEADER]: cartToken } : {}),
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: options.signal,
      },
    );
    const text = await response.text().catch(() => "");
    let json: unknown;
    try {
      json = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: response.status, json, text };
  } catch (error) {
    return { transportError: error };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function networkFailure<T>(error: unknown): ExpressResult<T> {
  if (isAbortError(error)) {
    return { ok: false, code: "network", message: "aborted" };
  }
  return { ok: false, code: "network", message: "The server could not be reached." };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

/** 404/HTML of an older backend and 5xx are "not implemented here". */
function isUnsupportedStatus(status: number): boolean {
  return status === 404 || status === 405 || status === 501 || status === 502;
}

function mapFailureCode(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/**
 * Cart-aware provider availability. `undefined` when the backend does not
 * implement the express API (old server) or the answer is unusable: callers
 * then render no express button at all.
 */
export async function fetchExpressAvailability(
  options: ExpressClientOptions,
  cart: ExpressCartUpload,
): Promise<ExpressAvailability | undefined> {
  const raw = await request(options, "/availability", cart);
  if ("transportError" in raw) {
    warnOnce(
      `availability:${options.host}:${options.projectID}`,
      "Bitsnap express availability is not reachable; express buttons stay hidden.",
      raw.transportError,
    );
    return undefined;
  }
  if (isUnsupportedStatus(raw.status) || raw.status !== 200) {
    warnOnce(
      `availability-status:${options.host}:${options.projectID}`,
      "Bitsnap express availability is not available on this backend; express buttons stay hidden.",
      raw.status,
    );
    return undefined;
  }
  const body = raw.json;
  if (
    !isRecord(body) ||
    body.success !== true ||
    !isRecord(body.providers)
  ) {
    warnOnce(
      `availability-shape:${options.host}:${options.projectID}`,
      "Bitsnap express availability returned an unknown shape; express buttons stay hidden.",
      undefined,
    );
    return undefined;
  }
  return body as unknown as ExpressAvailability;
}

/**
 * Creates or replaces the durable cart. `cartId`/`cartToken`/`expectedRevision`
 * are present on an update only; omitting them creates a cart.
 */
export async function writeExpressCart(
  options: ExpressClientOptions,
  cart: ExpressCartUpload,
  current?: { cartId: string; cartToken: string; expectedRevision: number },
): Promise<CartWriteResult> {
  const raw = await request(
    options,
    "/cart",
    {
      ...cart,
      ...(current != null
        ? { cartId: current.cartId, expectedRevision: current.expectedRevision }
        : {}),
    },
    current?.cartToken,
  );
  if ("transportError" in raw) {
    return { ok: false, code: "internal", message: "The cart could not be saved." };
  }
  const body = raw.json;
  if (!isRecord(body) || typeof body.success !== "boolean") {
    return {
      ok: false,
      code: raw.status === 403 ? "cart-forbidden" : "internal",
      message: "The cart endpoint returned an unknown answer.",
    };
  }
  if (body.success === true) {
    const snapshot = body.snapshot as CartSnapshot | undefined;
    if (snapshot == null || typeof snapshot.revision !== "number") {
      return {
        ok: false,
        code: "internal",
        message: "The cart endpoint returned no snapshot.",
      };
    }
    return {
      ok: true,
      ...(typeof body.cartToken === "string" ? { cartToken: body.cartToken } : {}),
      snapshot,
    };
  }
  return {
    ok: false,
    code: mapFailureCode(body.code, "internal") as CartWriteFailureCode,
    message:
      typeof body.message === "string"
        ? body.message
        : "The cart could not be saved.",
    ...(typeof body.currentRevision === "number"
      ? { currentRevision: body.currentRevision }
      : {}),
    ...(isRecord(body.snapshot) ? { snapshot: body.snapshot as CartSnapshot } : {}),
    ...(Array.isArray(body.conflicts)
      ? { conflicts: body.conflicts as CartLineConflict[] }
      : {}),
  };
}

function mapCartFailure(body: Record<string, unknown>) {
  const code = mapFailureCode(body.code, "internal");
  return { code, message: mapFailureCode(body.message, code) };
}

/** Reads the canonical snapshot of a token holder. */
export async function readExpressCart(
  options: ExpressClientOptions,
  cartId: string,
  cartToken: string,
): Promise<ExpressResult<CartSnapshot>> {
  const raw = await request(options, "/cart-snapshot", { cartId }, cartToken);
  if ("transportError" in raw) {
    return networkFailure(raw.transportError);
  }
  const body = raw.json;
  if (raw.status === 404) {
    return { ok: false, code: "cart-not-found", message: "cart-not-found", status: 404 };
  }
  if (raw.status === 403) {
    return { ok: false, code: "cart-forbidden", message: "cart-forbidden", status: 403 };
  }
  if (!isRecord(body) || body.success !== true || !isRecord(body.snapshot)) {
    return {
      ok: false,
      code: isUnsupportedStatus(raw.status) ? "not-implemented" : "invalid-response",
      message: "The cart snapshot is not available.",
      status: raw.status,
    };
  }
  return { ok: true, value: body.snapshot as unknown as CartSnapshot };
}

/** Binds the cart to a provider and returns the public browser configuration. */
export async function startExpressProvider(
  options: ExpressClientOptions,
  provider: ExpressProviderName,
  args: {
    cartId: string;
    cartToken: string;
    returnUrl?: string;
    cancelUrl?: string;
    embedOrigin?: string;
  },
): Promise<ExpressResult<ProviderStart>> {
  const path =
    provider === "inpostPay"
      ? "/inpost/start"
      : provider === "revolutPay"
        ? "/revolut/start"
        : "/adyen/start";
  const raw = await request(
    options,
    path,
    {
      cartId: args.cartId,
      ...(args.returnUrl != null ? { returnUrl: args.returnUrl } : {}),
      ...(args.cancelUrl != null ? { cancelUrl: args.cancelUrl } : {}),
      ...(args.embedOrigin != null ? { embedOrigin: args.embedOrigin } : {}),
    },
    args.cartToken,
  );
  if ("transportError" in raw) {
    return networkFailure(raw.transportError);
  }
  const body = raw.json;
  if (!isRecord(body) || typeof body.success !== "boolean") {
    return {
      ok: false,
      code: isUnsupportedStatus(raw.status) ? "not-implemented" : "invalid-response",
      message: "The provider start is not available.",
      status: raw.status,
    };
  }
  if (body.success === true) {
    if (
      typeof body.redirectUrl !== "string" ||
      typeof body.providerOrderId !== "string"
    ) {
      return {
        ok: false,
        code: "invalid-response",
        message: "The provider start returned no redirect.",
        status: raw.status,
      };
    }
    return {
      ok: true,
      value: {
        ok: true,
        provider,
        redirectUrl: body.redirectUrl,
        providerOrderId: body.providerOrderId,
        ...(isRecord(body.publicConfig)
          ? { publicConfig: body.publicConfig as Record<string, string> }
          : {}),
        cartRevision:
          typeof body.cartRevision === "number" ? body.cartRevision : 0,
      },
    };
  }
  const failure = body as unknown as StartFailure;
  return {
    ok: false,
    code: (isUnsupportedStatus(raw.status)
      ? "not-implemented"
      : failure.code) as StartFailureCode,
    message:
      typeof failure.message === "string"
        ? failure.message
        : "The provider start failed.",
    status: raw.status,
  };
}

/**
 * Revolut Pay status. `pending` is what an old backend or an unanswered webhook
 * looks like; only `completed` may remove purchased lines from the cart.
 */
export function fetchRevolutPayStatus(
  options: ExpressClientOptions,
  cartId: string,
  cartToken: string,
): Promise<RevolutPayStatus> {
  return fetchExpressPayStatus(options, "/revolut/status", cartId, cartToken);
}

/**
 * InPost Pay status. A browser `orderCreated` event is only a hint; this route
 * answers from the server-side order association, so a tampered browser event
 * can never clear a cart.
 */
export function fetchInpostPayStatus(
  options: ExpressClientOptions,
  cartId: string,
  cartToken: string,
): Promise<ExpressPayStatus> {
  return fetchExpressPayStatus(options, "/inpost/status", cartId, cartToken);
}

async function fetchExpressPayStatus(
  options: ExpressClientOptions,
  path: "/revolut/status" | "/inpost/status",
  cartId: string,
  cartToken: string,
): Promise<ExpressPayStatus> {
  const raw = await request(options, path, { cartId }, cartToken);
  if ("transportError" in raw) {
    return { ok: false, code: "network", message: "The status is not available." };
  }
  const body = raw.json;
  if (raw.status === 401 || raw.status === 403) {
    return { ok: false, code: "cart-forbidden", message: "cart-forbidden" };
  }
  if (raw.status === 404) {
    return { ok: false, code: "cart-not-found", message: "cart-not-found" };
  }
  if (!isRecord(body) || typeof body.success !== "boolean") {
    return {
      ok: false,
      code: isUnsupportedStatus(raw.status) ? "not-implemented" : "provider-error",
      message: "The status is not available.",
    };
  }
  if (body.success === true) {
    if (
      body.status === "pending" ||
      body.status === "completed" ||
      body.status === "failed" ||
      body.status === "cancelled"
    ) {
      return {
        ok: true,
        status: body.status,
        ...(typeof body.orderId === "string" ? { orderId: body.orderId } : {}),
      };
    }
    return { ok: false, code: "provider-error", message: "Unknown status." };
  }
  return {
    ok: false,
    code: isUnsupportedStatus(raw.status) ? "not-implemented" : "provider-error",
    message: isRecord(body) ? mapCartFailure(body).message : "The status failed.",
  };
}
