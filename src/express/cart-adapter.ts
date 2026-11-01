import {
  appendLocalCartLines,
  buildLocalCartUpload,
  readLocalCartLines,
  readLocalCartSignature,
  removeLocalCartLines,
  replaceLocalCartLines,
} from "@/src/components/checkout/CartProvider";
import { HOST } from "@/src/components/checkout/constants";
import {
  fetchInpostPayStatus,
  fetchRevolutPayStatus,
  readExpressCart,
  startExpressProvider,
  writeExpressCart,
  type FetchLike,
} from "./client";
import { ExpressCartSession, type ExpressCartLocal } from "./cart-session";
import type {
  CartEnvironment,
  ExpressPayStatus,
  RevolutPayStatus,
} from "./contracts";
import {
  prepareExpressCartUpload,
  readDeliveryQuote,
  withDeliveryQuote,
} from "./delivery-quote";
import type { ExpressStorage } from "./cart-record";

/**
 * Wires the express cart session to the SDK's browser cart and to the Bitsnap
 * host. The session is cheap and stateless besides the serialized queue, so a
 * component can create one per mount and drop it on unmount.
 */

/** The SDK cart as the session sees it. */
export function sdkLocalCart(options: {
  host: string;
  projectID: string;
}): ExpressCartLocal {
  return {
    lines: () =>
      readLocalCartLines().map((line) => ({
        id: line.productID,
        quantity: line.quantity,
      })),
    signature: readLocalCartSignature,
    upload: (locale) => {
      const upload = buildLocalCartUpload(locale);
      if (upload == null) {
        return undefined;
      }
      return withDeliveryQuote(
        upload,
        readDeliveryQuote(options.host, options.projectID, upload),
      );
    },
    adoptSnapshot: (snapshot) => {
      replaceLocalCartLines(
        snapshot.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
      );
    },
    appendLines: appendLocalCartLines,
    removeLines: removeLocalCartLines,
    replaceLines: (lines) => {
      replaceLocalCartLines(
        lines.map((line) => ({
          productId: line.id,
          quantity: line.quantity,
        })),
      );
    },
  };
}

export type ExpressSessionOptions = {
  projectID: string;
  host?: string;
  fetch?: FetchLike;
  storage?: ExpressStorage;
  signal?: AbortSignal;
  now?: () => number;
  /** Overrides the SDK cart (explicit `items` of a custom storefront). */
  local?: ExpressCartLocal;
};

export function createExpressSession(
  options: ExpressSessionOptions,
): ExpressCartSession {
  const host = options.host ?? HOST;
  const clientOptions = {
    projectID: options.projectID,
    host,
    ...(options.fetch != null ? { fetch: options.fetch } : {}),
    ...(options.signal != null ? { signal: options.signal } : {}),
  };
  return new ExpressCartSession({
    projectID: options.projectID,
    host,
    local: options.local ?? sdkLocalCart({ host, projectID: options.projectID }),
    ...(options.storage != null ? { storage: options.storage } : {}),
    ...(options.now != null ? { now: options.now } : {}),
    write: (upload, current) =>
      writeExpressCart(clientOptions, upload, current),
    read: (cartId, cartToken) =>
      readExpressCart(clientOptions, cartId, cartToken),
  });
}

/** Starts a provider for the current browser cart through a fresh session. */
export async function startProviderForCart(
  options: ExpressSessionOptions & {
    locale: string;
    environment?: CartEnvironment;
    returnUrl?: string;
    cancelUrl?: string;
    embedOrigin?: string;
  },
  provider: "inpostPay" | "revolutPay",
  session: ExpressCartSession = createExpressSession(options),
) {
  const host = options.host ?? HOST;
  // The provider start uploads the cart again. Resolve the delivery quote now
  // for the content that is about to be sent, so a product added since the
  // last availability call cannot slip through with zero shipping.
  const preview = session.previewUpload(options.locale);
  if (preview != null) {
    const prepared = await prepareExpressCartUpload({
      host,
      projectID: options.projectID,
      upload: preview,
    });
    if (!prepared.ok) {
      return {
        ok: false as const,
        code: "invalid-cart" as const,
        message: prepared.message,
      };
    }
  }
  return session.start(provider, {
    locale: options.locale,
    ...(options.environment != null
      ? { environment: options.environment }
      : {}),
    ...(options.returnUrl != null ? { returnUrl: options.returnUrl } : {}),
    ...(options.cancelUrl != null ? { cancelUrl: options.cancelUrl } : {}),
    ...(options.embedOrigin != null ? { embedOrigin: options.embedOrigin } : {}),
    start: (request) =>
      startExpressProvider(
        {
          projectID: options.projectID,
          host,
          ...(options.fetch != null ? { fetch: options.fetch } : {}),
          ...(options.signal != null ? { signal: options.signal } : {}),
        },
        provider,
        request,
      ),
  });
}

export function getRevolutStatus(
  options: ExpressSessionOptions,
  session?: ExpressCartSession,
): Promise<RevolutPayStatus> {
  return getProviderStatus(options, "revolutPay", session);
}

/** InPost Pay status: only the signed server-side order state completes it. */
export function getInpostStatus(
  options: ExpressSessionOptions,
  session?: ExpressCartSession,
): Promise<ExpressPayStatus> {
  return getProviderStatus(options, "inpostPay", session);
}

function getProviderStatus(
  options: ExpressSessionOptions,
  provider: "inpostPay" | "revolutPay",
  session?: ExpressCartSession,
): Promise<ExpressPayStatus> {
  const host = options.host ?? HOST;
  const active = session ?? createExpressSession(options);
  return active.status((cartId, cartToken) =>
    (provider === "inpostPay"
      ? fetchInpostPayStatus
      : fetchRevolutPayStatus)(
      {
        projectID: options.projectID,
        host,
        ...(options.fetch != null ? { fetch: options.fetch } : {}),
        ...(options.signal != null ? { signal: options.signal } : {}),
      },
      cartId,
      cartToken,
    ),
  );
}
