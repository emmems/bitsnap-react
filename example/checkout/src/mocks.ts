/**
 * Deterministic mocks for the checkout example.
 *
 * The library reads the project ID from a `script[data-name="internal-cart"]`
 * tag and talks to `https://bitsnap.pl` through `fetch`, so intercepting both
 * is enough to render every checkout state offline (with `?logos=1` the API
 * moves to this page's origin, which serves the payment logos from
 * `public/logos`).
 */

const PROJECT_ID = "example-project";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  metadata: Record<string, string>;
  image_url: string | null;
  isDeliverable?: boolean;
  availableQuantity?: number;
  pricing?: unknown;
};

const image = (color: string, label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="${color}"/><text x="60" y="66" font-family="sans-serif" font-size="22" fill="#ffffff" text-anchor="middle">${label}</text></svg>`,
  )}`;

const PRODUCTS: Product[] = [
  {
    id: "course-1",
    name: "Product analytics basics",
    description: null,
    price: 9900,
    currency: "PLN",
    metadata: {},
    image_url: image("#6366f1", "A"),
    isDeliverable: false,
  },
  {
    id: "course-2",
    name: "Advanced product analytics",
    description: null,
    price: 14900,
    currency: "PLN",
    metadata: {},
    image_url: image("#0ea5e9", "B"),
    isDeliverable: true,
    // On sale: struck regular price, sale price and the Omnibus line.
    pricing: {
      regularPrice: 17900,
      effectivePrice: 14900,
      currency: "PLN",
      discount: { id: "d1", type: "FIXED", value: 3000, status: "ACTIVE" },
      referencePrice: { amount: 16900, windowDays: 30, asOf: 0, basis: "observed-history", historyAvailable: true },
      priceVersion: "v1",
    },
  },
  {
    id: "ebook-1",
    name: "Ebook: shipping analytics",
    description: null,
    price: 4900,
    currency: "PLN",
    metadata: {},
    // No image: the cart shows its placeholder tile.
    image_url: null,
  },
];

/** Extra lines for `?cart=many`: a cart long enough to scroll (one name with Polish diacritics). */
const MANY_PRODUCTS: Product[] = [
  ["Zażółć gęślą jaźń: e-book", "#a855f7", "Ż"],
  ["Workshop recording, part 1", "#f97316", "1"],
  ["Workshop recording, part 2", "#ef4444", "2"],
  ["Templates pack", "#14b8a6", "T"],
  ["Mentoring session (60 min)", "#84cc16", "M"],
  ["Community access, one year", "#e11d48", "C"],
  ["Printed workbook", "#0284c7", "W"],
].map(([name, color, label], index) => ({
  id: `many-${index + 1}`,
  name,
  description: null,
  price: 2900 + index * 1000,
  currency: "PLN",
  metadata: {},
  image_url: image(color, label),
  isDeliverable: false,
}));

const COUNTRIES = [
  { name: "Poland", code: "PL" },
  { name: "Germany", code: "DE" },
  { name: "France", code: "FR" },
  { name: "Spain", code: "ES" },
];

export const MOCK_PRODUCT_IDS = PRODUCTS.map((product) => product.id);
export const MANY_PRODUCT_IDS = [...MOCK_PRODUCT_IDS, ...MANY_PRODUCTS.map((product) => product.id)];
/** `?express=1`: no deliverable line, so Revolut Pay (no shipping address) can show too. */
export const EXPRESS_PRODUCT_IDS = ["course-1", "ebook-1"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export type MockOptions = {
  /** Makes the checkout action answer with "item-ids-not-found". */
  unavailableProducts?: boolean;
  /** Delays the mocked responses so the loading state can be inspected. */
  latencyMs?: number;
  /** Makes `/products` fail, for the "could not load" state. */
  failProducts?: boolean;
  /** Raises a sale price, so a stored cart view shows "price updated". */
  priceChange?: boolean;
  /** Leaves the last product out of `/products`: an unavailable row. */
  missingProduct?: boolean;
  /** `/buy` never answers: the busy "Go to checkout" button. */
  pendingBuy?: boolean;
  /** Delays only `/countries`, so the "choose a country" hint can be seen. */
  countriesLatencyMs?: number;
  /** The payment-method choice with cash on delivery and server-picked logos in every card. */
  paymentLogos?: boolean;
  /**
   * Apple Pay, Google Pay, InPost Pay and Revolut Pay answer "available" (test
   * mode). The buttons are the providers' own: their scripts load from the
   * providers, nothing is drawn here. Apple Pay also needs `ApplePaySession`,
   * which only Safari has; the example stubs it so Chromium shows the button.
   */
  express?: boolean;
};

/** Protobuf wire format, enough for the two RPC answers `?express=1` needs. */
function protoString(field: number, value: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  return [(field << 3) | 2, bytes.length, ...bytes];
}

/** `IsOneClickPaymentAvailableResponse`: Apple Pay, Google Pay (TEST gateway of Google's docs), InPost Pay. */
function oneClickAvailable(): Uint8Array<ArrayBuffer> {
  const config = [
    ...protoString(1, "01234567890123456789"),
    ...protoString(2, "Example shop"),
    ...protoString(3, "example"),
    ...protoString(4, "exampleGatewayMerchantId"),
  ];
  return new Uint8Array([0x08, 1, 0x10, 1, 0x18, 1, 0x22, config.length, ...config]);
}

function varint(value: number): number[] {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  return [...bytes, value];
}

/** `GetPreOrderDetailsResponse`: no delivery methods, the cart's total (Google Pay needs one). */
function preOrderDetails(totalMinor: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0x20, ...varint(totalMinor), ...protoString(6, "PLN"), ...protoString(7, "PL")]);
}

