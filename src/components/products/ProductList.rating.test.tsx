import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { setupReactPage, teardownReactPage } from "@/src/analytics/react-testing";
import type { ProductListData, PublicListProduct } from "./fetch.ts";

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

function product(n: number, extra: Partial<PublicListProduct> = {}): PublicListProduct {
  return {
    id: `prod${n}`,
    uniqueSlug: `slug-${n}`,
    name: `Product ${n}`,
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

/** Two pages of one product; page 2 carries a rating when it was asked for. */
function mockFetch() {
  const urls: URL[] = [];
  globalThis.fetch = (async (input: string) => {
    const url = new URL(input);
    urls.push(url);
    const rated = url.searchParams.get("rating") === "1";
    const body: ProductListData = {
      totalCount: 2,
      items: [product(2, rated ? { rating: { average: 4.5, count: 3 } } : {})],
    };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return urls;
}

async function mountAndPaginate(props: { showRating?: boolean }) {
  const urls = mockFetch();
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(
      <ProductList
        projectID="project-a"
        host="https://shop.example.test"
        pageSize={1}
        analytics={false}
        initialData={{ totalCount: 2, items: [product(1)] }}
        {...props}
      />,
    );
  });
  assert.equal(urls.length, 0, "the first page comes from initialData");
  const next = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Następna",
  )!;
  await React.act(async () => next.click());
  await React.act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  return { urls, container };
}

describe("ProductList pagination with ratings", () => {
  it("requests rating=1 for the next page when showRating is on", async () => {
    const { urls, container } = await mountAndPaginate({ showRating: true });
    assert.equal(urls.length, 1);
    assert.equal(urls[0].searchParams.get("rating"), "1");
    assert.equal(urls[0].searchParams.get("offset"), "1");
    const rating = container.querySelector('[data-bitsnap-products-slot="rating"]');
    assert.ok(rating, "the fetched page shows the rating");
    assert.equal(rating.querySelector(".sr-only")?.textContent, "Ocena 4,5 na 5, 3 opinie");
  });

  it("does not send rating when showRating is off", async () => {
    const { urls, container } = await mountAndPaginate({});
    assert.equal(urls.length, 1);
    assert.equal(urls[0].searchParams.has("rating"), false);
    assert.equal(container.querySelector('[data-bitsnap-products-slot="rating"]'), null);
  });
});

process.on("exit", teardownReactPage);
