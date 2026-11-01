import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  buildLocalCartUpload,
  localCartVersionSnapshot,
  readLocalCartLines,
  subscribeToLocalCart,
} from "@/src/components/checkout/CartProvider";
import { HOST } from "@/src/components/checkout/constants";
import {
  createExpressSession,
  sdkLocalCart,
} from "./cart-adapter";
import type { ExpressCartLocal } from "./cart-session";
import type {
  ExpressAvailability,
  ExpressCartUpload,
  ProviderAvailability,
} from "./contracts";
import {
  prepareExpressCartUpload,
  readDeliveryQuote,
  withDeliveryQuote,
} from "./delivery-quote";
import { fetchExpressAvailability, type FetchLike } from "./client";

/**
 * React glue between the express client and the buttons. Everything is
 * browser-only: nothing is requested while rendering on the server, and no
 * state is shared between two projects or two hosts.
 */

export type ExpressItem = { id: string; quantity: number };

export type ExpressCartSource = "items" | "cart" | "product";

export type ResolvedExpressCart = {
  items: ExpressItem[];
  source: ExpressCartSource;
  country?: string;
  couponCode?: string;
  /** The product the widget adds on click, when used on a product page. */
  productId?: string;
  productQuantity: number;
};

export function resolveExpressCart(args: {
  items?: ExpressItem[];
  productId?: string;
  quantity?: number;
  country?: string;
  couponCode?: string;
}): ResolvedExpressCart {
  const productQuantity = Math.max(1, Math.trunc(args.quantity ?? 1));
  const base = {
    ...(args.country != null ? { country: args.country } : {}),
    ...(args.couponCode != null ? { couponCode: args.couponCode } : {}),
    productQuantity,
  };
  if (args.items != null && args.items.length > 0) {
    return {
      ...base,
      items: args.items.map((item) => ({
        id: item.id,
        quantity: Math.max(1, Math.trunc(item.quantity)),
      })),
      source: "items",
    };
  }
  const cart = readLocalCartLines().map((line) => ({
    id: line.productID,
    quantity: line.quantity,
  }));
  if (args.productId != null && args.productId.length > 0) {
    const present = cart.some((line) => line.id === args.productId);
    return {
      ...base,
      items: present
        ? cart
        : [...cart, { id: args.productId, quantity: productQuantity }],
      source: "product",
      productId: args.productId,
    };
  }
  return { ...base, items: cart, source: "cart" };
}

export function expressCartSignature(cart: ResolvedExpressCart): string {
  const lines = cart.items
    .map((line) => `${line.id}:${line.quantity}`)
    .sort()
    .join(",");
  return [
    cart.source,
    lines,
    cart.country ?? "",
    cart.couponCode ?? "",
    cart.productId ?? "",
  ].join("|");
}

/**
 * The cart adapter the session writes through. Explicit `items` belong to the
 * merchant's own cart: the SDK uploads them but never edits the merchant's
 * state. Otherwise the SDK cart is the basket, as in the drawer checkout.
 */
export function expressCartLocal(
  cart: ResolvedExpressCart,
  locale: string,
  options: { host: string; projectID: string },
): ExpressCartLocal {
  if (cart.source === "cart") {
    return sdkLocalCart(options);
  }
  const upload: ExpressCartUpload = {
    items: cart.items.map((item) => ({ id: item.id, quantity: item.quantity })),
    ...(cart.country != null ? { countries: [cart.country] } : {}),
    ...(cart.couponCode != null ? { couponCode: cart.couponCode } : {}),
    locale,
  };
  return {
    lines: () => cart.items,
    signature: () => expressCartSignature(cart),
    upload: () =>
      withDeliveryQuote(
        upload,
        readDeliveryQuote(options.host, options.projectID, upload),
      ),
    adoptSnapshot: () => {},
    appendLines: () => {},
    removeLines: () => {},
  };
}

export type UseExpressAvailabilityArgs = {
  provider: "inpostPay" | "revolutPay";
  projectID: string | undefined;
  host?: string;
  locale: string;
  items?: ExpressItem[];
  productId?: string;
  quantity?: number;
  country?: string;
  couponCode?: string;
  enabled?: boolean;
  fetch?: FetchLike;
};

export type ExpressAvailabilityState = {
  loading: boolean;
  provider: ProviderAvailability | undefined;
  environment: "test" | "production" | undefined;
  /** True when the backend does not implement the express API or failed. */
  failed: boolean;
};

/**
 * Re-renders when the local Bitsnap cart changes. Standalone buttons use it so
 * their eligibility follows quantity/remove/country/coupon edits made anywhere
 * on the page, not only a parent re-render.
 */
export function useLocalCartVersion(): number {
  return useSyncExternalStore(
    subscribeToLocalCart,
    localCartVersionSnapshot,
    () => 0,
  );
}

/**
 * Asks for provider availability of the current cart. Re-asks when the cart
 * content, project, host or locale changes; an older answer is discarded.
 */
