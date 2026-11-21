import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { create, toBinary } from "@bufbuild/protobuf";
import { resetTracker } from "@/src/analytics/core";
import { setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import { IsOneClickPaymentAvailableResponseSchema } from "src/gen/proto/public/v1/public_api_pb";

/*
 * Class graph of the cart (PLAN D5, P15; part 2 step 7a; review S3).
 *
 * `cart.css` is hand-written and holds no Tailwind utilities, so a class name
 * the cart renders works only if it is a `bsc-*` class, the `bitsnap-react`
 * scope, the root's theme marker (`dark`, `light`, on the root only) or the
 * merchant's own (`appearance.elements`, the trigger's `className`).
 *
 * Two checks:
 * 1. Rendered: mounts `BitsnapCheckout` (trigger included) and drives it into
 *    every state it can reach in jsdom: both presentations with lines, a
 *    product link, a sale with its Omnibus line, a unit price, two countries
 *    and the payment-method choice; the express area (the real
 *    `CartExpressArea` wrappers, with `ExpressStatus` in an alert and a status
 *    phase next to them) and its "or" divider; a price-updated line with the
 *    wallets-updating and review notices; an unavailable row; the busy and the
 *    failed "Next step"; the inline refresh error; the loading, failed and
 *    empty states. Every class token in the document is checked, and each
 *    scenario asserts that its state rendered, so a state that silently stops
 *    rendering fails here instead of passing unchecked.
 * 2. Static backstop: every string literal inside a `className=` attribute or
 *    a `cx(` call in the files the `/cart` import graph reaches from
 *    `CartComponent` and `CartFrame` must be a `bsc-*` class or in
 *    `STATIC_ALLOWED`. This catches a Tailwind utility in a branch the
 *    rendered check cannot reach.
 */

/** The cart's own classes; `dark` and `light` are allowed on the root only. */
const OURS = /^(bsc-[\w-]+|bitsnap-react)$/;
const ROOT_ONLY = new Set(["dark", "light"]);

const page = setupReactPage();

Object.assign(page.win, {
  matchMedia: (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }),
});

// "Next step" goes on only after every price was on screen for a second.
const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;

/** Apple Pay's session class: its presence makes the Apple Pay wrapper render. */
class FakeApplePaySession {
  static STATUS_SUCCESS = 0;
  static STATUS_FAILURE = 1;
  static canMakePayments = () => true;
  begin() {}
  abort() {}
}

/**
 * A ResizeObserver the test can fire, so the "or" divider (shown once an
 * express wrapper has a height) renders. jsdom lays nothing out: a wrapper
 * reports a height through the patched `getBoundingClientRect` below.
 */
