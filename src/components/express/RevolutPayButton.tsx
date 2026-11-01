import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  InstrumentProvider,
  useInstrument,
  useInstrumentContext,
  type AnalyticsOption,
} from "@/src/analytics/instrument";
import type { CheckoutAppearance } from "@/src/components/checkout/appearance";
import { CheckoutAppearanceProvider } from "@/src/components/checkout/appearance.context";
import { setProjectID } from "@/src/components/checkout/CartProvider";
import { getLocale } from "@/src/components/checkout/locale";
import { currentProjectID } from "@/src/components/checkout/project-id";
import type { CheckoutTexts } from "@/src/components/checkout/texts";
import { CheckoutTextsProvider } from "@/src/components/checkout/texts.context";
import {
  createExpressSession,
  getRevolutStatus,
  startProviderForCart,
} from "@/src/express/cart-adapter";
import { activePendingAttempt } from "@/src/express/cart-record";
import type { ExpressCartSession } from "@/src/express/cart-session";
import type { FetchLike } from "@/src/express/client";
import {
  expressCartLocal,
  resolveExpressCart,
  resolveExpressHost,
  useExpressAvailability,
  useLocalCartVersion,
  type ExpressItem,
} from "@/src/express/react";import {
  pollRevolutStatus,
  readRevolutPublicConfig,
  revolutLocale,
  revolutOrderToken,
  type RevolutPublicConfig,
} from "@/src/express/revolut";
import {
  createRevolutPayments,
  loadRevolutCheckout,
  type RevolutPayButtonStyle,
  type RevolutPaymentEvent,
} from "@/src/express/revolut-sdk";
import {
  readExpressReturn,
  withExpressReturn,
  withoutExpressReturn,
} from "@/src/express/return-url";
import { ExpressStatus, type ExpressPhase } from "./ExpressStatus";

/**
 * Revolut Pay, mounted through the official Revolut Checkout embed script.
 *
 * The SDK is lazy: it loads only after Bitsnap says the provider is available
 * with a public `publicKey`, and only in the browser. The order is created by
 * the server (`createOrder` calls Bitsnap), never by the browser's numbers.
 *
 * A widget `success` event is a UX signal only: the button shows "confirming"
 * and asks Bitsnap (`revolut/status`) until the verified webhook settles the
 * order. Only then are the purchased lines removed from the cart. Cancel,
 * failure and timeout keep the cart exactly as it was.
 */

export type RevolutPaymentOutcome =
  | { status: "completed"; orderId?: string }
  | { status: "pending" }
  | { status: "failed" }
  | { status: "cancelled" };

export type RevolutPayButtonProps = {
  /** Bitsnap project; optional when the page called `setProjectID(...)`. */
  projectID?: string;
  host?: string;
  locale?: string;
  texts?: Partial<CheckoutTexts>;
  appearance?: CheckoutAppearance;
  /** Explicit cart lines for a custom cart layout; omitted: the Bitsnap cart. */
  items?: ExpressItem[];
  /** Product page support: uploads this product (with `quantity`) as the cart. */
  productId?: string;
  quantity?: number;
  country?: string;
  couponCode?: string;
  /** Page the buyer returns to; defaults to the current page. */
  returnUrl?: string;
  cancelUrl?: string;
  /** Official Revolut button appearance. */
  buttonStyle?: RevolutPayButtonStyle;
  className?: string;
  style?: CSSProperties;
  analytics?: AnalyticsOption;
  /** Called with the browser-level outcome; `completed` is server-confirmed. */
  onPaymentResult?: (outcome: RevolutPaymentOutcome) => void;
  fetch?: FetchLike;
  /** Polling bounds for the server confirmation (tests use a fake sleep). */
  confirmation?: {
    timeoutMs?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  };
};

