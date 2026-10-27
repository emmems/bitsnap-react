# Agent instructions

## Product list (`ProductList`, `useProducts`)

Renders a shop's product catalog. Used by the Bitsnap custom-domain home page
and meant for embedding on merchants' own sites. Import from `bitsnap-react` or
from `bitsnap-react/catalog` (list and hook only; the checkout is loaded lazily
on the first "Add to cart" click). Load `bitsnap-react/dist/index.css` once.

Minimal embed:

```tsx
import { ProductList } from "bitsnap-react/catalog";
import "bitsnap-react/dist/index.css";

export function Shop() {
  return (
    <ProductList
      projectID="PROJECT_ID"
      locale="pl-PL"
      productHref={(p) => `https://shop.example.com/p/${p.uniqueSlug}`}
      onAddToCart={(p) => myCart.add(p.cartItemId ?? p.id)} // optional, default is Bitsnap.addProductToCart
    />
  );
}
```

Rules:

- Endpoint: `GET {host}/api/integrations/{projectID}/public-commerce/product-list?limit&offset&locale&search`
  (`limit` default 24, max 48). `host` defaults to `https://bitsnap.pl`.
- Prices are minor units (grosze, cents).
- Pass `initialData` (`{ items, totalCount }`, the first page) to render the
  products in the server HTML. Without it the server renders a skeleton and the
  browser fetches.
- `productHref` defaults to the relative `/p/{uniqueSlug}`. On any site other
  than the shop's own domain, return the full URL.
- CORS: the embedding site's domain must be in the project's site, success or
  cancel URLs, or in the allowed domains. Otherwise the browser blocks the
  request. Custom domains need nothing.
- Add to cart: products with `addToCart: true` get a button calling
  `onAddToCart(product)`, or by default `Bitsnap.addProductToCart(id, 1)` and
  then `Bitsnap.showCart()` (mount `BitsnapCheckout` on the page). It adds
  `cartItemId ?? id` (the variant ID for single-variant products). The default
  action sets the cart's global project ID/host from the list props only when
  the page has not set them; if the page cart belongs to another project or
  host it changes nothing, warns and shows the error state, so such a page
  must pass `onAddToCart`.
- Styling: `appearance={{ theme, tokens, elements }}`, scoped to
  `[data-bitsnap-products]`. Texts: `texts`, Polish and English defaults by
  `locale`.
- Do not use React Query, `setProjectID` or `setCustomHost` for the list
  itself; `useProducts` takes everything as arguments.

Tests: `npm test` (unit), `pnpm test:catalog-ssr` (builds, then renders the
list on the server from `initialData`). Never run `pnpm build:publish` unless
asked to release: it publishes to npm.