function proto(body: Uint8Array<ArrayBuffer>) {
  return new Response(body, { status: 200, headers: { "Content-Type": "application/proto" } });
}

function expressSnapshot(body: { items?: { id: string; quantity: number }[] }) {
  const lines = (body.items ?? []).map((item, index) => {
    const product = [...PRODUCTS, ...MANY_PRODUCTS].find((entry) => entry.id === item.id);
    const unit = product?.price ?? 0;
    return {
      lineId: `line-${index}`,
      productId: item.id,
      variantId: item.id,
      quantity: item.quantity,
      name: product?.name ?? item.id,
      unitPriceMinor: unit,
      lineTotalMinor: unit * item.quantity,
      currency: "PLN",
    };
  });
  const total = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  return {
    cartId: "example-cart",
    revision: 1,
    status: "open",
    environment: "test",
    currency: "PLN",
    locale: "pl",
    lines,
    subtotalMinor: total,
    deliveryMinor: 0,
    discountMinor: 0,
    totalMinor: total,
    expiresAt: Date.now() + 3_600_000,
  };
}

/**
 * Generic placeholder logos from `public/logos` (no real brand marks). The
 * cart keeps only logos from the API origin (or bitsnap.pl), and `http:` only
 * when that API origin is itself http on localhost, so with `?logos=1` the
 * mock API moves to this page's origin (`data-custom-host`): open the example
 * on `localhost` to see them.
 */
function paymentLogos() {
  const logo = (id: string, width: number, chip?: boolean) => ({
    id,
    src: `${window.location.origin}/logos/${id}.svg`,
    alt: id,
    width,
    height: 20,
    ...(chip ? { chip } : {}),
  });
  return {
    online: [logo("pay", 48), logo("card", 56, true), logo("bank", 56, true)],
    manual: [logo("bank", 56, true), logo("phone", 56)],
    cod: [logo("cash", 48)],
  };
}

