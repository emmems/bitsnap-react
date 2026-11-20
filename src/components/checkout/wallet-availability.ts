/**
 * Whether the shop takes Apple Pay and Google Pay (plan part 1, slice 5).
 *
 * One `isOneClickPaymentAvailable` answer serves the drawer, the Apple Pay
 * button and the Google Pay button: callers that overlap share one request,
 * and an answer is reused for 10 minutes in memory. The wallet buttons have
 * their own short-lived query clients (they die with the drawer), so the cache
 * lives here, not in React Query.
 *
 * Google Pay's answer is also kept on the device, in `googlePayConfig` of the
 * stored cart: a positive one for good (as before 1.31.0), a negative one for
 * 10 minutes, stamped with `checkedAt` and the shop it is for. A negative
 * answer without a usable stamp is expired: an older SDK in another tab
 * rewrites the cart and drops the stamp, which must not make "no Google Pay"
 * permanent (P18).
 */

/** How long an answer is reused, and a stored "no Google Pay" trusted. */
export const WALLET_AVAILABILITY_TTL_MS = 10 * 60_000;

/** What `googlePayConfig` of the stored cart holds. */
export type StoredGooglePayConfig = {
  isAvailable: boolean;
  merchantId: string;
  merchantName: string;
  gateway: string;
  gatewayId: string;
  /** When a negative answer was given (ms since epoch). */
  checkedAt?: number;
  /** `host|projectID` a negative answer is for. */
  checkedFor?: string;
};

/** The part of the RPC answer the cart reads. */
export type OneClickAnswer = {
  applePay: boolean;
  googlePay: boolean;
  googlePayConfig?: {
    gateway: string;
    gatewayMerchantId: string;
    merchantName: string;
    merchantId: string;
  };
};

export type WalletAvailabilityDeps = {
  /** Asks the server for `projectID` on `host`. */
  ask(host: string, projectID: string): Promise<OneClickAnswer>;
  /** The host requests go to now (it can change with `setCustomHost`). */
  host(): string;
  /** `googlePayConfig` of the stored cart, read fresh. */
  readStored(): StoredGooglePayConfig | undefined;
  /** Writes `googlePayConfig` into the stored cart, keeping everything else. */
  writeStored(config: StoredGooglePayConfig): void;
  now?: () => number;
};

export type WalletAvailability = {
  /** Apple Pay is on for the shop (the caller checks `ApplePaySession`). Rejects when the server could not be asked. */
  applePay(projectID: string): Promise<boolean>;
  /** Google Pay's settings, `isAvailable: false` when it is off. Rejects when the server could not be asked. */
  googlePay(projectID: string): Promise<StoredGooglePayConfig>;
  /** Forgets every answer kept in memory (tests, and a new project). */
  reset(): void;
};

const NO_GOOGLE_PAY = {
  isAvailable: false,
  gateway: "",
  gatewayId: "",
  merchantName: "",
  merchantId: "",
} as const;

const CONFIG_FIELDS = [
  "isAvailable",
  "merchantId",
  "merchantName",
  "gateway",
  "gatewayId",
  "checkedAt",
  "checkedFor",
] as const;

function sameConfig(
  a: StoredGooglePayConfig | undefined,
  b: StoredGooglePayConfig,
): boolean {
  return a != null && CONFIG_FIELDS.every((field) => a[field] === b[field]);
}

export function createWalletAvailability(
  deps: WalletAvailabilityDeps,
): WalletAvailability {
  const now = deps.now ?? (() => Date.now());
  const answers = new Map<string, { at: number; answer: OneClickAnswer }>();
  const flights = new Map<string, Promise<{ at: number; answer: OneClickAnswer }>>();

  /** The answer for `key`, from memory while it is young, else one shared request. */
  function answerFor(host: string, projectID: string) {
    const key = `${host}|${projectID}`;
    const kept = answers.get(key);
    const at = now();
    if (kept != null && at - kept.at >= 0 && at - kept.at < WALLET_AVAILABILITY_TTL_MS) {
      return Promise.resolve(kept);
    }
    let flight = flights.get(key);
    if (flight == null) {
      flight = deps
        .ask(host, projectID)
        .then((answer) => {
          const entry = { at: now(), answer };
          answers.set(key, entry);
          return entry;
        })
        .finally(() => {
          flights.delete(key);
        });
      flights.set(key, flight);
    }
    return flight;
  }

  function storedNegativeIsFresh(stored: StoredGooglePayConfig, key: string) {
    const age = now() - (stored.checkedAt ?? NaN);
    return (
      stored.checkedFor === key &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < WALLET_AVAILABILITY_TTL_MS
    );
  }

  return {
    async applePay(projectID) {
      const { answer } = await answerFor(deps.host(), projectID);
      return answer.applePay === true;
    },

    async googlePay(projectID) {
      const host = deps.host();
      const key = `${host}|${projectID}`;
      const stored = deps.readStored();
      if (stored?.isAvailable === true) {
        return stored;
      }
      if (stored != null && storedNegativeIsFresh(stored, key)) {
        return stored;
      }
      const { at, answer } = await answerFor(host, projectID);
      const config: StoredGooglePayConfig =
        answer.googlePay === true && answer.googlePayConfig != null
          ? {
              isAvailable: true,
              gateway: answer.googlePayConfig.gateway,
              gatewayId: answer.googlePayConfig.gatewayMerchantId,
              merchantName: answer.googlePayConfig.merchantName,
              merchantId: answer.googlePayConfig.merchantId,
            }
          : // The time of the answer, not of this read: a reuse from memory
            // does not stretch the 10 minutes.
            { ...NO_GOOGLE_PAY, checkedAt: at, checkedFor: key };
      // Written only when it changes; a write with nothing new is not made.
      if (!sameConfig(deps.readStored(), config)) {
        try {
          deps.writeStored(config);
        } catch {
          // A full storage only costs a request on the next page.
        }
      }
      return config;
    },

    reset() {
      answers.clear();
      flights.clear();
    },
  };
}
