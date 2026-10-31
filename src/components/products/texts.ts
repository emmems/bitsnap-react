import {
  lookupText,
  resolveTexts,
  type LocaleTables,
} from "@/src/lib/texts";

/**
 * Every string `ProductList` renders. Pass a partial object through the
 * `texts` prop to override any of them, whatever the locale. Placeholders
 * (`{price}`, `{page}`, `{pageCount}`) are filled by the component.
 */
export type ProductListTexts = {
  /** "Add to cart" button of products that can be bought straight from the list. */
  addToCart: string;
  /** Button label while the product is being added. */
  addingToCart: string;
  /** Button label after the product was added. */
  addedToCart: string;
  /** Message shown when adding to the cart failed. */
  addToCartError: string;
  /** Link of products with variants, to pick one on the product page. */
  chooseOptions: string;
  /** Link of products that cannot be added from the list (subscriptions). */
  viewProduct: string;
  /** Label of products that are out of stock. */
  unavailable: string;
  /** Badge of subscription products. */
  subscription: string;
  /** Badge of products with a 3D model. */
  model3d: string;
  /** Screen reader label of the 3D badge. */
  model3dLabel: string;
  /** Price of products whose variants differ in price. `{price}` is the lowest one. */
  priceFrom: string;
  /** Screen reader label of the struck-through regular price. */
  originalPrice: string;
  /** Accessible label of the loading skeleton. */
  loading: string;
  /** Shown when the shop has no products (or none matches the search). */
  empty: string;
  /** Shown when the products could not be loaded. */
  error: string;
  /** Retry button of the error state. */
  retry: string;
  /** Accessible label of the pagination. */
  pagination: string;
  previousPage: string;
  nextPage: string;
  /** Page indicator. `{page}` and `{pageCount}` are filled in. */
  pageOf: string;
};

export type ProductListTextKey = keyof ProductListTexts;

export const PRODUCT_LIST_TEXT_TABLES: LocaleTables<ProductListTextKey> = {
  en: {
    addToCart: "Add to cart",
    addingToCart: "Adding…",
    addedToCart: "Added to cart",
    addToCartError: "Could not add to the cart. Try again.",
    chooseOptions: "Choose",
    viewProduct: "View",
    unavailable: "Unavailable",
    subscription: "Subscription",
    model3d: "3D",
    model3dLabel: "3D model",
    priceFrom: "from {price}",
    originalPrice: "Original price",
    loading: "Loading products",
    empty: "There are no products to show.",
    error: "Could not load the products.",
    retry: "Try again",
    pagination: "Pagination",
    previousPage: "Previous",
    nextPage: "Next",
    pageOf: "Page {page} of {pageCount}",
  },
  pl: {
    addToCart: "Dodaj do koszyka",
    addingToCart: "Dodawanie…",
    addedToCart: "Dodano do koszyka",
    addToCartError: "Nie udało się dodać do koszyka. Spróbuj ponownie.",
    chooseOptions: "Wybierz",
    viewProduct: "Zobacz",
    unavailable: "Niedostępny",
    subscription: "Subskrypcja",
    model3d: "3D",
    model3dLabel: "Model 3D",
    priceFrom: "od {price}",
    originalPrice: "Cena przed obniżką",
    loading: "Ładowanie produktów",
    empty: "Brak produktów do wyświetlenia.",
    error: "Nie udało się załadować produktów.",
    retry: "Spróbuj ponownie",
    pagination: "Paginacja",
    previousPage: "Poprzednia",
    nextPage: "Następna",
    pageOf: "Strona {page} z {pageCount}",
  },
};

/** Default texts for a locale merged with the caller overrides. */
export function resolveProductListTexts(
  locale: string,
  overrides?: Partial<ProductListTexts>,
): ProductListTexts {
  return resolveTexts(PRODUCT_LIST_TEXT_TABLES, locale, overrides);
}

export function getProductListText(
  key: ProductListTextKey,
  locale: string,
  overrides?: Partial<ProductListTexts>,
): string {
  return lookupText(resolveProductListTexts(locale, overrides), key);
}

/** Replaces `{name}` placeholders. Unknown placeholders stay untouched. */
export function fillProductListText(
  text: string,
  values: Record<string, string | number>,
): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