const observers = new Set<{ fire: () => void }>();
class RecordingResizeObserver {
  private elements = new Set<Element>();
  constructor(private callback: ResizeObserverCallback) {}
  observe(element: Element) {
    this.elements.add(element);
    observers.add(this);
  }
  unobserve(element: Element) {
    this.elements.delete(element);
  }
  disconnect() {
    this.elements.clear();
    observers.delete(this);
  }
  fire() {
    this.callback([], this as unknown as ResizeObserver);
  }
}
for (const target of [globalThis, page.win] as unknown as Record<string, unknown>[]) {
  Object.defineProperty(target, "ResizeObserver", { value: RecordingResizeObserver, configurable: true, writable: true });
}
const elementProto = (page.win as unknown as { Element: typeof Element }).Element.prototype;
const realRect = elementProto.getBoundingClientRect;
elementProto.getBoundingClientRect = function (this: Element) {
  const rect = realRect.call(this);
  if (!this.classList.contains("bsc-express-btn")) return rect;
  const box = { x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 44, width: 300, height: 44 };
  return { ...box, toJSON: () => box } as DOMRect;
};

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let BitsnapCheckout: typeof import("./BitsnapCart.tsx").default;
let Bitsnap: typeof import("./methods.ts").Bitsnap;
let useCheckoutStore: typeof import("./state.ts").useCheckoutStore;
let CHECKOUT_SLOT_NAMES: typeof import("./appearance.ts").CHECKOUT_SLOT_NAMES;
let snapshotModule: typeof import("./cart-snapshot.ts");
let walletAvailability: typeof import("./CartProvider.tsx").walletAvailability;
let cartCheckoutModule: typeof import("./CartCheckout.tsx");
let realExpressLoad: (typeof import("./CartCheckout.tsx"))["expressAreaChunk"]["load"];

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  BitsnapCheckout = (await import("./BitsnapCart.tsx")).default;
  ({ Bitsnap } = await import("./methods.ts"));
  ({ useCheckoutStore } = await import("./state.ts"));
  ({ CHECKOUT_SLOT_NAMES } = await import("./appearance.ts"));
  snapshotModule = await import("./cart-snapshot.ts");
  ({ walletAvailability } = await import("./CartProvider.tsx"));
  cartCheckoutModule = await import("./CartCheckout.tsx");
  realExpressLoad = cartCheckoutModule.expressAreaChunk.load;
  // The real express chunk, with the status line of an express button in an
  // alert and a polite phase next to its wrappers: inside the cart the status
  // only shows after a wallet answered, which needs a wallet SDK.
  cartCheckoutModule.expressAreaChunk.load = async () => {
    const real = await realExpressLoad();
    const { ExpressStatus } = await import("../express/ExpressStatus.tsx");
    const RealArea = real.default;
    return {
      default: (props: Parameters<typeof RealArea>[0]) => (
        <>
          <RealArea {...props} />
          <ExpressStatus phase="pending" />
          <ExpressStatus phase="failed" />
        </>
      ),
    };
  };
});

// ------------------------------------------------------------------ server

const pricingOf = (price: number, version: string, sale?: { regular: number; lowest: number }) => ({
  regularPrice: sale?.regular ?? price,
  effectivePrice: price,
  currency: "PLN",
  ...(sale != null
    ? { discount: { id: "d1", type: "FIXED" as const, value: sale.regular - price, status: "ACTIVE" as const } }
    : {}),
  referencePrice: {
    windowDays: 30,
    asOf: 0,
    basis: "observed-history",
    historyAvailable: sale != null,
    ...(sale != null ? { amount: sale.lowest } : {}),
  },
  priceVersion: version,
});

type Product = Record<string, unknown> & { id: string };

const initialCatalog = (): Map<string, Product> =>
  new Map<string, Product>([
    [
      "prod1",
      {
        id: "prod1",
        ownerID: "o",
        name: "Mug",
        description: null,
        price: 2500,
        currency: "PLN",
        metadata: {},
        image_url: "https://cdn.example.test/mug.png",
        isDeliverable: true,
        pricing: pricingOf(2500, "v1"),
        variants: [{ id: "var1", name: "Blue", price: 2500, currency: "PLN" }],
      },
    ],
    [
      "prod2",
      {
        id: "prod2",
        ownerID: "o",
        name: "Ebook",
        description: null,
        price: 4990,
        currency: "PLN",
        metadata: {},
        image_url: null,
        isDeliverable: false,
        pricing: pricingOf(4990, "v2", { regular: 5990, lowest: 4790 }),
      },
    ],
  ]);

