import { create, toBinary } from "@bufbuild/protobuf";
import { GetPreOrderDetailsResponseSchema } from "@/src/gen/proto/public/v1/public_api_pb";
import type { CartSnapshot } from "@/src/express/contracts";

export type RecordedCall = {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
};

export type MockDeliveryMethod = {
  id: string;
  amount: number;
  name: string;
  description?: string;
  minDays?: number;
  maxDays?: number;
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function snapshotOf(args: {
  items: Array<{ id: string; quantity: number }>;
  revision?: number;
  cartId?: string;
  currency?: string;
  environment?: "test" | "production";
  deliveryMinor?: number;
}): CartSnapshot {
  const currency = args.currency ?? "PLN";
  const lines = args.items.map((item, index) => ({
    lineId: `${item.id}:${index}`,
    productId: item.id,
    variantId: "",
    quantity: item.quantity,
    name: item.id,
    unitPriceMinor: 2500,
    lineTotalMinor: 2500 * item.quantity,
    currency,
  }));
  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const deliveryMinor = args.deliveryMinor ?? 0;
  return {
    cartId: args.cartId ?? "cart-1",
    revision: args.revision ?? 0,
    status: "open",
    environment: args.environment ?? "test",
    currency,
    locale: "pl-PL",
    lines,
    subtotalMinor,
    deliveryMinor,
    discountMinor: 0,
    totalMinor: subtotalMinor + deliveryMinor,
    expiresAt: 1,
  };
}

export type ExpressMockOptions = {
  availability?: {
    inpostPay?: Record<string, unknown>;
    revolutPay?: Record<string, unknown>;
    adyen?: Record<string, unknown>;
  };
  /** The canonical server snapshot returned by cart read/write. */
  snapshot?: () => CartSnapshot;
  cartWrite?: (body: { cartId?: string }, snapshot: CartSnapshot) =>
    | { status: number; body: unknown }
    | undefined;
  inpostStart?: unknown;
  inpostStatus?: unknown;
  revolutStart?: unknown;
  revolutStatus?: unknown;
  /** Delivery methods quoted by the public pre-order API; empty by default. */
  deliveryMethods?: MockDeliveryMethod[];
  /** Simulates an unavailable delivery quote (public API failure). */
  deliveryQuoteUnavailable?: boolean;
  products?: unknown[];
  availabilityStatus?: number;
};

export function installExpressMocks(options: ExpressMockOptions = {}) {
  const calls: RecordedCall[] = [];
  const DEFAULT = {
    available: true,
    environment: "test",
    reasons: [],
  };
  let created = false;

  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    let body: unknown;
    if (typeof init?.body === "string") {
      body = JSON.parse(init.body);
    }
    calls.push({ url, method, body, headers });

    if (url.includes("/api/rpc/") && url.includes("GetPreOrderDetails")) {
      if (options.deliveryQuoteUnavailable === true) {
        return new Response("unavailable", { status: 500 });
      }
      const methods = options.deliveryMethods ?? [];
      const response = create(GetPreOrderDetailsResponseSchema, {
        methods: methods.map((method) => ({
          id: method.id,
          amount: method.amount,
          name: method.name,
          ...(method.description != null
            ? { description: method.description }
            : {}),
          ...(method.minDays != null ? { minDays: method.minDays } : {}),
          ...(method.maxDays != null ? { maxDays: method.maxDays } : {}),
        })),
        ...(methods[0] != null
          ? { selectedDeliveryMethod: methods[0].id }
          : {}),
        currency: "PLN",
        country: "PL",
      });
      return new Response(
        toBinary(GetPreOrderDetailsResponseSchema, response),
        {
          status: 200,
          headers: { "Content-Type": "application/proto" },
        },
      );
    }

    if (url.includes("/public-commerce/express/availability")) {
      if (options.availabilityStatus != null) {
        return json({ success: false, code: "not-implemented" }, options.availabilityStatus);
      }
      return json({
        success: true,
        environment: "test",
        providers: {
          inpostPay: {
            ...DEFAULT,
            publicConfig: { merchantClientId: "mc-1" },
            ...options.availability?.inpostPay,
          },
          revolutPay: {
            ...DEFAULT,
            publicConfig: { publicKey: "pk_test", mode: "sandbox" },
            ...options.availability?.revolutPay,
          },
          adyen: { ...DEFAULT, available: false, reasons: ["adapter"] },
        },
      });
    }

    if (url.includes("/public-commerce/express/cart-snapshot")) {
      return json({ success: true, snapshot: (options.snapshot ?? (() => snapshotOf({ items: [] })))() });
    }

    if (url.includes("/public-commerce/express/cart")) {
      const writeBody = body as { cartId?: string };
      const snapshot = (options.snapshot ?? (() => snapshotOf({ items: [] })))();
      const custom = options.cartWrite?.(writeBody, snapshot);
      if (custom != null) {
        return json(custom.body, custom.status);
      }
      if (writeBody.cartId == null) {
        created = true;
        return json({ success: true, cartToken: "tok-1", snapshot });
      }
      return json({ success: true, snapshot: { ...snapshot, revision: snapshot.revision + 1 } });
    }

    if (url.includes("/public-commerce/express/inpost/start")) {
      if (options.inpostStart === undefined || options.inpostStart === "501") {
        return json(
          { success: false, provider: "inpostPay", code: "not-implemented", message: "old" },
          options.inpostStart === "501" ? 501 : 200,
        );
      }
      return json(options.inpostStart);
    }

    if (url.includes("/public-commerce/express/revolut/start")) {
      if (options.revolutStart === undefined) {
        return json(
          { success: false, provider: "revolutPay", code: "not-implemented", message: "old" },
          501,
        );
      }
      return json(options.revolutStart);
    }

    if (url.includes("/public-commerce/express/revolut/status")) {
      return json(options.revolutStatus ?? {
        success: true,
        provider: "revolutPay",
        status: "pending",
      });
    }

    if (url.includes("/public-commerce/express/inpost/status")) {
      return json(options.inpostStatus ?? {
        success: true,
        provider: "inpostPay",
        status: "pending",
      });
    }

    if (url.includes("/public-commerce/products")) {
      return json({ success: true, result: options.products ?? [] });
    }

    if (url.includes("/public-commerce/countries")) {
      return json([]);
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  return {
    calls,
    callsTo: (fragment: string) => calls.filter((call) => call.url.includes(fragment)),
    wasCartCreated: () => created,
  };
}

export function installProjectScript(projectID: string) {
  const script = document.createElement("script");
  script.setAttribute("data-id", projectID);
  script.setAttribute("data-name", "internal-cart");
  document.head.appendChild(script);
}

export function seedLocalCart(items: Array<{ id: string; quantity: number }>) {
  localStorage.setItem(
    "checkout",
    JSON.stringify({
      country: "PL",
      products: items.map((item, index) => ({
        id: `${item.id}-${index}`,
        productID: item.id,
        quantity: item.quantity,
      })),
    }),
  );
}

export function readLocalCart(): Array<{ productID: string; quantity: number }> {
  const raw = localStorage.getItem("checkout");
  if (raw == null) {
    return [];
  }
  const parsed = JSON.parse(raw) as {
    products?: Array<{ productID: string; quantity: number }>;
  };
  return parsed.products ?? [];
}
