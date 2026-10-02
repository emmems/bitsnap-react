/**
 * Deterministic mocks for the checkout example.
 *
 * The library reads the project ID from a `script[data-name="internal-cart"]`
 * tag and talks to `https://bitsnap.pl` through `fetch`, so intercepting both
 * is enough to render every checkout state offline.
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
  },
  {
    id: "ebook-1",
    name: "Ebook: shipping analytics",
    description: null,
    price: 4900,
    currency: "PLN",
    metadata: {},
    image_url: image("#10b981", "C"),
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
};

export function installCheckoutMocks(options: MockOptions = {}) {
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
      return json({
        success: true,
        result: PRODUCTS,
      });
    }

    if (url.includes("/public-commerce/countries")) {
      return json(COUNTRIES);
    }

    if (url.includes("/public-commerce/buy")) {
      if (options.unavailableProducts === true) {
        return json({ itemIds: ["course-1"] }, 400);
      }

      return json({ url: "https://example.com/pay", sessionID: "demo" });
    }

    throw new Error(`[mock] unhandled request: ${url} ${init?.method ?? "GET"}`);
  };
}

export function seedCart(productIDs: string[] = MOCK_PRODUCT_IDS) {
  localStorage.setItem(
    "checkout",
    JSON.stringify({
      country: "PL",
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