let catalog = initialCatalog();
type ProductsMode = "ok" | "fail" | "pending";
let productsMode: ProductsMode = "ok";
let buyMode: "pending" | "fail" = "pending";
const roots: Array<{ unmount: () => void }> = [];
const offenders = new Map<string, string>();
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  resetTracker();
  clockOffset = 0;
  catalog = initialCatalog();
  productsMode = "ok";
  buyMode = "pending";
  page.win.localStorage.clear();
  page.win.localStorage.setItem("checkout", JSON.stringify({ products: [] }));
  snapshotModule.resetCartSnapshotState();
  walletAvailability.reset();
  cartCheckoutModule.forgetExpressArea();
  for (const target of [page.win, globalThis] as unknown as Record<string, unknown>[]) {
    target.ApplePaySession = FakeApplePaySession;
  }
  useCheckoutStore.setState({ isCartVisible: false, numberOfProductsInCart: 0, notice: undefined });
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/public-commerce/products")) {
      if (productsMode === "pending") return new Promise<Response>(() => {});
      if (productsMode === "fail") return json({}, 500);
      // Only what the catalog has: an unknown id comes back as an unavailable row.
      const ids = new URL(url).searchParams.get("ids")?.split(",") ?? [];
      const result = ids.flatMap((id) => {
        const found = catalog.get(id) ?? [...catalog.values()].find((p) =>
          (p.variants as { id: string }[] | undefined)?.some((v) => v.id === id),
        );
        return found == null ? [] : [found];
      });
      return json({ success: true, result });
    }
    if (url.includes("/public-commerce/countries")) {
      return json([
        { name: "Polska", code: "PL" },
        { name: "Niemcy", code: "DE" },
      ]);
    }
    if (url.includes("/public-commerce/payment-methods")) {
      return json({ success: true, choice: { methods: ["online", "manual"], manualAccountTypes: ["blik"] } });
    }
    if (url.includes("/public-commerce/buy")) {
      return buyMode === "pending" ? new Promise<Response>(() => {}) : json({ success: false, error: "boom" }, 500);
    }
    if (url.endsWith("/IsOneClickPaymentAvailable")) {
      return new Response(
        toBinary(IsOneClickPaymentAvailableResponseSchema, create(IsOneClickPaymentAvailableResponseSchema, { applePay: true, googlePay: true })) as BodyInit,
        { status: 200, headers: { "Content-Type": "application/proto" } },
      );
    }
    if (init?.method === "POST" && url.endsWith("/e")) return new Response(null, { status: 202 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  console.error = () => {};
  console.warn = () => {};
  console.log = () => {};
});

afterEach(async () => {
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  for (const target of [page.win, globalThis] as unknown as Record<string, unknown>[]) {
    delete target.ApplePaySession;
  }
  resetTracker();
});

after(() => {
  cartCheckoutModule.expressAreaChunk.load = realExpressLoad;
  elementProto.getBoundingClientRect = realRect;
  teardownReactPage();
});

// ----------------------------------------------------------------- helpers

const settle = (ms = 40) => React.act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const doc = () => page.win.document;
const $ = (selector: string) => doc().querySelector<HTMLElement>(selector);
const trigger = () => $('button[aria-haspopup="dialog"]')!;
const lookAtCart = () => void (clockOffset += 1500);
const unmountAll = async () => {
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  useCheckoutStore.setState({ isCartVisible: false });
};

/** Merchant classes on every slot: they must pass through untouched. */
const merchantElements = () =>
  Object.fromEntries(CHECKOUT_SLOT_NAMES.map((name) => [name, { className: `merchant-${name}` }]));

async function mount(props: Record<string, unknown> = {}) {
  const container = doc().createElement("div");
  doc().body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(<BitsnapCheckout projectID={TEST_KEY} locale="en-US" analytics={false} {...props} />);
  });
}

async function add(id: string, quantity = 1, url?: string) {
  await React.act(async () => void (await Bitsnap.addProductToCart(id, quantity, undefined, url != null ? { url } : undefined)));
}

const open = async () => {
  await React.act(async () => Bitsnap.showCart());
  await settle();
};

/** Fires the resize observers, so the "or" divider sees the express wrappers. */
const resize = () => React.act(async () => observers.forEach((observer) => observer.fire()));

async function clickNext() {
  const button = $('[data-bitsnap-checkout-slot="checkoutButton"]')!;
  await React.act(async () => button.click());
  await settle();
}

