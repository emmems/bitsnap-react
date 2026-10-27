import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildProductListURL,
  clampPageSize,
  fetchProductList,
  pageCountFor,
  ProductListError,
} from "./fetch.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const base = {
  projectID: "abc",
  host: "https://bitsnap.pl",
  limit: 24,
  offset: 0,
};

describe("buildProductListURL", () => {
  it("builds the public-commerce product-list URL", () => {
    assert.equal(
      buildProductListURL(base),
      "https://bitsnap.pl/api/integrations/abc/public-commerce/product-list?limit=24&offset=0",
    );
  });

  it("adds locale and trimmed search only when given", () => {
    const url = new URL(
      buildProductListURL({
        ...base,
        offset: 48,
        locale: "en-US",
        search: "  blue shirt ",
      }),
    );

    assert.equal(url.searchParams.get("offset"), "48");
    assert.equal(url.searchParams.get("locale"), "en-US");
    assert.equal(url.searchParams.has("currency"), false);
    assert.equal(url.searchParams.get("search"), "blue shirt");
    assert.equal(
      new URL(buildProductListURL({ ...base, search: "   " })).searchParams.has("search"),
      false,
    );
  });

  it("drops trailing slashes of the host and supports same-origin requests", () => {
    assert.ok(
      buildProductListURL({ ...base, host: "https://shop.example.com//" }).startsWith(
        "https://shop.example.com/api/integrations/abc/",
      ),
    );
    assert.ok(
      buildProductListURL({ ...base, host: "" }).startsWith("/api/integrations/abc/"),
    );
  });

  it("encodes the project ID", () => {
    assert.ok(buildProductListURL({ ...base, projectID: "a/b" }).includes("/a%2Fb/"));
  });
});

describe("page helpers", () => {
  it("clamps the page size to what the backend accepts", () => {
    assert.equal(clampPageSize(), 24);
    assert.equal(clampPageSize(Number.NaN), 24);
    assert.equal(clampPageSize(0), 1);
    assert.equal(clampPageSize(12.7), 12);
    assert.equal(clampPageSize(500), 48);
  });

  it("counts pages, at least one", () => {
    assert.equal(pageCountFor(0, 24), 1);
    assert.equal(pageCountFor(24, 24), 1);
    assert.equal(pageCountFor(25, 24), 2);
  });
});

describe("fetchProductList", () => {
  it("requests without credentials and returns the payload", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const payload = { items: [], totalCount: 0 };
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(payload), { status: 200 });
    }) as typeof fetch;

    const signal = new AbortController().signal;
    assert.deepEqual(await fetchProductList(base, signal), payload);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init?.credentials, "omit");
    assert.equal(calls[0].init?.signal, signal);
  });

  it("rejects non-2xx responses with the status", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;

    await assert.rejects(fetchProductList(base), (error: unknown) => {
      assert.ok(error instanceof ProductListError);
      assert.equal(error.status, 500);
      return true;
    });
  });

  it("rejects an unexpected payload", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ items: "nope" }), { status: 200 })) as typeof fetch;

    await assert.rejects(fetchProductList(base), ProductListError);
  });
});
