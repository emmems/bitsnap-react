/**
 * Loader and host binding of the official InPost Pay widget.
 *
 * The widget renders the real InPost Pay buttons into `<inpost-izi-button>`
 * elements and the thank-you page into `<inpost-thank-you>`; the protocol is
 * documented fields only: `merchantClientId`, `basketBindingApiKey`,
 * `unboundWidgetClicked` (returns the basket key), `addToBasketClicked`,
 * `handleBasketEvent`, `apiBaseUrl`, `language`.
 *
 * The package is imported lazily in the browser only: its bundle touches
 * `self` at evaluation, so importing it during server rendering would throw.
 */

export type InPostWidgetBasketEvent =
  | "basketDeleted"
  | "basketProductChanged"
  | "orderCreated";

export type InPostWidgetInitOptions = {
  merchantClientId: string;
  /** `undefined` means "unbound"; clicking then has to resolve a key. */
  basketBindingApiKey: string | Promise<string> | undefined;
  unboundWidgetClicked?: (productId?: string) => Promise<string>;
  addToBasketClicked?: (productId?: string) => Promise<void>;
  handleBasketEvent?: (
    event: InPostWidgetBasketEvent,
  ) => boolean | Promise<boolean>;
  apiBaseUrl?: string;
  webView?: boolean;
  language?: string;
  features?: {
    backendDrivenContentEnabled?: boolean;
    isWidgetSplitBoundEnabled?: boolean;
  };
};

export type InPostPayWidgetInstance = {
  refresh: (options?: Partial<InPostWidgetInitOptions>) => void;
  rerender: () => void;
};

export type InPostWidgetNamespace = {
  init: (options: InPostWidgetInitOptions) => InPostPayWidgetInstance;
};

/**
 * The widget adds itself to `window`; the official `.d.ts` declares the same
 * fields, so this file reads them through a local shape instead of augmenting
 * `Window` twice.
 */
type InpostGlobalWindow = Window & {
  InPostPayWidget?: InPostWidgetNamespace;
  __INPOST_PAY_WIDGET__?: InPostPayWidgetInstance;
  __bitsnapInpostOwner?: {
    projectID: string;
    host: string;
    merchantClientId: string;
  };
};

function inpostWindow(): InpostGlobalWindow | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window as InpostGlobalWindow);
}

/** The official placement attribute of the widget's custom element. */
export const INPOST_IZI_BUTTON_TAG = "inpost-izi-button";
export const INPOST_THANK_YOU_TAG = "inpost-thank-you";

/** Official `binding_place` values this SDK exposes. */
export const INPOST_BINDING_PLACES = [
  "PRODUCT_CARD",
  "BASKET_SUMMARY",
  "MINICART_PAGE",
  "CHECKOUT_PAGE",
  "ORDER_CREATE",
  "THANK_YOU_PAGE",
] as const;
export type InPostBindingPlace = (typeof INPOST_BINDING_PLACES)[number];

export function inpostLanguage(locale: string | undefined): "pl" | "en" {
  return locale != null && /^pl\b/i.test(locale) ? "pl" : "en";
}

/** The InPost Pay API base of a sandbox/test configuration. */
export const INPOST_SANDBOX_API_BASE_URL =
  "https://sandbox-inpostpay-widget-api.inpost.pl";

/** The production InPost Pay widget API base. */
export const INPOST_PRODUCTION_API_BASE_URL =
  "https://inpostpay-widget-api.inpost.pl";

export const INPOST_WIDGET_SCRIPT_URL = {
  test: "https://sandbox-inpostpay-widget-v2.inpost.pl/inpostpay.widget.v2.js",
  production: "https://inpostpay-widget-v2.inpost.pl/inpostpay.widget.v2.js",
} as const;

export const INPOST_WIDGET_API_BASE_URL = {
  test: INPOST_SANDBOX_API_BASE_URL,
  production: INPOST_PRODUCTION_API_BASE_URL,
} as const;

export type InPostWidgetEnvironment = "test" | "production";

export type InPostPublicConfig = {
  merchantClientId: string;
  environment: InPostWidgetEnvironment;
  /** The widget API base the browser must talk to. */
  apiBaseUrl: string;
  /** The official script URL of this environment (informational). */
  scriptUrl: string;
  basketBindingApiKey?: string;
  basketId?: string;
};

function widgetEnvironment(
  value: string | undefined,
  fallback: InPostWidgetEnvironment | undefined,
): InPostWidgetEnvironment {
  if (value === "test" || value === "production") {
    return value;
  }
  if (value === "prod" || value === "live") {
    return "production";
  }
  return fallback ?? "production";
}

function isSandboxURL(value: string): boolean {
  return value.includes("sandbox");
}

/**
 * Reads the backend's public InPost configuration. Canonical names are
 * `merchantClientId`, `widgetApiBaseUrl`, `widgetScriptUrl` and `environment`;
 * the older `apiBaseUrl` alias is still accepted. A test cart can never be
 * pointed at the production widget API, and a production cart can never be
 * pointed at the sandbox one.
 */