/** Every class token in the document; anything not ours or the merchant's is an offender. */
function collect(where: string) {
  for (const element of Array.from(doc().body.querySelectorAll("[class]"))) {
    const value = element.getAttribute("class") ?? "";
    for (const token of value.split(/\s+/).filter(Boolean)) {
      if (OURS.test(token) || token.startsWith("merchant-")) continue;
      if (ROOT_ONLY.has(token) && element.getAttribute("data-bitsnap-checkout") === "root") continue;
      if (!offenders.has(token)) offenders.set(token, `${where}: <${element.tagName.toLowerCase()} class="${value}">`);
    }
  }
}

describe("cart class graph", () => {
  it("renders the trigger with only the scope class, or the scope and the merchant's class (D20)", async () => {
    await mount();
    assert.equal(trigger().className, "bitsnap-react");
    assert.equal(trigger().getAttribute("data-bitsnap-checkout-trigger"), "default");
    collect("trigger default");
    await unmountAll();

    await mount({ className: "merchant-trigger" });
    assert.equal(trigger().className, "bitsnap-react merchant-trigger");
    collect("trigger custom");
  });

  for (const presentation of ["drawer", "dialog"] as const) {
    it(`renders a full cart (${presentation}): link, sale, unit price, express area, countries, payment choice`, async () => {
      await mount({ presentation, appearance: { elements: merchantElements() } });
      await add("var1", 2, "https://shop.example.test/mug");
      await add("prod2", 1);
      await open();
      lookAtCart();
      await settle(60);
      await resize();
      await settle();
      assert.ok($('[data-bitsnap-checkout-slot="productName"] a.bsc-line-link'), "the product link renders");
      assert.ok($('[data-bitsnap-checkout-slot="productUnitPrice"]'), "the unit price line renders");
      assert.ok($('[data-bitsnap-checkout-price="omnibus"]'), "the Omnibus line renders");
      assert.ok($('[data-bitsnap-checkout-price="sale"]'), "the sale price renders");
      assert.ok($("[data-bitsnap-checkout-wallets]"), "the express area renders");
      assert.equal(
        doc().querySelectorAll('[data-bitsnap-checkout-slot="paymentButtons"]').length,
        3,
        "the Apple Pay, Google Pay and InPost/Revolut wrappers render",
      );
      assert.ok($('[data-bitsnap-express-status="failed"]'), "the alert express status renders");
      assert.ok($('[data-bitsnap-express-status="pending"]'), "the polite express status renders");
      assert.ok($("[data-bitsnap-checkout-divider]"), "the or divider renders");
      assert.ok($('[data-bitsnap-checkout-slot="paymentMethods"]'), "the payment choice renders");
      assert.ok($('[data-bitsnap-checkout-slot="countryTrigger"]'), "the country picker renders");
      assert.equal(trigger().closest("[data-bitsnap-checkout]"), null, "the trigger is outside the root");
      collect(`full ${presentation}`);
    });

    it(`renders the loading, failed and empty states (${presentation})`, async () => {
      await mount({ presentation });
      await add("var1", 1);
      await unmountAll();

      // A reload without the instant snapshot: the lines wait for /products.
      page.win.localStorage.removeItem("bitsnap-cart-view");
      productsMode = "pending";
      await mount({ presentation });
      await open();
      assert.ok($('[data-bitsnap-checkout-slot="skeleton"]'), "the skeleton renders");
      collect(`loading ${presentation}`);
      await unmountAll();

      page.win.localStorage.removeItem("bitsnap-cart-view");
      productsMode = "fail";
      await mount({ presentation });
      await open();
      assert.ok($('[role="alert"]'), "the failed state renders");
      collect(`failed ${presentation}`);
      await unmountAll();

      page.win.localStorage.setItem("checkout", JSON.stringify({ products: [] }));
      productsMode = "ok";
      await mount({ presentation });
      await open();
      assert.ok($('[data-bitsnap-checkout-slot="emptyState"]'), "the empty state renders");
      collect(`empty ${presentation}`);
    });
  }

  it("renders a price-updated line with the wallets-updating and review notices", async () => {
    await mount({ appearance: { elements: merchantElements() } });
    await add("prod2", 1);
    // The server's price moved after the snapshot the add wrote.
    const ebook = catalog.get("prod2")!;
    catalog.set("prod2", { ...ebook, price: 4490, pricing: pricingOf(4490, "v2b", { regular: 5990, lowest: 4490 }) });
    await open();
    await settle(60);
    assert.ok($('[data-bitsnap-checkout-price="updated"]'), "the price-updated mark renders");
    assert.ok($('[data-bitsnap-checkout-notice="wallets-updating"]'), "the wallets-updating notice renders");
    // A price changed less than a second ago is unseen: the click asks to review it.
    await clickNext();
    assert.ok($('[data-bitsnap-checkout-notice="review-prices"]'), "the review notice renders");
    collect("price updated");
  });

  it("renders an unavailable row", async () => {
    await mount({ appearance: { elements: merchantElements() } });
    await add("var1", 1);
    await add("prod2", 1);
    // The server stops returning a product (removed, or its lookup failed).
    catalog.delete("prod2");
    clockOffset += 31_000; // the answer from the add is stale
    await open();
    await settle(60);
    assert.ok($("[data-bitsnap-checkout-unavailable]"), "the unavailable row renders");
    assert.ok($(".bsc-line-unavailable"), "the unavailable label renders");
    collect("unavailable");
  });

  it("renders the busy and the failed \"Next step\"", async () => {
    await mount({ appearance: { elements: merchantElements() } });
    await add("var1", 1);
    await open();
    lookAtCart();
    await settle(60);
    await clickNext();
    assert.equal($('[data-bitsnap-checkout-slot="checkoutButton"]')?.getAttribute("aria-busy"), "true", "the busy CTA renders");
    assert.ok($('[data-bitsnap-checkout-slot="checkoutButton"] .bsc-spinner'), "the CTA spinner renders");
    assert.ok($('[data-bitsnap-checkout-slot="paymentMethods"]:disabled'), "the payment choice is locked");
    collect("busy");
    await unmountAll();

    buyMode = "fail";
    await mount({ appearance: { elements: merchantElements() } });
    await open();
    lookAtCart();
    await settle(60);
    await clickNext();
    assert.ok($('[data-bitsnap-checkout-slot="footer"] [role="alert"]'), "the checkout error renders");
    collect("checkout failed");
  });

  it("renders the inline refresh error over lines from the device", async () => {
    await mount({ appearance: { elements: merchantElements() } });
    await add("var1", 1);
    await open();
    await settle();
    await unmountAll();
    productsMode = "fail";
    await mount({ appearance: { elements: merchantElements() } });
    await open();
    await settle(60);
    assert.ok($(".bsc-refresh"), "the refresh row renders");
    assert.ok($('[data-bitsnap-checkout-slot="productName"]'), "the lines from the device stay");
    collect("refresh failed");
  });

  it("renders only bsc-*, bitsnap-react, the root's theme marker and merchant classes", () => {
    assert.deepEqual(
      [...offenders].map(([token, where]) => `${token} (${where})`),
      [],
      "classes the cart must not render: use bsc-* classes and cart.css (dark/light only on the root)",
    );
  });
});