function RevolutPayButtonInner(
  props: RevolutPayButtonProps & { projectID: string },
) {
  const { projectID } = props;
  const host = resolveExpressHost(props.host);
  const locale = props.locale ?? getLocale();
  const instrument = useInstrumentContext();
  const confirmationTimeoutMs = props.confirmation?.timeoutMs;
  const confirmationIntervalMs = props.confirmation?.intervalMs;
  const confirmationSleep = props.confirmation?.sleep;
  const confirmationNow = props.confirmation?.now;
  const buttonStyleKey = JSON.stringify(props.buttonStyle ?? null);
  const cartVersion = useLocalCartVersion();
  const cart = useMemo(
    () =>
      resolveExpressCart({
        ...(props.items != null ? { items: props.items } : {}),
        ...(props.productId != null ? { productId: props.productId } : {}),
        ...(props.quantity != null ? { quantity: props.quantity } : {}),
        ...(props.country != null ? { country: props.country } : {}),
        ...(props.couponCode != null ? { couponCode: props.couponCode } : {}),
      }),
    [
      props.items,
      props.productId,
      props.quantity,
      props.country,
      props.couponCode,
      cartVersion,
    ],
  );
  const signature = [cart.source, cart.items.map((line) => `${line.id}:${line.quantity}`).sort().join(",")].join("|");
  const availability = useExpressAvailability({
    provider: "revolutPay",
    projectID,
    host,
    locale,
    ...(props.items != null ? { items: props.items } : {}),
    ...(props.productId != null ? { productId: props.productId } : {}),
    ...(props.quantity != null ? { quantity: props.quantity } : {}),
    ...(props.country != null ? { country: props.country } : {}),
    ...(props.couponCode != null ? { couponCode: props.couponCode } : {}),
    ...(props.fetch != null ? { fetch: props.fetch } : {}),
  });
  const config: RevolutPublicConfig | undefined =
    availability.provider?.available === true
      ? readRevolutPublicConfig(availability.provider.publicConfig)
      : undefined;
  const environment =
    availability.provider?.environment ?? availability.environment;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<ExpressPhase>("idle");
  const [mountNonce, setMountNonce] = useState(0);
  const mounted = useRef(true);
  /** The canonical total the currently mounted button was created with. */
  const mountedAmount = useRef<
    { cartId: string; currency: string; totalMinor: number } | undefined
  >(undefined);
  /** A phase an async failure already surfaced (so the SDK error cannot hide it). */
  const surfacedPhase = useRef<ExpressPhase | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      config == null ||
      typeof window === "undefined" ||
      containerRef.current == null
    ) {
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    let destroySdk: (() => void) | undefined;

    const local = expressCartLocal(cart, locale, { host, projectID });
    const session = createExpressSession({
      projectID,
      host,
      local,
      ...(props.fetch != null ? { fetch: props.fetch } : {}),
      signal: controller.signal,
    });

    const returnBase = props.returnUrl ?? window.location.href;
    let confirming = false;
    let settled = false;
    const confirm = async (activeSession: ExpressCartSession) => {
      if (!mounted.current || settled) {
        return;
      }
      setPhase("pending");
      const status = await pollRevolutStatus({
        check: () =>
          getRevolutStatus(
            {
              projectID,
              host,
              ...(props.fetch != null ? { fetch: props.fetch } : {}),
              signal: controller.signal,
            },
            activeSession,
          ),
        signal: controller.signal,
        ...(confirmationTimeoutMs != null
          ? { timeoutMs: confirmationTimeoutMs }
          : {}),
        ...(confirmationIntervalMs != null
          ? { intervalMs: confirmationIntervalMs }
          : {}),
        ...(confirmationSleep != null ? { sleep: confirmationSleep } : {}),
        ...(confirmationNow != null ? { now: confirmationNow } : {}),
      });
      if (cancelled || !mounted.current) {
        return;
      }
      if (status?.ok === true && status.status === "completed") {
        settled = true;
        // Purchased lines only; what the buyer added meanwhile stays and a
        // later express attempt uploads it as a new cart.
        activeSession.completePurchase();
        setPhase("confirmed");
        props.onPaymentResult?.({
          status: "completed",
          ...(status.orderId != null ? { orderId: status.orderId } : {}),
        });
        return;
      }
      if (status?.ok === true && status.status === "failed") {
        settled = true;
        activeSession.clearPending();
        setPhase("failed");
        props.onPaymentResult?.({ status: "failed" });
        return;
      }
      if (status?.ok === true && status.status === "cancelled") {
        settled = true;
        activeSession.clearPending();
        setPhase("cancelled");
        props.onPaymentResult?.({ status: "cancelled" });
        return;
      }
      // Unconfirmed (webhook late, old backend, timeout): keep the attempt for
      // the next visit instead of claiming a payment.
      setPhase("pending");
      props.onPaymentResult?.({ status: "pending" });
    };

    const confirmOnce = (activeSession: ExpressCartSession) => {
      if (confirming) {
        return;
      }
      confirming = true;
      void confirm(activeSession).finally(() => {
        confirming = false;
      });
    };

    const handlePayment = (event: RevolutPaymentEvent) => {
      if (event.type === "cancel") {
        instrument.track("payment_returned", {
          gateway: "revolut_pay",
          method: "revolut_pay",
          outcome: "cancel",
        });
        session.clearPending();
        setPhase("cancelled");
        props.onPaymentResult?.({ status: "cancelled" });
        return;
      }
      if (event.type === "error") {
        instrument.track("payment_returned", {
          gateway: "revolut_pay",
          method: "revolut_pay",
          outcome: "fail",
        });
        session.clearPending();
        const surfaced = surfacedPhase.current;
        surfacedPhase.current = undefined;
        setPhase(surfaced ?? "failed");
        if (surfaced == null) {
          props.onPaymentResult?.({ status: "failed" });
        }
        return;
      }
      instrument.track("payment_returned", {
        gateway: "revolut_pay",
        method: "revolut_pay",
        outcome: "pending",
      });
      confirmOnce(session);
    };

    const mount = async () => {
      const ensured = await session.ensure({
        locale,
        ...(environment != null ? { environment } : {}),
      });
      if (cancelled) {
        return;
      }
      if (!ensured.ok) {
        setPhase(
          ensured.code === "revision-conflict"
            ? "cart-conflict"
            : "cart-unavailable",
        );
        return;
      }
      const snapshot = ensured.value.snapshot;
      mountedAmount.current = {
        cartId: snapshot.cartId,
        currency: snapshot.currency,
        totalMinor: snapshot.totalMinor,
      };

      const namespace = await loadRevolutCheckout(config.mode);
      if (cancelled) {
        return;
      }
      const payments = await createRevolutPayments(namespace, {
        publicKey: config.publicKey,
        mode: config.mode,
        locale: revolutLocale(locale),
      });
      if (cancelled) {
        payments.destroy?.();
        return;
      }
      const { revolutPay } = payments;

      let orderInFlight: Promise<{ publicId: string }> | undefined;
      const createOrder = async (): Promise<{ publicId: string }> => {
        if (orderInFlight != null) {
          // A double click must not create two provider orders.
          return orderInFlight;
        }
        orderInFlight = (async () => {
          // The button was mounted with a total. Re-read the canonical cart
          // right before paying: if the server total or currency changed, do
          // not open the provider for the stale amount; remount with the new
          // one and ask the buyer to confirm it.
          const current = await session.ensure({
            locale,
            ...(environment != null ? { environment } : {}),
          });
          if (!current.ok) {
            surfacedPhase.current =
              current.code === "revision-conflict"
                ? "cart-conflict"
                : "cart-unavailable";
            throw new Error(`revolut-cart-${current.code}`);
          }
          if (!sameMountedAmount(current.value.snapshot, mountedAmount.current)) {
            mountedAmount.current = {
              cartId: current.value.snapshot.cartId,
              currency: current.value.snapshot.currency,
              totalMinor: current.value.snapshot.totalMinor,
            };
            surfacedPhase.current = "price-changed";
            setPhase("price-changed");
            setMountNonce((value) => value + 1);
            throw new Error("revolut-amount-changed");
          }

          const result = await startProviderForCart(
            {
              projectID,
              host,
              locale,
              ...(environment != null ? { environment } : {}),
              returnUrl: returnBase,
              cancelUrl: props.cancelUrl ?? returnBase,
              embedOrigin: window.location.origin,
              ...(props.fetch != null ? { fetch: props.fetch } : {}),
            },
            "revolutPay",
            session,
          );
          if (!result.ok) {
            surfacedPhase.current =
              result.code === "revision-conflict"
                ? "cart-conflict"
                : "cart-unavailable";
            throw new Error(`revolut-start-${result.code}`);
          }
          if (!sameMountedAmount(result.value.snapshot, mountedAmount.current)) {
            mountedAmount.current = {
              cartId: result.value.snapshot.cartId,
              currency: result.value.snapshot.currency,
              totalMinor: result.value.snapshot.totalMinor,
            };
            surfacedPhase.current = "price-changed";
            setPhase("price-changed");
            setMountNonce((value) => value + 1);
            throw new Error("revolut-amount-changed");
          }
          instrument.track("payment_submitted", {
            gateway: "revolut_pay",
            method: "revolut_pay",
          });
          return { publicId: revolutOrderToken(result.value.start) };
        })().finally(() => {
          orderInFlight = undefined;
        });
        return orderInFlight;
      };

      revolutPay.mount(containerRef.current, {
        currency: snapshot.currency,
        totalAmount: snapshot.totalMinor,
        createOrder,
        mobileRedirectUrls: {
          success: withExpressReturn(returnBase, {
            provider: "revolutPay",
            cartId: snapshot.cartId,
            result: "success",
          }),
          failure: withExpressReturn(returnBase, {
            provider: "revolutPay",
            cartId: snapshot.cartId,
            result: "failure",
          }),
          cancel: withExpressReturn(returnBase, {
            provider: "revolutPay",
            cartId: snapshot.cartId,
            result: "cancel",
          }),
        },
        ...(props.buttonStyle != null ? { buttonStyle: props.buttonStyle } : {}),
      });
      revolutPay.on("click", () => {
        instrument.track("payment_method_selected", {
          gateway: "revolut_pay",
          method: "revolut_pay",
        });
      });
      revolutPay.on("payment", handlePayment);
      if (!cancelled && mounted.current) {
        setPhase((current) =>
          current === "price-changed" ||
          current === "cart-conflict" ||
          current === "confirmed" ||
          current === "failed" ||
          current === "cancelled"
            ? current
            : "idle",
        );
      }

      destroySdk = () => {
        try {
          revolutPay.destroy();
        } catch {
          // the script may have removed itself
        }
        try {
          payments.destroy?.();
        } catch {
          // nothing to destroy
        }
      };

      // A return from the Revolut app / standalone page, or an attempt left
      // pending by a closed tab: ask the server once, then leave the marker
      // out of the URL.
      const returned = readExpressReturn(window.location.search);
      const pending = activePendingAttempt(session.getRecord());
      const shouldReconcile =
        (pending?.provider === "revolutPay" &&
          (returned.cartId == null || returned.cartId === snapshot.cartId)) ||
        (returned.returned && returned.provider === "revolutPay");
      if (returned.returned) {
        window.history.replaceState(
          {},
          "",
          withoutExpressReturn(window.location.href),
        );
      }
      if (shouldReconcile) {
        await confirm(session);
      }
    };

    void mount().catch(() => {
      if (!cancelled && mounted.current) {
        setPhase("load-failed");
      }
    });

    return () => {
      cancelled = true;
      controller.abort();
      destroySdk?.();
    };
  }, [
    config?.publicKey,
    config?.mode,
    environment,
    locale,
    signature,
    projectID,
    host,
    props.fetch,
    props.returnUrl,
    props.cancelUrl,
    buttonStyleKey,
    confirmationTimeoutMs,
    confirmationIntervalMs,
    confirmationSleep,
    confirmationNow,
    mountNonce,
  ]);

  return (
    <div
      data-bitsnap-express="revolutPay"
      aria-busy={phase === "pending" ? true : undefined}
      className={props.className}
      style={props.style}
    >
      <div ref={containerRef} />
      <ExpressStatus phase={phase} />
    </div>
  );
}