export function readInpostPublicConfig(
  config: Record<string, string> | undefined,
  fallbackEnvironment?: InPostWidgetEnvironment,
): InPostPublicConfig | undefined {
  if (config == null) {
    return undefined;
  }
  const merchantClientId = config.merchantClientId;
  if (merchantClientId == null || merchantClientId.length === 0) {
    return undefined;
  }
  const environment =
    fallbackEnvironment ?? widgetEnvironment(config.environment, undefined);
  const requestedApiBaseUrl = config.widgetApiBaseUrl ?? config.apiBaseUrl;
  const requestedScriptUrl = config.widgetScriptUrl;
  const apiBaseUrl =
    environment === "test"
      ? requestedApiBaseUrl != null && isSandboxURL(requestedApiBaseUrl)
        ? requestedApiBaseUrl
        : INPOST_WIDGET_API_BASE_URL.test
      : requestedApiBaseUrl != null && !isSandboxURL(requestedApiBaseUrl)
        ? requestedApiBaseUrl
        : INPOST_WIDGET_API_BASE_URL.production;
  const scriptUrl =
    environment === "test"
      ? requestedScriptUrl != null && isSandboxURL(requestedScriptUrl)
        ? requestedScriptUrl
        : INPOST_WIDGET_SCRIPT_URL.test
      : requestedScriptUrl != null && !isSandboxURL(requestedScriptUrl)
        ? requestedScriptUrl
        : INPOST_WIDGET_SCRIPT_URL.production;
  return {
    merchantClientId,
    environment,
    apiBaseUrl,
    scriptUrl,
    ...(config.basketBindingApiKey != null &&
    config.basketBindingApiKey.length > 0
      ? { basketBindingApiKey: config.basketBindingApiKey }
      : {}),
    ...(config.basketId != null && config.basketId.length > 0
      ? { basketId: config.basketId }
      : {}),
  };
}

let widgetLoader: Promise<InPostWidgetNamespace> | undefined;

/** Test seam: drop the cached loader between cases. */
export function resetInpostWidgetLoader(): void {
  widgetLoader = undefined;
  const win = inpostWindow();
  if (win != null) {
    delete win.__bitsnapInpostOwner;
  }
}

/**
 * Loads the widget once per page. Rejects on the server, where the widget has
 * nothing to render into.
 */
export function loadInpostWidget(): Promise<InPostWidgetNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("InPost Pay needs a browser."));
  }
  const alreadyLoaded = inpostWindow()?.InPostPayWidget;
  if (alreadyLoaded != null) {
    return Promise.resolve(alreadyLoaded);
  }
  widgetLoader ??= import("@inpost-pay/widget")
    .then((module: unknown) => {
      const record = module as {
        initialiseInpostPayWidget?: unknown;
        default?:
          | { initialiseInpostPayWidget?: unknown }
          | ((options: InPostWidgetInitOptions) => InPostPayWidgetInstance);
      };
      const fromModule =
        typeof record.initialiseInpostPayWidget === "function"
          ? (record.initialiseInpostPayWidget as InPostWidgetNamespace["init"])
          : typeof record.default === "function"
            ? (record.default as InPostWidgetNamespace["init"])
            : typeof record.default?.initialiseInpostPayWidget === "function"
              ? (record.default
                  .initialiseInpostPayWidget as InPostWidgetNamespace["init"])
              : undefined;
      const namespace = inpostWindow()?.InPostPayWidget;
      if (namespace != null) {
        return namespace;
      }
      if (fromModule != null) {
        return { init: fromModule };
      }
      throw new Error("The InPost Pay widget exposed no init function.");
    })
    .catch((error: unknown) => {
      widgetLoader = undefined;
      throw error;
    });
  return widgetLoader;
}

/**
 * Initialises the widget for one project and reuses an existing instance only
 * when it belongs to the same project, host and merchant client id.
 *
 * The official widget is a page-wide singleton: a second merchant client id on
 * the same page cannot be rendered without taking the first one over, so this
 * function refuses instead of leaking another shop's configuration into the
 * button.
 */
export function initInpostWidget(args: {
  namespace: InPostWidgetNamespace;
  options: InPostWidgetInitOptions;
  owner: { projectID: string; host: string; merchantClientId: string };
  warn?: (message: string) => void;
}): InPostPayWidgetInstance | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const win = window as InpostGlobalWindow;
  const currentOwner = win.__bitsnapInpostOwner;
  const existing = win.__INPOST_PAY_WIDGET__;
  if (existing != null) {
    const sameOwner =
      currentOwner != null &&
      currentOwner.projectID === args.owner.projectID &&
      currentOwner.host === args.owner.host &&
      currentOwner.merchantClientId === args.owner.merchantClientId;
    if (!sameOwner) {
      // A full unmount leaves no widget element behind. Only then may a
      // different project take the page-wide instance over; while an element
      // is still mounted, refuse instead of leaking another shop's config.
      if (hasInpostElements()) {
        args.warn?.(
          "InPost Pay already runs for another project on this page; mount one InPost Pay button per page.",
        );
        return undefined;
      }
      delete win.__INPOST_PAY_WIDGET__;
      delete win.__bitsnapInpostOwner;
    } else {
      // A remount of the same project reuses the singleton, but its callbacks
      // must point at the new component instance (refs and props may differ).
      existing.refresh(args.options);
      return existing;
    }
  }
  const widget = args.namespace.init(args.options);
  win.__INPOST_PAY_WIDGET__ = widget;
  win.__bitsnapInpostOwner = args.owner;
  return widget;
}

function hasInpostElements(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return (
    document.querySelector(
      `${INPOST_IZI_BUTTON_TAG}, ${INPOST_THANK_YOU_TAG}`,
    ) != null
  );
}

/** Attributes of the official `<inpost-izi-button>` custom element. */
export function inpostIziButtonAttributes(args: {
  bindingPlace: InPostBindingPlace;
  productId?: string;
  variation?: string;
}): Record<string, string> {
  return {
    binding_place: args.bindingPlace,
    ...(args.productId != null ? { "data-product-id": args.productId } : {}),
    ...(args.variation != null ? { variation: args.variation } : {}),
  };
}
