import {
  createElement,
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
import {
  CheckoutAppearanceProvider,
} from "@/src/components/checkout/appearance.context";
import { Bitsnap } from "@/src/components/checkout/methods";
import {
  readLocalCartLines,
  setProjectID,
} from "@/src/components/checkout/CartProvider";
import { getLocale } from "@/src/components/checkout/locale";
import { currentProjectID } from "@/src/components/checkout/project-id";
import type { CheckoutTexts } from "@/src/components/checkout/texts";
import { CheckoutTextsProvider } from "@/src/components/checkout/texts.context";
import { createExpressSession, getInpostStatus, startProviderForCart } from "@/src/express/cart-adapter";
import type { CartSnapshot, ProviderStart } from "@/src/express/contracts";
import type { FetchLike } from "@/src/express/client";
import {
  initInpostWidget,
  inpostIziButtonAttributes,
  inpostLanguage,
  loadInpostWidget,
  readInpostPublicConfig,
  INPOST_IZI_BUTTON_TAG,
  INPOST_THANK_YOU_TAG,
  type InPostBindingPlace,
  type InPostPayWidgetInstance,
  type InPostWidgetBasketEvent,
} from "@/src/express/inpost-widget";
import {
  expressCartLocal,
  expressCartSignature,
  resolveExpressCart,
  resolveExpressHost,
  useExpressAvailability,
  useLocalCartVersion,
  type ExpressItem,
} from "@/src/express/react";
import { pollProviderStatus } from "@/src/express/revolut";
import { ExpressStatus, type ExpressPhase } from "./ExpressStatus";

/**
 * InPost Pay on a product page or in a cart.
 *
 * The button is the official InPost Pay widget: this component renders its
 * documented `<inpost-izi-button>` element, loads the widget lazily in the
 * browser and gives it the documented callbacks. The basket itself is durable
 * on Bitsnap: the first click uploads the cart, binds it through the InPost
 * merchant API (server side) and returns only the basket key the widget needs.
 *
 * Nothing renders unless the backend says the provider is available with a
 * public `merchantClientId`; a 501, an old backend or a missing credential
 * shows no button at all.
 */

export type InPostPayButtonProps = {
  /**
   * The Bitsnap project of the cart. Optional when the page already called
   * `setProjectID(projectID)`; given here it is configured for the page.
   */
  projectID?: string;
  /** Bitsnap host; defaults to the configured one. */
  host?: string;
  locale?: string;
  /** Text overrides, as on `BitsnapCheckout`. */
  texts?: Partial<CheckoutTexts>;
  /** Checkout appearance tokens and slots for the status line. */
  appearance?: CheckoutAppearance;
  /**
   * Explicit cart lines (a custom cart layout that is not the Bitsnap drawer).
   * The SDK uploads and prices them; it never edits the merchant's own state.
   * Omitted: the Bitsnap cart is the basket.
   */
  items?: ExpressItem[];
  /** Product to add to the basket on click (product page placement). */
  productId?: string;
  /** Quantity of `productId`; default 1. */
  quantity?: number;
  /** Official widget placement; defaults to PRODUCT_CARD with `productId`, else BASKET_SUMMARY. */
  bindingPlace?: InPostBindingPlace;
  /** Official widget `variation` attribute (visual variant). */
  variation?: string;
  className?: string;
  style?: CSSProperties;
  /** Analytics of the buttons; on by default, `false` opts out. */
  analytics?: AnalyticsOption;
  /**
   * Called after the browser's `orderCreated` event when the server status has
   * been checked. The event is only a hint: `status` is `completed` only when
   * the signed server-side order state confirms it.
   */
  onOrderCreated?: (info: {
    providerOrderId?: string;
    status?: "pending" | "completed" | "cancelled" | "failed";
  }) => void;
  /** After InPost changed the basket in its app; the canonical snapshot. */
  onBasketChanged?: (snapshot: CartSnapshot) => void;
  /** Test/custom fetch (for example a mocked storefront). */
  fetch?: FetchLike;
  /** Bounds for the server confirmation (tests use a fake sleep). */
  confirmation?: {
    timeoutMs?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  };
};

type ProductUnavailable = { undeliverable: true };

function isProductUnavailable(error: unknown): error is ProductUnavailable {
  return (
    typeof error === "object" &&
    error != null &&
    (error as ProductUnavailable).undeliverable === true
  );
}

function InPostPayButtonInner(props: InPostPayButtonProps & { projectID: string }) {
  const { projectID } = props;
  const host = resolveExpressHost(props.host);
  const locale = props.locale ?? getLocale();
  const instrument = useInstrumentContext();
  const confirmationTimeoutMs = props.confirmation?.timeoutMs;
  const confirmationIntervalMs = props.confirmation?.intervalMs;
  const confirmationSleep = props.confirmation?.sleep;
  const confirmationNow = props.confirmation?.now;
  const cartVersion = useLocalCartVersion();
  const cart = useMemo(
    () =>
      resolveExpressCart({
        ...(props.items != null ? { items: props.items } : {}),
        ...(props.productId != null ? { productId: props.productId } : {}),
        ...(props.quantity != null ? { quantity: props.quantity } : {}),
      }),
    [props.items, props.productId, props.quantity, cartVersion],
  );
  const signature = expressCartSignature(cart);
  const availability = useExpressAvailability({
    provider: "inpostPay",
    projectID,
    host,
    locale,
    ...(props.items != null ? { items: props.items } : {}),
    ...(props.productId != null ? { productId: props.productId } : {}),
    ...(props.quantity != null ? { quantity: props.quantity } : {}),
    ...(props.fetch != null ? { fetch: props.fetch } : {}),
  });
  const provider = availability.provider;
  const environment = provider?.environment ?? availability.environment;
  const config =
    provider?.available === true
      ? readInpostPublicConfig(provider.publicConfig, environment)
      : undefined;
  const merchantClientId = config?.merchantClientId;
  const apiBaseUrl = config?.apiBaseUrl;

  const session = useMemo(
    () =>
      createExpressSession({
        projectID,
        host,
        ...(cart.source === "items"
          ? { local: expressCartLocal(cart, locale, { host, projectID }) }
          : {}),
        ...(props.fetch != null ? { fetch: props.fetch } : {}),
      }),
    [projectID, host, props.fetch, cart, locale],
  );

  const [phase, setPhase] = useState<ExpressPhase>("idle");
  const widgetRef = useRef<InPostPayWidgetInstance | undefined>(undefined);
  const pendingStart = useRef<Promise<ProviderStart> | undefined>(undefined);
  const mounted = useRef(true);
  const confirmingOrder = useRef(false);
  const reportedOrder = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The widget keeps its options for the page's lifetime: callbacks read the
  // latest props and cart through a ref instead of a stale closure.
  const latest = useRef({
    cart,
    locale,
    environment,
    session,
    onOrderCreated: props.onOrderCreated,
    onBasketChanged: props.onBasketChanged,
  });
  latest.current = {
    cart,
    locale,
    environment,
    session,
    onOrderCreated: props.onOrderCreated,
    onBasketChanged: props.onBasketChanged,
  };

  const startBinding = useCallback(async (): Promise<ProviderStart> => {
    if (pendingStart.current != null) {
      return pendingStart.current;
    }
    const start = startProviderForCart(
      {
        projectID,
        host,
        locale: latest.current.locale,
        ...(latest.current.environment != null
          ? { environment: latest.current.environment }
          : {}),
        ...(typeof window !== "undefined"
          ? {
              returnUrl: window.location.href,
              cancelUrl: window.location.href,
              embedOrigin: window.location.origin,
            }
          : {}),
        ...(props.fetch != null ? { fetch: props.fetch } : {}),
      },
      "inpostPay",
      latest.current.session,
    )
      .then((result) => {
        if (!result.ok) {
          setPhase(
            result.code === "revision-conflict"
              ? "cart-conflict"
              : "cart-unavailable",
          );
          throw new Error(`inpost-start-${result.code}`);
        }
        instrument.track("payment_submitted", {
          gateway: "inpost_pay",
          method: "inpost_pay",
        });
        return result.value.start;
      })
      .finally(() => {
        pendingStart.current = undefined;
      });
    pendingStart.current = start;
    return start;
  }, [projectID, host, instrument, props.fetch]);

  /** Adds the product to the SDK basket once; a failure is "undeliverable". */
  const ensureProduct = useCallback(async (productId: string) => {
    const present = readLocalCartLines().some(
      (line) => line.productID === productId,
    );
    if (present) {
      return;
    }
    if (latest.current.cart.source === "items") {
      return;
    }
    const error = await Bitsnap.addProductToCart(
      productId,
      latest.current.cart.productQuantity,
    );
    if (error != null) {
      throw { undeliverable: true } satisfies ProductUnavailable;
    }
  }, []);

  const unboundWidgetClicked = useCallback(
    async (productId?: string): Promise<string> => {
      instrument.track("payment_method_selected", {
        gateway: "inpost_pay",
        method: "inpost_pay",
      });
      try {
        if (productId != null) {
          await ensureProduct(productId);
        }
        const start = await startBinding();
        const basketBindingApiKey = start.publicConfig?.basketBindingApiKey;
        if (basketBindingApiKey == null || basketBindingApiKey.length === 0) {
          throw new Error("inpost-start-without-basket-key");
        }
        latest.current.session.storeInpostBindingApiKey(basketBindingApiKey);
        setPhase("idle");
        return basketBindingApiKey;
      } catch (error) {
        if (isProductUnavailable(error)) {
          setPhase("product-unavailable");
          // The widget's documented sentinel: no error popup for this product.
          throw new Error("UNDELIVERABLE_PRODUCT");
        }
        setPhase(
          error instanceof Error &&
            error.message === "inpost-start-revision-conflict"
            ? "cart-conflict"
            : "cart-unavailable",
        );
        throw error instanceof Error ? error : new Error("inpost-pay-failed");
      }
    },
    [ensureProduct, instrument, startBinding],
  );

  const addToBasketClicked = useCallback(
    async (productId?: string): Promise<void> => {
      const id = productId ?? latest.current.cart.productId;
      if (id == null) {
        return;
      }
      try {
        const error = await Bitsnap.addProductToCart(
          id,
          latest.current.cart.productQuantity,
        );
        if (error != null) {
          throw { undeliverable: true } satisfies ProductUnavailable;
        }
        // The durable cart is updated now; the bound InPost basket follows
        // through the server-side outbox, never from the browser.
        await latest.current.session.ensure({
          locale: latest.current.locale,
          ...(latest.current.environment != null
            ? { environment: latest.current.environment }
            : {}),
        });
      } catch (error) {
        setPhase("product-unavailable");
        if (isProductUnavailable(error)) {
          throw new Error("UNDELIVERABLE_PRODUCT");
        }
        throw error instanceof Error ? error : new Error("inpost-pay-failed");
      }
    },
    [],
  );

  /**
   * `orderCreated` is only a hint. The cart is cleared only after the server
   * status (signed InPost order events) says the order is paid. A pending or
   * unconfirmed answer keeps the cart and the attempt for the next visit; a
   * failed check keeps everything as it was.
   */
  const confirmInpostOrder = useCallback(async () => {
    if (confirmingOrder.current) {
      return;
    }
    confirmingOrder.current = true;
    try {
      const active = latest.current.session;
      const pending = active.getPendingAttempt();
      if (pending?.provider !== "inpostPay") {
        return;
      }
      if (mounted.current) {
        setPhase("pending");
      }
      const status = await pollProviderStatus({
        check: () =>
          getInpostStatus(
            {
              projectID,
              host,
              ...(props.fetch != null ? { fetch: props.fetch } : {}),
            },
            active,
          ),
        timeoutMs: confirmationTimeoutMs ?? 20_000,
        intervalMs: confirmationIntervalMs ?? 1_500,
        ...(confirmationSleep != null ? { sleep: confirmationSleep } : {}),
        ...(confirmationNow != null ? { now: confirmationNow } : {}),
      });
      if (!mounted.current) {
        return;
      }
      const providerOrderId = pending.providerOrderId;
      if (status?.ok === true && status.status === "completed") {
        const snapshot = await active.reconcileFromServer();
        const lines = snapshot.ok
          ? snapshot.value.lines.map((line) => ({
              id: line.productId,
              quantity: line.quantity,
            }))
          : pending.lines;
        if (lines.length > 0) {
          active.completePurchase(lines);
        }
        setPhase("confirmed");
        instrument.track("payment_returned", {
          gateway: "inpost_pay",
          method: "inpost_pay",
          outcome: "pending",
        });
        if (!reportedOrder.current) {
          reportedOrder.current = true;
          latest.current.onOrderCreated?.({
            ...(providerOrderId != null ? { providerOrderId } : {}),
            status: "completed",
          });
        }
        return;
      }
      if (status?.ok === true && status.status === "failed") {
        active.clearPending();
        setPhase("failed");
        if (!reportedOrder.current) {
          reportedOrder.current = true;
          latest.current.onOrderCreated?.({
            ...(providerOrderId != null ? { providerOrderId } : {}),
            status: "failed",
          });
        }
        return;
      }
      if (status?.ok === true && status.status === "cancelled") {
        active.clearPending();
        setPhase("cancelled");
        if (!reportedOrder.current) {
          reportedOrder.current = true;
          latest.current.onOrderCreated?.({
            ...(providerOrderId != null ? { providerOrderId } : {}),
            status: "cancelled",
          });
        }
        return;
      }
      // Still pending, an old backend without the status route, or a failed
      // check: never claim a payment, never clear the cart. The attempt stays
      // stored so a later mount can ask again.
      setPhase("pending");
      if (!reportedOrder.current) {
        reportedOrder.current = true;
        latest.current.onOrderCreated?.({
          ...(providerOrderId != null ? { providerOrderId } : {}),
          status: "pending",
        });
      }
    } finally {
      confirmingOrder.current = false;
    }
  }, [
    confirmationIntervalMs,
    confirmationNow,
    confirmationSleep,
    confirmationTimeoutMs,
    host,
    instrument,
    projectID,
    props.fetch,
  ]);

  const handleBasketEvent = useCallback(
    async (event: InPostWidgetBasketEvent): Promise<boolean> => {
      if (event === "basketProductChanged") {
        // InPost is authoritative for what changed in its app: adopt the
        // canonical snapshot so the page shows the same basket.
        const result = await latest.current.session.reconcileFromServer();
        if (result.ok) {
          latest.current.onBasketChanged?.(result.value);
        }
        return true;
      }
      if (event === "orderCreated") {
        // Hint only: ask the server in the background, but keep the widget's
        // callback synchronous enough not to block its own UI.
        void confirmInpostOrder();
        return true;
      }
      // `basketDeleted`: the buyer unbound the basket in the app. The cart
      // stays; a later click binds it again.
      return true;
    },
    [confirmInpostOrder],
  );

  // Recover a payment attempt left pending by a reload, a closed tab or a
  // missed browser event: ask the server once per mount. Nothing is cleared
  // unless the server reports `completed`.
  useEffect(() => {
    if (provider?.available !== true) {
      return;
    }
    if (session.getPendingAttempt()?.provider !== "inpostPay") {
      return;
    }
    void confirmInpostOrder();
  }, [provider?.available, session, confirmInpostOrder]);

  useEffect(() => {
    if (
      provider?.available !== true ||
      merchantClientId == null ||
      merchantClientId.length === 0 ||
      typeof window === "undefined"
    ) {
      return;
    }
    let cancelled = false;
    loadInpostWidget()
      .then((namespace) => {
        if (cancelled) {
          return;
        }
        const widget = initInpostWidget({
          namespace,
          owner: { projectID, host, merchantClientId },
          options: {
            merchantClientId,
            basketBindingApiKey: session.getInpostBindingApiKey(),
            unboundWidgetClicked,
            ...(cart.source === "product" || props.productId != null
              ? { addToBasketClicked }
              : {}),
            handleBasketEvent,
            ...(apiBaseUrl != null ? { apiBaseUrl } : {}),
            language: inpostLanguage(locale),
          },
        });
        if (widget == null) {
          setPhase("cart-unavailable");
          return;
        }
        widgetRef.current = widget;
        // A remount reuses the page-wide widget; re-render the new element.
        widget.rerender();
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("load-failed");
        }
      });
    return () => {
      cancelled = true;
      widgetRef.current = undefined;
    };
  }, [
    provider?.available,
    merchantClientId,
    apiBaseUrl,
    locale,
    projectID,
    host,
    session,
    unboundWidgetClicked,
    addToBasketClicked,
    handleBasketEvent,
    cart.source,
    props.productId,
  ]);

  // Keep the widget's basket count in step with the cart after edits.
  useEffect(() => {
    widgetRef.current?.refresh({
      basketBindingApiKey: session.getInpostBindingApiKey(),
    });
  }, [signature, session]);

  if (
    provider?.available !== true ||
    merchantClientId == null ||
    merchantClientId.length === 0
  ) {
    return <ExpressStatus phase={phase === "idle" ? "idle" : phase} />;
  }

  const bindingPlace: InPostBindingPlace =
    props.bindingPlace ??
    (props.productId != null ? "PRODUCT_CARD" : "BASKET_SUMMARY");

  return (
    <div
      data-bitsnap-express="inpostPay"
      aria-busy={phase === "pending" ? true : undefined}
      className={props.className}
      style={props.style}
    >
      {bindingPlace === "THANK_YOU_PAGE"
        ? createElement(INPOST_THANK_YOU_TAG, {
            ...(props.variation != null ? { variation: props.variation } : {}),
          })
        : createElement(
            INPOST_IZI_BUTTON_TAG,
            inpostIziButtonAttributes({
              bindingPlace,
              ...(props.productId != null ? { productId: props.productId } : {}),
              ...(props.variation != null ? { variation: props.variation } : {}),
            }),
          )}
      <ExpressStatus phase={phase} />
    </div>
  );
}

/**
 * Standalone InPost Pay button for a product or cart page. Inside
 * `<BitsnapCheckout>` the checkout renders this component itself.
 */
export function InPostPayButton(props: InPostPayButtonProps) {
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
            <InPostPayButtonInner {...props} projectID={projectID} />
          )}
        </CheckoutAppearanceProvider>
      </CheckoutTextsProvider>
    </InstrumentProvider>
  );
}

export default InPostPayButton;

/** The checkout's own express area uses this variant without wrapping providers. */
export { InPostPayButtonInner };
