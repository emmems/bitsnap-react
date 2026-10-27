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
      <CatalogProductList projectID="project" {...props} />
      <button onClick={() => setPage(page + 1)} disabled={isLoading || page >= pageCount}>
        {products.length} / {totalCount} {error?.message} {model.name}
        <span onClick={refetch} />
      </button>
    </>
  );
}