// ------------------------------------------------------- static backstop

/**
 * Tokens allowed in a class literal of the `/cart` graph besides `bsc-*`.
 * Keep it short: each entry needs a reason.
 */
const STATIC_ALLOWED = new Set([
  // The scope class of the checkout root and the trigger.
  "bitsnap-react",
]);

const ROOTS = ["src/components/checkout/CartComponent.tsx", "src/components/checkout/CartFrame.tsx"];

/** `.ts`/`.tsx` files under the package reached by value imports (static and dynamic) from the roots. */
function cartGraph(): string[] {
  const root = process.cwd();
  const resolveImport = (from: string, spec: string) => {
    const base = spec.startsWith(".")
      ? resolve(dirname(from), spec)
      : spec.startsWith("@/")
        ? resolve(root, spec.slice(2))
        : spec.startsWith("src/")
          ? resolve(root, spec)
          : undefined;
    if (base == null) return undefined; // a package from node_modules
    return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile() && /\.tsx?$/.test(candidate),
    );
  };
  const seen = new Set<string>();
  const queue = ROOTS.map((file) => resolve(root, file));
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = stripComments(readFileSync(file, "utf8"));
    const pattern =
      /(?:import|export)\s+(type\s+)?[^"';]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
    for (const match of source.matchAll(pattern)) {
      if (match[1] != null) continue; // `import type`: no code
      const found = resolveImport(file, match[2] ?? match[3] ?? match[4]);
      if (found != null) queue.push(found);
    }
  }
  return [...seen];
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The text between `source[open]` and its matching closer, skipping string contents. */
function balanced(source: string, open: number): string {
  const opener = source[open];
  const closer = opener === "{" ? "}" : ")";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (char === '"' || char === "'" || char === "`") {
      for (i++; i < source.length && source[i] !== char; i++) if (source[i] === "\\") i++;
      continue;
    }
    if (char === opener) depth++;
    else if (char === closer && --depth === 0) return source.slice(open + 1, i);
  }
  return source.slice(open + 1);
}

