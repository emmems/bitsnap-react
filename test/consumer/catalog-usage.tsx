import { ProductList, useProducts, type ProductListAppearance } from "bitsnap-react";
import {
  ProductList as CatalogProductList,
  type ProductListProps,
  type ProductListTexts,
  type PublicListProduct,
} from "bitsnap-react/catalog";
import type { BitsnapModels } from "bitsnap-react/models";

/** Consumer fixture for the product list API of this package. */

const appearance: ProductListAppearance = {
  theme: "light",
  tokens: { buttonBackground: "#111827" },
  elements: { card: { className: "shop-card" } },
};

const texts: Partial<ProductListTexts> = { addToCart: "Buy" };

const model: BitsnapModels.PublicListProduct = {} as PublicListProduct;
const rating: BitsnapModels.PublicListProductRating | undefined = model.rating;
void rating?.average;

// `rating` is an optional key of exactly `{ average, count } | undefined`
// (the `.catch(undefined)` that drops a bad rating must not widen it).
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const ratingType: Equals<
  BitsnapModels.PublicListProduct["rating"],
  { average: number; count: number } | undefined
> = true;
const ratingKeyIsOptional: {} extends Pick<BitsnapModels.PublicListProduct, "rating">
  ? true
  : false = true;
void ratingType;
void ratingKeyIsOptional;

export function Catalog(props: Partial<ProductListProps>) {
  const { products, totalCount, page, pageCount, setPage, isLoading, error, refetch } =
    useProducts({ projectID: "project", pageSize: 12, search: "shirt" });

  return (
    <>
      <ProductList
        projectID="project"
        locale="en-US"
        appearance={appearance}
        texts={texts}
        productHref={(product) => `/shop/${product.uniqueSlug}`}
        onAddToCart={async (product) => {
          void product.id;
        }}
        renderItem={(product, context) => <a href={context.href}>{product.name}</a>}
      />
      <CatalogProductList projectID="project" showRating appearance={{ tokens: { ratingStar: "#d97706" } }} {...props} />
      <button onClick={() => setPage(page + 1)} disabled={isLoading || page >= pageCount}>
        {products.length} / {totalCount} {error?.message} {model.name}
        <span onClick={refetch} />
      </button>
    </>
  );
}