function sameMountedAmount(
  snapshot: { cartId: string; currency: string; totalMinor: number },
  mounted: { cartId: string; currency: string; totalMinor: number } | undefined,
): boolean {
  return (
    mounted != null &&
    snapshot.cartId === mounted.cartId &&
    snapshot.currency === mounted.currency &&
    snapshot.totalMinor === mounted.totalMinor
  );
}

/** Standalone Revolut Pay button for a product or cart page. */
export function RevolutPayButton(props: RevolutPayButtonProps) {
  const projectID = props.projectID ?? currentProjectID();
  const instrument = useInstrument(projectID, props.analytics, "cart");

  useEffect(() => {
    if (props.projectID != null) {
      setProjectID(props.projectID);
    }
  }, [props.projectID]);

  return (
    <InstrumentProvider value={instrument}>
      <CheckoutTextsProvider locale={props.locale} texts={props.texts}>
        <CheckoutAppearanceProvider appearance={props.appearance}>
          {projectID == null ? null : (
            <RevolutPayButtonInner {...props} projectID={projectID} />
          )}
        </CheckoutAppearanceProvider>
      </CheckoutTextsProvider>
    </InstrumentProvider>
  );
}

export default RevolutPayButton;

/** The checkout's own express area uses this variant without wrapping providers. */
export { RevolutPayButtonInner };