export function installCheckoutMocks(options: MockOptions = {}) {
  // Screenshot scripts flip an option on a live page: `window.__checkoutMocks.priceChange = true`.
  (window as unknown as { __checkoutMocks: MockOptions }).__checkoutMocks = options;
  const script = document.createElement("script");
  script.setAttribute("data-id", PROJECT_ID);
  script.setAttribute("data-name", "internal-cart");
  if (options.paymentLogos === true) {
    // The mock API answers on this origin, which also serves the logos.
    script.setAttribute("data-custom-host", window.location.origin);
  }
  document.head.appendChild(script);

  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (options.latencyMs != null) {
      await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    }

    if (options.express === true) {
      if (url.endsWith("/IsOneClickPaymentAvailable")) {
        return proto(oneClickAvailable());
      }
      if (url.endsWith("/GetPreOrderDetails")) {
        // The `?express=1` cart: course-1 × 1 + ebook-1 × 2.
        return proto(preOrderDetails(9900 + 2 * 4900));
      }
      if (url.includes("/api/rpc/")) {
        // Every other RPC (GetPreOrderDetails, ...): an empty answer.
        return proto(new Uint8Array());
      }
      if (url.includes("/public-commerce/express/availability")) {
        const provider = (publicConfig: Record<string, string>) => ({
          available: true,
          environment: "test",
          reasons: [],
          publicConfig,
        });
        return json({
          success: true,
          environment: "test",
          providers: {
            inpostPay: provider({ merchantClientId: "example-merchant" }),
            revolutPay: provider({ publicKey: "pk_example", mode: "sandbox" }),
            adyen: { available: false, environment: "test", reasons: [] },
          },
        });
      }
      if (url.includes("/public-commerce/express/cart")) {
        const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
        return json({ success: true, cartToken: "example-token", snapshot: expressSnapshot(body) });
      }
    }

    if (url.includes("/public-commerce/products")) {
      if (options.failProducts === true) {
        return json({}, 500);
      }
      const ids = new URL(url, window.location.href).searchParams.get("ids")?.split(",");
      let result = [...PRODUCTS, ...MANY_PRODUCTS].filter(
        (product) => ids == null || ids.includes(product.id),
      );
      if (options.priceChange === true) {
        // The sale price went up, with a new price version.
        result = result.map((product) =>
          product.id === "course-2"
            ? {
                ...product,
                price: 15900,
                pricing: { ...(product.pricing as object), effectivePrice: 15900, priceVersion: "v2" },
              }
            : product,
        );
      }
      if (options.missingProduct === true) {
        result = result.filter((product) => product.id !== "ebook-1");
      }
      return json({
        success: true,
        result,
      });
    }

    if (url.includes("/public-commerce/countries")) {
      if (options.countriesLatencyMs != null) {
        await new Promise((resolve) => setTimeout(resolve, options.countriesLatencyMs));
      }
      return json(COUNTRIES);
    }

    if (url.includes("/public-commerce/payment-methods")) {
      if (options.paymentLogos === true) {
        return json({
          success: true,
          choice: {
            methods: ["online", "manual", "cod"],
            manualAccountTypes: ["bankTransfer", "blik"],
            logos: paymentLogos(),
          },
        });
      }
      return json({ success: true, choice: { methods: ["online", "manual"], manualAccountTypes: ["blik"] } });
    }

    if (url.includes("/public-commerce/buy")) {
      if (options.pendingBuy === true) {
        return new Promise<Response>(() => {});
      }
      if (options.unavailableProducts === true) {
        return json({ itemIds: ["course-1"] }, 400);
      }

      return json({ url: "https://example.com/pay", sessionID: "demo" });
    }

    throw new Error(`[mock] unhandled request: ${url} ${init?.method ?? "GET"}`);
  };
}

/** `country: ""` is a cart with no country chosen (a missing one reads as "PL"). */
export function seedCart(productIDs: string[] = MOCK_PRODUCT_IDS, country = "PL") {
  localStorage.setItem(
    "checkout",
    JSON.stringify({
      country,
      couponCode: undefined,
      email: undefined,
      selectedDeliveryMethod: undefined,
      postalCode: undefined,
      googlePayConfig: undefined,
      products: productIDs.map((id, index) => ({
        id: `${id}-${index}`,
        productID: id,
        quantity: index + 1,
        metadata: undefined,
      })),
    }),
  );
}

export function clearCart() {
  localStorage.removeItem("checkout");
}