/** Class tokens in string literals of `className=` values and `cx(` calls (template holes dropped). */
function classLiterals(source: string): string[] {
  const code = stripComments(source);
  const tokens: string[] = [];
  // A `cx(` inside a `className={...}` already scanned is not read twice.
  let scannedUntil = 0;
  for (const match of code.matchAll(/className=|\bcx\(/g)) {
    if (match.index < scannedUntil) continue;
    const at = match.index + match[0].length;
    let expression: string;
    if (match[0] === "className=") {
      if (code[at] === '"') expression = code.slice(at, code.indexOf('"', at + 1) + 1);
      else if (code[at] === "{") expression = balanced(code, at);
      else continue;
    } else {
      expression = balanced(code, at - 1);
    }
    scannedUntil = at + expression.length;
    for (const literal of expression.matchAll(/"([^"\\]*)"|'([^'\\]*)'|`([^`]*)`/g)) {
      const text = literal[1] ?? literal[2] ?? literal[3].replace(/\$\{[^}]*\}/g, " ");
      tokens.push(...text.split(/\s+/).filter(Boolean));
    }
  }
  return tokens;
}

describe("cart class graph, static backstop", () => {
  it("finds Tailwind tokens in className strings, cx() arguments and template literals", () => {
    const sample = [
      '<div className="flex p-4" />',
      '<p className={cx("bsc-a", ok && "text-sm", { x: 1 })} />',
      "<span className={`bsc-b ${extra} mt-2`} />",
      "const c = cx('bsc-c', 'rounded-md');",
    ].join("\n");
    assert.deepEqual(
      classLiterals(sample).filter((token) => !token.startsWith("bsc-")),
      ["flex", "p-4", "text-sm", "mt-2", "rounded-md"],
    );
  });

  it("has only bsc-* classes (or allowlisted ones) in the files /cart reaches", () => {
    const files = cartGraph();
    const names = files.map((file) => relative(process.cwd(), file));
    for (const expected of [
      "src/components/checkout/CartLines.tsx",
      "src/components/checkout/SingleProduct.tsx",
      "src/components/checkout/CartExpressArea.tsx",
      "src/components/express/ExpressStatus.tsx",
    ]) {
      assert.ok(names.includes(expected), `the graph misses ${expected}`);
    }
    let checked = 0;
    const bad: string[] = [];
    for (const file of files) {
      for (const token of classLiterals(readFileSync(file, "utf8"))) {
        checked++;
        if (!/^bsc-[\w-]+$/.test(token) && !STATIC_ALLOWED.has(token)) {
          bad.push(`${relative(process.cwd(), file)}: "${token}"`);
        }
      }
    }
    assert.ok(checked > 50, `only ${checked} class tokens found: the scan is broken`);
    assert.deepEqual(bad, [], "class literals the cart may render: use bsc-* classes and cart.css");
  });
});
