import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { ProductListData } from "./fetch.ts";
import { useProducts, type UseProductsOptions } from "./useProducts.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const initialData: ProductListData = {
  totalCount: 50,
  items: [
    {
      id: "p1",
      uniqueSlug: "shirt",
      name: "Shirt",
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
    },
  ],
};

/** Renders the hook on the server and returns what it produced. */
function renderHook(options: UseProductsOptions) {
  let result: ReturnType<typeof useProducts> | undefined;
  function Probe() {
    result = useProducts(options);
    return null;
  }
  renderToString(createElement(Probe));
  assert.ok(result);
  return result;
}

describe("useProducts on the server", () => {
  it("does not fetch and reports loading without initial data", () => {
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched += 1;
      return new Response("{}");
    }) as typeof fetch;

    const result = renderHook({ projectID: "abc" });

    assert.equal(fetched, 0);
    assert.equal(result.isLoading, true);
    assert.deepEqual(result.products, []);
    assert.equal(result.page, 1);
    assert.equal(result.pageCount, 1);
    assert.equal(result.error, undefined);
  });

  it("serves the initial data on the first render without a fetch", () => {
    globalThis.fetch = (async () => {
      throw new Error("must not fetch");
    }) as typeof fetch;

    const result = renderHook({ projectID: "abc", initialData, pageSize: 24 });

    assert.equal(result.isLoading, false);
    assert.equal(result.products.length, 1);
    assert.equal(result.totalCount, 50);
    assert.equal(result.pageCount, 3);
    assert.equal(result.page, 1);
  });

  it("clamps the page size when counting pages", () => {
    const result = renderHook({ projectID: "abc", initialData, pageSize: 1000 });

    assert.equal(result.pageCount, 2);
  });
});
