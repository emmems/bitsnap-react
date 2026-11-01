/**
 * Loader of the official Revolut Checkout embed script.
 *
 * The script is loaded only in the browser and only when a Revolut Pay button
 * is about to render: it never runs during server rendering and never lands in
 * the initial bundle of a page without the button. One `<script>` per mode is
 * shared by every button on the page, including two shops using different
 * public keys (the SDK is keyed per `payments()` call, not globally).
 */

export type RevolutMode = "prod" | "sandbox";

export type RevolutPaymentEvent =
  | { type: "success"; orderId: string }
  | { type: "error"; error: { message?: string }; orderId: string }
  | { type: "cancel"; dropOffState?: string; orderId?: string };

export type RevolutPayButtonStyle = {
  height?: string;
  size?: "large" | "small";
  radius?: "none" | "small" | "large" | "round";
  variant?: "dark" | "light" | "light-outlined";
  action?: "donate" | "pay" | "subscribe" | "buy";
};

export type RevolutPayPaymentOptions = {
  currency: string;
  totalAmount: number;
  createOrder: () => Promise<{ publicId: string }>;
  buttonStyle?: RevolutPayButtonStyle;
  mobileRedirectUrls?: {
    success: string;
    failure: string;
    cancel: string;
  };
  redirectUrls?: {
    success: string;
    failure: string;
    cancel: string;
  };
  validate?: () => Promise<boolean> | boolean;
};

export type RevolutPayModule = {
  mount: (
    target: string | HTMLElement | null,
    options: RevolutPayPaymentOptions,
  ) => void;
  on: {
    (event: "click", callback: () => void): void;
    (event: "payment", callback: (payload: RevolutPaymentEvent) => void): void;
  };
  destroy: () => void;
};

export type RevolutPaymentsModule = {
  revolutPay: RevolutPayModule;
  destroy?: () => void;
};

export type RevolutCheckoutNamespace = {
  payments: (options: {
    publicToken: string;
    mode?: RevolutMode;
    locale?: string;
  }) => Promise<RevolutPaymentsModule>;
};

declare global {
  interface Window {
    RevolutCheckout?: RevolutCheckoutNamespace;
  }
}

export const REVOLUT_SCRIPT_URL: Record<RevolutMode, string> = {
  prod: "https://merchant.revolut.com/embed.js",
  sandbox: "https://sandbox-merchant.revolut.com/embed.js",
};

const SCRIPT_ID: Record<RevolutMode, string> = {
  prod: "revolut-checkout",
  sandbox: "revolut-checkout-sandbox",
};

const loading = new Map<RevolutMode, Promise<RevolutCheckoutNamespace>>();

/** Test seam: drop in-flight loader promises between cases. */
export function resetRevolutLoader(): void {
  loading.clear();
}

/**
 * Resolves when `window.RevolutCheckout` is usable. Rejects on a script error
 * or after `timeoutMs`, so a blocked script hides the button instead of
 * leaving a dead one.
 */
export function loadRevolutCheckout(
  mode: RevolutMode,
  options: {
    document?: Document;
    timeoutMs?: number;
  } = {},
): Promise<RevolutCheckoutNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Revolut Checkout needs a browser."));
  }
  const existing = window.RevolutCheckout;
  if (existing != null) {
    return Promise.resolve(existing);
  }
  const cached = loading.get(mode);
  if (cached != null) {
    return cached;
  }

  const doc = options.document ?? document;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const promise = new Promise<RevolutCheckoutNamespace>((resolve, reject) => {
    let settled = false;
    let script = doc.getElementById(SCRIPT_ID[mode]) as HTMLScriptElement | null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer != null) {
        clearTimeout(timer);
      }
      script?.removeEventListener("load", onLoad);
      script?.removeEventListener("error", onError);
    };
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };
    const onLoad = () => {
      finish(() => {
        const loaded = window.RevolutCheckout;
        if (loaded != null) {
          resolve(loaded);
        } else {
          reject(new Error("Revolut Checkout did not initialise."));
        }
      });
    };
    const onError = () => {
      finish(() => reject(new Error("Revolut Checkout could not be loaded.")));
    };

    if (script == null) {
      script = doc.createElement("script");
      script.id = SCRIPT_ID[mode];
      script.src = REVOLUT_SCRIPT_URL[mode];
      script.async = true;
      script.addEventListener("load", onLoad);
      script.addEventListener("error", onError);
      doc.head.appendChild(script);
    } else {
      script.addEventListener("load", onLoad);
      script.addEventListener("error", onError);
    }

    timer = setTimeout(() => {
      finish(() =>
        reject(new Error("Revolut Checkout timed out while loading.")),
      );
    }, timeoutMs);
  });

  loading.set(mode, promise);
  promise.catch(() => loading.delete(mode));
  return promise;
}

/** Initialises the payments module (official API) for one public key. */
export function createRevolutPayments(
  namespace: RevolutCheckoutNamespace,
  options: { publicKey: string; mode: RevolutMode; locale: string },
): Promise<RevolutPaymentsModule> {
  return namespace.payments({
    publicToken: options.publicKey,
    mode: options.mode,
    locale: options.locale,
  });
}
