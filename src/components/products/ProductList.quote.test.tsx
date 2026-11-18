import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { setupReactPage, teardownReactPage } from "@/src/analytics/react-testing";
import type { PublicListProduct } from "./fetch.ts";
import type { ProductListItemContext } from "./ProductList.tsx";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let ProductList: typeof import("./ProductList.tsx").ProductList;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ ProductList } = await import("./ProductList.tsx"));
});

const originalFetch = globalThis.fetch;
const roots: Array<{ unmount: () => void }> = [];

afterEach(async () => {
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  globalThis.fetch = originalFetch;
});

function product(id: string, extra: Partial<PublicListProduct> = {}): PublicListProduct {
  return {
    id,
    uniqueSlug: id,
    name: `Product ${id}`,
    shortDescription: null,
    image: null,
    price: 1000,
    currency: "PLN",
    compareAtPrice: null,
    priceFrom: false,
    variantCount: 1,
    isRecurring: false,
    available: true,
    addToCart: true,
    ...extra,
  };
}

/** What the backend sends for each kind of card. */
const items: PublicListProduct[] = [
  // A plain product, discounted.
  product("normal", { price: 1000, compareAtPrice: 1500 }),
  // Service with a fixed automatic price.
  product("fixed", { price: 25000, quoteOnly: true, quoteShowsPrice: true, addToCart: false }),
  // Service priced per unit: "od X zł".
  product("perunit", {
    price: 500,
    quoteOnly: true,
    quoteShowsPrice: true,
    priceFrom: true,
    addToCart: false,
  }),
  // Request-only service: price 0, a stale discount must not show either.
  product("request", { price: 0, compareAtPrice: 9900, quoteOnly: true, addToCart: false }),
  // 3D print. `addToCart: true` would be a backend bug: the list must still not sell it.
  product("print3d", { price: 0, quoteOnly: true, has3d: true, addToCart: true }),
];

const plain = (value: string | null | undefined) => (value ?? "").replace(/\s/g, " ");

async function mount(props: Partial<Parameters<typeof ProductList>[0]> = {}) {
  globalThis.fetch = (async () => {
    throw new Error("the list must render from initialData");
  }) as typeof fetch;
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(
      <ProductList
        projectID="project-a"
        host="https://shop.example.test"
        analytics={false}
        initialData={{ totalCount: items.length, items }}
        {...props}
      />,
    );
  });
  const card = (id: string) => {
    const link = container.querySelector(`a[href="/p/${id}"]`);
    assert.ok(link, `card ${id}`);
    return link.closest("li")!;
  };
  const priceOf = (id: string) =>
    card(id).querySelector('[data-bitsnap-products-slot="price"]')!;
  return { container, card, priceOf };
}

describe("ProductList quote-only products", () => {
  it("prices each kind of card in Polish", async () => {
    const { card, priceOf } = await mount({ locale: "pl-PL" });

    assert.match(plain(priceOf("normal").textContent), /^10,00 zł/);
    assert.ok(priceOf("normal").querySelector("del"), "normal keeps its discount");
    assert.equal(priceOf("normal").getAttribute("data-kind"), null);
    assert.ok(card("normal").querySelector('[data-bitsnap-products-slot="addToCartButton"]'));

    assert.equal(plain(priceOf("fixed").textContent), "250,00 zł");
    assert.equal(plain(priceOf("perunit").textContent), "od 5,00 zł");

    for (const id of ["request", "print3d"]) {
      const price = priceOf(id);
      assert.equal(price.textContent, "Wyceń", id);
      assert.equal(price.getAttribute("data-kind"), "quote");
      assert.equal(price.querySelector("del"), null, `${id} has no discount`);
      assert.equal(price.querySelector(".sr-only"), null);
    }
  });

  it("never offers add to cart for a quoted product, links its page instead", async () => {
    const { card } = await mount({ locale: "pl-PL" });
    for (const id of ["fixed", "perunit", "request", "print3d"]) {
      assert.equal(
        card(id).querySelector('[data-bitsnap-products-slot="addToCartButton"]'),
        null,
        id,
      );
      const select = card(id).querySelector('a[data-bitsnap-products-slot="selectButton"]');
      assert.equal(select?.getAttribute("href"), `/p/${id}`, id);
    }
  });

  it("uses English texts for the en locale", async () => {
    const { priceOf } = await mount({ locale: "en-US" });
    assert.equal(priceOf("request").textContent, "Get a quote");
    assert.equal(priceOf("print3d").textContent, "Get a quote");
    assert.equal(plain(priceOf("perunit").textContent), "from PLN 5.00");
    assert.equal(plain(priceOf("fixed").textContent), "PLN 250.00");
  });

  it("honours a quote text override", async () => {
    const { priceOf } = await mount({ locale: "pl-PL", texts: { quote: "Zapytaj o cenę" } });
    assert.equal(priceOf("request").textContent, "Zapytaj o cenę");
  });

  it("gives renderItem the quote flag and refuses to add a quoted product", async () => {
    const seen = new Map<string, ProductListItemContext>();
    const added: string[] = [];
    await mount({
      locale: "pl-PL",
      onAddToCart: (p) => {
        added.push(p.id);
      },
      renderItem: (p, context) => {
        seen.set(p.id, context);
        return <a href={context.href}>{p.name}</a>;
      },
    });

    assert.equal(seen.get("request")?.quote, true);
    assert.equal(seen.get("request")?.price, "Wyceń");
    assert.equal(seen.get("request")?.compareAtPrice, null);
    assert.equal(seen.get("fixed")?.quote, false);
    assert.equal(seen.get("normal")?.quote, false);

    await assert.rejects(seen.get("print3d")!.addToCart());
    assert.deepEqual(added, []);
    await seen.get("normal")!.addToCart();
    assert.deepEqual(added, ["normal"]);
  });
});

process.on("exit", teardownReactPage);
