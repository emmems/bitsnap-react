import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { BitsnapModels } from "../../models.ts";
import { ProductList } from "./ProductList.tsx";
import { buildProductListURL, type ProductListData, type PublicListProduct } from "./fetch.ts";
import { formatProductRating, isShowableRating } from "./rating.ts";
import { resolveProductListTexts } from "./texts.ts";

/*
 * Markup of `ProductList` without `showRating`, saved from 1.24.0 (before the
 * rating slot existed). The tests run from the repository root. Set
 * UPDATE_GOLDEN=1 only when a change of the default card is intended.
 */
const GOLDEN_DIR = join(process.cwd(), "src/components/products/__golden__");

function golden(name: string, html: string) {
  const file = join(GOLDEN_DIR, name);
  if (process.env.UPDATE_GOLDEN === "1") {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(file, `${html}\n`);
  }
  assert.ok(existsSync(file), `missing golden ${name}`);
  assert.equal(`${html}\n`, readFileSync(file, "utf8"));
}

function product(n: number, extra: Partial<PublicListProduct> = {}): PublicListProduct {
  return {
    id: `prod${n}`,
    cartItemId: `var${n}`,
    uniqueSlug: `slug-${n}`,
    name: `Product ${n}`,
    shortDescription: n % 2 === 0 ? "Soft cotton" : null,
    image:
      n % 3 === 0
        ? null
        : { url: `https://cdn.example/${n}.jpg`, thumbnailUrl: `https://cdn.example/${n}-t.jpg` },
    price: 1000 * n,
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

/** Every card variant, with and without a rating. */
const ratedData = {
  totalCount: 30,
  items: [
    product(1, { rating: { average: 4.8, count: 12 } }),
    product(2, { compareAtPrice: 2500, priceFrom: true, variantCount: 3, addToCart: false, rating: { average: 5, count: 1 } }),
    product(3, { available: false, rating: { average: 3.5, count: 2 } }),
    product(4, { isRecurring: true, addToCart: false }),
    product(5, { has3d: true, rating: { average: 4.25, count: 22 } }),
  ],
} as ProductListData;

function render(props: Record<string, unknown>) {
  return renderToString(
    createElement(ProductList, {
      projectID: "project-a",
      host: "https://custom.example",
      analytics: false,
      initialData: ratedData,
      ...props,
    } as Parameters<typeof ProductList>[0]),
  );
}

describe("ProductList without showRating", () => {
  it("renders the 1.24.0 markup, ignoring rating data (pl)", () => {
    golden("product-list-pl.html", render({}));
  });

  it("renders the 1.24.0 markup, ignoring rating data (en, dark)", () => {
    golden(
      "product-list-en-dark.html",
      render({ locale: "en-US", appearance: { theme: "dark" } }),
    );
  });
});

/** The `<li>` of a product in server markup. */
function cardOf(html: string, slug: string): string {
  const start = html.lastIndexOf("<li", html.indexOf(`href="/p/${slug}"`));
  return html.slice(start, html.indexOf("</li>", start));
}

describe("ProductListResponseSchema rating", () => {
  const item = product(1);

  it("parses items with and without rating", () => {
    const parsed = BitsnapModels.ProductListResponseSchema.parse({
      totalCount: 2,
      items: [item, { ...item, id: "rated", rating: { average: 4.8, count: 12 } }],
    });
    assert.equal(parsed.items[0].rating, undefined);
    assert.equal("rating" in parsed.items[0], false);
    assert.deepEqual(parsed.items[1].rating, { average: 4.8, count: 12 });
    // The bounds are inclusive.
    for (const rating of [{ average: 0, count: 1 }, { average: 5, count: 1000 }]) {
      assert.deepEqual(BitsnapModels.PublicListProductSchema.parse({ ...item, rating }).rating, rating);
    }
  });

  it("drops a bad rating, keeps the item", () => {
    const badRatings = [
      { average: 5.1, count: 3 },
      { average: -0.1, count: 3 },
      { average: Number.NaN, count: 3 },
      { average: "4.8", count: 3 },
      { average: 4.8, count: 0 },
      { average: 4.8, count: 1.5 },
      { average: 4.8 },
      { count: 3 },
      null,
      "4.8",
    ];
    for (const rating of badRatings) {
      const label = JSON.stringify(rating);
      // Item level: the item parses, without the rating.
      const parsedItem = BitsnapModels.PublicListProductSchema.parse({ ...item, rating });
      assert.equal(parsedItem.rating, undefined, label);
      assert.equal(parsedItem.id, item.id, label);
      // The rating schema itself stays strict.
      assert.equal(BitsnapModels.PublicListProductRatingSchema.safeParse(rating).success, false, label);
    }

    // List level: one bad rating does not fail the page, the other items keep theirs.
    const parsedList = BitsnapModels.ProductListResponseSchema.parse({
      totalCount: badRatings.length + 1,
      items: [
        ...badRatings.map((rating, index) => ({ ...item, id: `bad${index}`, rating })),
        { ...item, id: "rated", rating: { average: 4.8, count: 12 } },
      ],
    });
    assert.equal(parsedList.items.length, badRatings.length + 1);
    for (const parsed of parsedList.items.slice(0, -1)) {
      assert.equal(parsed.rating, undefined, parsed.id);
    }
    assert.deepEqual(parsedList.items.at(-1)?.rating, { average: 4.8, count: 12 });
  });
});

describe("formatProductRating", () => {
  const pl = resolveProductListTexts("pl-PL");
  const en = resolveProductListTexts("en-US");

  it("uses a decimal comma and Polish plural forms for pl", () => {
    assert.deepEqual(formatProductRating({ average: 4.8, count: 12 }, "pl-PL", pl), {
      average: "4,8",
      count: "12",
      label: "Ocena 4,8 na 5, 12 opinii",
    });
    assert.equal(formatProductRating({ average: 5, count: 1 }, "pl-PL", pl)?.label, "Ocena 5,0 na 5, 1 opinia");
    assert.equal(formatProductRating({ average: 4, count: 22 }, "pl-PL", pl)?.label, "Ocena 4,0 na 5, 22 opinie");
    assert.equal(formatProductRating({ average: 4, count: 15 }, "pl", pl)?.label, "Ocena 4,0 na 5, 15 opinii");
  });

  it("uses a decimal point and English plural forms for en", () => {
    assert.deepEqual(formatProductRating({ average: 4.8, count: 12 }, "en-US", en), {
      average: "4.8",
      count: "12",
      label: "Rated 4.8 out of 5, 12 reviews",
    });
    assert.equal(formatProductRating({ average: 3, count: 1 }, "en", en)?.label, "Rated 3.0 out of 5, 1 review");
    assert.equal(formatProductRating({ average: 3, count: 2 }, "en-GB", en)?.label, "Rated 3.0 out of 5, 2 reviews");
  });

  it("returns null when there is nothing to show", () => {
    assert.equal(formatProductRating(undefined, "pl", pl), null);
    for (const rating of [{ average: 4, count: 0 }, { average: 6, count: 2 }, { average: Number.NaN, count: 2 }]) {
      assert.equal(isShowableRating(rating), false);
      assert.equal(formatProductRating(rating, "pl", pl), null);
    }
  });

  it("falls back to Polish number formatting for an invalid locale", () => {
    assert.equal(formatProductRating({ average: 4.8, count: 2 }, "not_a_locale", pl)?.average, "4,8");
  });
});

describe("ProductList with showRating", () => {
  it("shows star, average and count on rated cards only (pl)", () => {
    const html = render({ showRating: true });

    const rated = cardOf(html, "slug-1");
    assert.match(rated, /data-bitsnap-products-slot="rating"/);
    assert.match(rated, /<span class="sr-only">Ocena 4,8 na 5, 12 opinii<\/span>/);
    assert.match(rated, /<svg[^>]*data-bitsnap-products-slot="ratingStar"[^>]*aria-hidden="true"/);
    assert.match(rated, /<span aria-hidden="true">4,8<\/span>/);
    assert.match(rated, /data-bitsnap-products-slot="ratingCount"[^>]*aria-hidden="true">\(<!-- -->12<!-- -->\)<\/span>/);
    // Exactly one accessible label per card.
    assert.equal(rated.match(/sr-only">Ocena/g)?.length, 1);

    assert.match(cardOf(html, "slug-2"), /Ocena 5,0 na 5, 1 opinia/);
    assert.match(cardOf(html, "slug-3"), /Ocena 3,5 na 5, 2 opinie/);
    assert.match(cardOf(html, "slug-5"), /Ocena 4,3 na 5, 22 opinie/);
    // No rating: nothing at all, no "0 opinii".
    const unrated = cardOf(html, "slug-4");
    assert.doesNotMatch(unrated, /rating|Ocena|opini/);
  });

  it("formats for en", () => {
    const html = render({ showRating: true, locale: "en-US" });
    assert.match(cardOf(html, "slug-1"), /Rated 4\.8 out of 5, 12 reviews/);
    assert.match(cardOf(html, "slug-1"), /aria-hidden="true">4\.8<\/span>/);
    assert.match(cardOf(html, "slug-2"), /Rated 5\.0 out of 5, 1 review</);
    assert.doesNotMatch(cardOf(html, "slug-4"), /review/i);
  });

  it("keeps the price at the bottom of the card, below the rating", () => {
    const html = render({ showRating: true });
    const rated = cardOf(html, "slug-1");
    assert.ok(rated.indexOf('slot="rating"') < rated.indexOf('slot="price"'));
    assert.match(rated, /slot="rating" class="mt-auto /);
    assert.doesNotMatch(rated, /slot="price" class="mt-auto/);
    assert.match(cardOf(html, "slug-4"), /slot="price" class="mt-auto/);
  });

  it("shows nothing for an out-of-range rating", () => {
    const html = render({
      showRating: true,
      initialData: { totalCount: 1, items: [product(1, { rating: { average: 4, count: 0 } })] },
    });
    assert.doesNotMatch(html, /slot="rating"/);
  });

  it("changes nothing else on the card: removing the rating restores the default markup", () => {
    const html = render({ showRating: true })
      .replace(/<p data-bitsnap-products-slot="rating".*?<\/p>/g, "")
      .replace(/slot="price" class="pt-1 /g, 'slot="price" class="mt-auto pt-2 ');
    assert.equal(`${html}\n`, readFileSync(join(GOLDEN_DIR, "product-list-pl.html"), "utf8"));
  });

  it("lets appearance set the star colour and the rating slots", () => {
    const html = render({
      showRating: true,
      appearance: { tokens: { ratingStar: "#ff0000" }, elements: { rating: { className: "my-rating" } } },
    });
    assert.match(html, /--bitsnap-products-rating-star:#ff0000/);
    assert.match(html, /class="[^"]*my-rating/);
  });
});

describe("buildProductListURL rating", () => {
  const base = { projectID: "abc", host: "https://bitsnap.pl", limit: 24, offset: 24 };

  it("adds rating=1 only when asked", () => {
    assert.equal(new URL(buildProductListURL({ ...base, rating: true })).searchParams.get("rating"), "1");
    assert.equal(buildProductListURL(base), buildProductListURL({ ...base, rating: false }));
    assert.equal(new URL(buildProductListURL(base)).searchParams.has("rating"), false);
  });
});
