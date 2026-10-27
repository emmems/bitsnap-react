const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToString } = require("react-dom/server");
const { ProductList, useProducts } = require("../dist/index.js");
const catalog = require("../dist/catalog.js");
const { BitsnapModels } = require("../dist/models.js");

const product = (overrides) => ({
  id: "p1",
  cartItemId: "v1",
  uniqueSlug: "blue-shirt",
  name: "Blue shirt",
  shortDescription: "Soft cotton",
  image: { url: "https://cdn.example/shirt.jpg", thumbnailUrl: "https://cdn.example/shirt-t.jpg" },
  price: 12900,
  currency: "PLN",
  compareAtPrice: null,
  priceFrom: false,
  variantCount: 1,
  isRecurring: false,
  available: true,
  addToCart: true,
  ...overrides,
});

const initialData = {
  totalCount: 60,
  items: [
    product(),
    product({
      id: "p2",
      uniqueSlug: "hoodie",
      name: "Hoodie",
      price: 20000,
      compareAtPrice: 25000,
      priceFrom: true,
      variantCount: 3,
      addToCart: false,
    }),
    product({ id: "p3", uniqueSlug: "sold-out", name: "Sold out cap", available: false }),
    product({ id: "p4", uniqueSlug: "plan", name: "Monthly plan", isRecurring: true, addToCart: false, image: null }),
  ],
};

function withoutFetch(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("the server render must not fetch");
  };
  try {
    return fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("catalog entry exposes the product list API", () => {
  assert.equal(typeof ProductList, "function");
  assert.equal(typeof useProducts, "function");
  assert.equal(typeof catalog.ProductList, "function");
  assert.equal(typeof catalog.useProducts, "function");
  assert.equal(typeof catalog.formatProductPrice, "function");
  assert.ok(catalog.PRODUCT_LIST_SLOT_NAMES.includes("card"));
});

test("product list schema accepts the endpoint payload", () => {
  assert.deepEqual(
    BitsnapModels.ProductListResponseSchema.parse(JSON.parse(JSON.stringify(initialData))),
    initialData,
  );
});

test("product list renders the first page on the server from initialData", () => {
  const html = withoutFetch(() =>
    renderToString(
      React.createElement(ProductList, {
        projectID: "project-a",
        host: "https://custom.example",
        pageSize: 24,
        initialData,
      }),
    ),
  );

  assert.match(html, /data-bitsnap-products="root"/);
  assert.match(html, /--bitsnap-products-background:#ffffff/);
  assert.match(html, /href="\/p\/blue-shirt"/);
  assert.match(html, /Blue shirt/);
  assert.match(html, /src="https:\/\/cdn\.example\/shirt-t\.jpg"/);
  // 12900 minor units, Polish locale by default.
  assert.match(html, /129,00\s*zł/);
  assert.match(html, /od\s+200,00\s*zł/);
  assert.match(html, /<del[^>]*>250,00\s*zł<\/del>/);
  assert.match(html, /Dodaj do koszyka/);
  assert.match(html, /Wybierz/);
  assert.match(html, /alt=""/);
  assert.doesNotMatch(html, /alt="Blue shirt"/);
  assert.match(html, /Niedostępny/);
  assert.match(html, /Subskrypcja/);
  assert.match(html, /Zobacz/);
  // 60 products with 24 per page.
  assert.match(html, /Strona 1 z 3/);
  assert.doesNotMatch(html, /role="status"/);
});

test("default product href encodes the slug", () => {
  const html = withoutFetch(() =>
    renderToString(
      React.createElement(ProductList, {
        projectID: "project-a",
        initialData: {
          totalCount: 1,
          items: [product({ uniqueSlug: 'a b"c/d' })],
        },
      }),
    ),
  );

  assert.match(html, /href="\/p\/a%20b%22c%2Fd"/);
});

test("product list uses productHref, English texts and the appearance API", () => {
  const html = withoutFetch(() =>
    renderToString(
      React.createElement(ProductList, {
        projectID: "project-a",
        locale: "en-US",
        initialData: { totalCount: 1, items: [product({ currency: "USD" })] },
        productHref: (p) => `https://shop.example/p/${p.uniqueSlug}`,
        texts: { addToCart: "Buy now" },
        appearance: { theme: "dark", tokens: { buttonBackground: "#635bff" } },
      }),
    ),
  );

  assert.match(html, /href="https:\/\/shop\.example\/p\/blue-shirt"/);
  assert.match(html, /\$129\.00/);
  assert.match(html, /Buy now/);
  assert.match(html, /class="[^"]*\bdark\b/);
  assert.match(html, /--bitsnap-products-button-background:#635bff/);
  assert.doesNotMatch(html, /Strona/);
  assert.doesNotMatch(html, /Page 1 of/);
});

test("product list shows the empty state", () => {
  const html = withoutFetch(() =>
    renderToString(
      React.createElement(ProductList, {
        projectID: "project-a",
        initialData: { totalCount: 0, items: [] },
      }),
    ),
  );

  assert.match(html, /Brak produktów do wyświetlenia/);
});

test("product list renders a loading skeleton without initialData and does not fetch", () => {
  const html = withoutFetch(() =>
    renderToString(React.createElement(ProductList, { projectID: "project-a" })),
  );

  assert.match(html, /role="status"/);
  assert.match(html, /aria-label="Ładowanie produktów"/);
  assert.doesNotMatch(html, /<li/);
});

test("renderItem replaces the card content", () => {
  const html = withoutFetch(() =>
    renderToString(
      React.createElement(ProductList, {
        projectID: "project-a",
        initialData: { totalCount: 1, items: [product()] },
        renderItem: (p, context) =>
          React.createElement("a", { href: context.href }, `${p.name} for ${context.price}`),
      }),
    ),
  );

  assert.match(html, /Blue shirt for 129,00\s*zł/);
  assert.doesNotMatch(html, /Dodaj do koszyka/);
});
