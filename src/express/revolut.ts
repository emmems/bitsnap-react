import type { ExpressPayStatus } from "./contracts";

/**
 * Provider status is server-authoritative. A browser `success`/`orderCreated`
 * event only means "the widget finished"; the SDK asks Bitsnap until the
 * verified callback settles the order (or gives up and leaves the attempt for
 * the next visit). Nothing in this module reads a browser callback as proof of
 * payment.
 */

export type RevolutPublicConfig = {
  publicKey: string;
  mode: "sandbox" | "prod";
  /** The public order token of this attempt (start response only). */
  orderToken?: string;
};

/** Validates the public config of the start/availability answer. */
export function readRevolutPublicConfig(
  config: Record<string, string> | undefined,
): RevolutPublicConfig | undefined {
  if (config == null) {
    return undefined;
  }
  const publicKey = config.publicKey ?? config.publicToken;
  const mode = config.mode;
  if (publicKey == null || publicKey.length === 0) {
    return undefined;
  }
  if (mode !== "sandbox" && mode !== "prod") {
    return undefined;
  }
  return {
    publicKey,
    mode,
    ...(config.orderToken != null && config.orderToken.length > 0
      ? { orderToken: config.orderToken }
      : {}),
  };
}

/** `{ publicId: orderToken }` — the documented `createOrder` answer. */
export function revolutOrderToken(
  start: { publicConfig?: Record<string, string>; providerOrderId: string },
): string {
  const fromConfig = start.publicConfig?.orderToken;
  if (fromConfig != null && fromConfig.length > 0) {
    return fromConfig;
  }
  // Older backend builds put the public token in the public order id.
  return start.providerOrderId;
}

export function revolutLocale(locale: string | undefined): "pl" | "en" {
  return locale != null && /^pl\b/i.test(locale) ? "pl" : "en";
}

/** The provider is available only when the SDK can actually be initialised. */
export function isRevolutPayable(config: RevolutPublicConfig | undefined): boolean {
  return config != null;
}

export type PollOptions = {
  check: () => Promise<ExpressPayStatus>;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_INTERVAL_MS = 2_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Asks Bitsnap for a provider status until it leaves `pending`, the timeout
 * elapses, or the caller aborts. Resolves with the last status; a transport
 * failure resolves `undefined`. A timeout keeps the attempt pending so a later
 * visit checks again.
 */
export async function pollProviderStatus(
  options: PollOptions,
): Promise<ExpressPayStatus | undefined> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const sleep = options.sleep ?? defaultSleep;
  const startedAt = (options.now ?? Date.now)();
  // Even with a frozen clock the loop is bounded, so a test or a system whose
  // clock jumps cannot spin forever.
  const maxAttempts = Math.min(
    10_000,
    Math.max(1, Math.ceil(timeoutMs / Math.max(1, intervalMs)) + 1),
  );
  let attempts = 0;
  let last: ExpressPayStatus | undefined;

  for (;;) {
    attempts += 1;
    if (options.signal?.aborted === true) {
      return last;
    }
    try {
      last = await options.check();
    } catch {
      last = undefined;
    }
    if (last?.ok === true && last.status !== "pending") {
      return last;
    }
    if (last?.ok === false && last.code === "not-implemented") {
      // An old backend cannot confirm; leave the attempt for later instead of
      // spinning.
      return last;
    }
    if (
      attempts >= maxAttempts ||
      (options.now ?? Date.now)() - startedAt >= timeoutMs
    ) {
      return last;
    }
    await sleep(intervalMs);
  }
}

/** Revolut Pay keeps its historical name at the call sites. */
export const pollRevolutStatus = pollProviderStatus;