export function useExpressAvailability(
  args: UseExpressAvailabilityArgs,
): ExpressAvailabilityState {
  const latest = useRef(args);
  latest.current = args;
  const cart = resolveExpressCart(args);
  const signature = expressCartSignature(cart);
  const cartVersion = useLocalCartVersion();
  const [state, setState] = useState<ExpressAvailabilityState>({
    loading: false,
    provider: undefined,
    environment: undefined,
    failed: false,
  });

  useEffect(() => {
    const current = latest.current;
    if (
      current.enabled === false ||
      current.projectID == null ||
      current.projectID.length === 0 ||
      typeof window === "undefined"
    ) {
      setState({
        loading: false,
        provider: undefined,
        environment: undefined,
        failed: false,
      });
      return;
    }
    const resolved = resolveExpressCart(current);
    if (resolved.items.length === 0) {
      setState({
        loading: false,
        provider: undefined,
        environment: undefined,
        failed: false,
      });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setState((previous) => ({ ...previous, loading: true }));
    getExpressAvailability({
      projectID: current.projectID,
      ...(current.host != null ? { host: current.host } : {}),
      locale: current.locale,
      cart: resolved,
      ...(current.fetch != null ? { fetch: current.fetch } : {}),
      signal: controller.signal,
    })
      .then((availability) => {
        if (!active) {
          return;
        }
        const provider = availability?.providers?.[current.provider];
        setState({
          loading: false,
          provider,
          environment: availability?.environment ?? provider?.environment,
          failed: availability == null,
        });
      })
      .catch(() => {
        if (active) {
          setState({
            loading: false,
            provider: undefined,
            environment: undefined,
            failed: true,
          });
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    signature,
    cartVersion,
    args.projectID,
    args.host,
    args.provider,
    args.locale,
    args.enabled,
  ]);

  return state;
}

/** A session bound to one project + host, recreated when either changes. */
export function useExpressSession(args: {
  projectID: string | undefined;
  host?: string;
  fetch?: FetchLike;
  signal?: AbortSignal;
}) {
  return useMemo(
    () =>
      args.projectID == null
        ? undefined
        : createExpressSession({
            projectID: args.projectID,
            ...(args.host != null ? { host: args.host } : {}),
            ...(args.fetch != null ? { fetch: args.fetch } : {}),
            ...(args.signal != null ? { signal: args.signal } : {}),
          }),
    [args.projectID, args.host, args.fetch, args.signal],
  );
}

export function resolveExpressHost(host: string | undefined): string {
  return host ?? HOST;
}

/** The availability/upload body of a resolved express cart. */
export function expressUploadFor(
  cart: ResolvedExpressCart,
  locale: string,
  options?: { host?: string; projectID?: string },
): ExpressCartUpload | undefined {
  const upload =
    cart.source === "cart"
      ? buildLocalCartUpload(locale)
      : cart.items.length === 0
        ? undefined
        : {
            items: cart.items.map((item) => ({
              id: item.id,
              quantity: item.quantity,
            })),
            ...(cart.country != null ? { countries: [cart.country] } : {}),
            ...(cart.couponCode != null ? { couponCode: cart.couponCode } : {}),
            locale,
          };
  if (upload == null) {
    return undefined;
  }
  if (options?.host == null || options.projectID == null) {
    return upload;
  }
  return withDeliveryQuote(
    upload,
    readDeliveryQuote(options.host, options.projectID, upload),
  );
}

/**
 * Availability of one provider for the current browser cart. Resolves the
 * delivery quote first (and remembers it for the start call); without it no
 * express button renders, because a shipping-free total would be wrong.
 */
export async function getExpressAvailability(
  options: {
    projectID: string;
    host?: string;
    locale: string;
    cart: ResolvedExpressCart;
    fetch?: FetchLike;
    signal?: AbortSignal;
  },
): Promise<ExpressAvailability | undefined> {
  const host = options.host ?? HOST;
  const upload = expressUploadFor(options.cart, options.locale);
  if (upload == null) {
    return undefined;
  }
  const prepared = await prepareExpressCartUpload({
    host,
    projectID: options.projectID,
    upload,
  });
  if (!prepared.ok) {
    return undefined;
  }
  const availability = await fetchExpressAvailability(
    {
      projectID: options.projectID,
      host,
      ...(options.fetch != null ? { fetch: options.fetch } : {}),
      ...(options.signal != null ? { signal: options.signal } : {}),
    },
    prepared.upload,
  );
  if (availability == null) {
    return undefined;
  }
  if (prepared.quote.delivery.length === 0) {
    return availability;
  }
  // Revolut Pay express collects no shipping address (start refuses a
  // deliverable cart), so it must not mount with a total that includes no
  // shipping. InPost Pay carries the quoted delivery in its basket.
  const revolutPay = availability.providers.revolutPay;
  if (revolutPay == null || revolutPay.available !== true) {
    return availability;
  }
  return {
    ...availability,
    providers: {
      ...availability.providers,
      revolutPay: {
        ...revolutPay,
        available: false,
        reasons: [...revolutPay.reasons, "delivery-unsupported"],
      },
    },
  };
}
