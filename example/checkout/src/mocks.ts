/**
 * Deterministic mocks for the checkout example.
 *
 * The library reads the project ID from a `script[data-name="internal-cart"]`
 * tag and talks to `https://bitsnap.pl` through `fetch`, so intercepting both
 * is enough to render every checkout state offline (the payment logos load
 * from this app's `public/logos`).
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

const COUNTRIES = [
  { name: "Poland", code: "PL" },
  { name: "Germany", code: "DE" },
  { name: "France", code: "FR" },
  { name: "Spain", code: "ES" },
];

export const MOCK_PRODUCT_IDS = PRODUCTS.map((product) => product.id);

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
};

/**
 * Generic placeholder logos from `public/logos` (no real brand marks). The
 * cart takes `https:` logo URLs, and `http:` only on localhost, so open the
 * example on `localhost` to see them.
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

    if (url.includes("/public-commerce/products")) {
      if (options.failProducts === true) {
        return json({}, 500);
      }
      let result = PRODUCTS;
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
        result = result.slice(0, -1);
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
