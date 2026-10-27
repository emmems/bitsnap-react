import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fillProductListText,
  getProductListText,
  PRODUCT_LIST_TEXT_TABLES,
  resolveProductListTexts,
} from "./texts.ts";

describe("product list texts", () => {
  it("has the same keys in every locale, all non-empty", () => {
    assert.deepEqual(
      Object.keys(PRODUCT_LIST_TEXT_TABLES.pl).sort(),
      Object.keys(PRODUCT_LIST_TEXT_TABLES.en).sort(),
    );
    for (const table of [PRODUCT_LIST_TEXT_TABLES.pl, PRODUCT_LIST_TEXT_TABLES.en]) {
      for (const value of Object.values(table)) {
        assert.ok(value.length > 0);
      }
    }
  });

  it("picks Polish by default and English for en locales", () => {
    assert.equal(getProductListText("addToCart", "pl-PL"), "Dodaj do koszyka");
    assert.equal(getProductListText("addToCart", "xx"), "Dodaj do koszyka");
    assert.equal(getProductListText("addToCart", "en-GB"), "Add to cart");
    assert.equal(getProductListText("unavailable", "pl"), "Niedostępny");
  });

  it("applies overrides whatever the locale and ignores undefined", () => {
    const texts = resolveProductListTexts("en", {
      addToCart: "Buy",
      empty: undefined,
    });

    assert.equal(texts.addToCart, "Buy");
    assert.equal(texts.empty, PRODUCT_LIST_TEXT_TABLES.en.empty);
  });
});

describe("fillProductListText", () => {
  it("fills known placeholders and leaves unknown ones", () => {
    assert.equal(fillProductListText("od {price}", { price: "10,00 zł" }), "od 10,00 zł");
    assert.equal(
      fillProductListText("Strona {page} z {pageCount} {other}", { page: 2, pageCount: 5 }),
      "Strona 2 z 5 {other}",
    );
  });
});
