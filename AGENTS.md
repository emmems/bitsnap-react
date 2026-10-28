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

## Course view (`PanelCourse`)

The customer panel opens a purchased course inside the panel (no redirect to
kursy.bitsnap.pl). Import `PanelCourse` from `bitsnap-react/course`; the panel
itself loads it with a dynamic import, so the video player (hls.js), DOMPurify
and the tests are not in the main ESM bundle.

```tsx
import { PanelCourse } from "bitsnap-react/course";

<PanelCourse accessId={product.accessId} onBack={() => history.back()} />
```

Rules:

- Data goes through `CourseDataSource` (`src/course/types.ts`). The default is
  `createRpcCourseDataSource({ accessId })`: `UserPanelCourseService` on
  `{host}/api/rpc` with the panel session token (`accessId` + `accessToken`
  like `userPanelGetCourseDetails`; no project or course id in requests).
  Pass `dataSource` to feed another source (the creator preview of the
  dashboard) and `preview` to show the "Podgląd" badge and skip progress saving.
- Deep links: the panel keeps the course in the URL, `?state=course&course=<accessId>&item=<lessonOrTestId>`
  (values are JSON-encoded by `useUrlSearchParams` like the other params; plain
  values work too). Reload keeps the lesson; browser back/forward move between
  lessons. `PanelProductGrid` opens courses directly; `PanelProductDetails` of a
  course product shows an "open the course" button.
- Lesson HTML is always rendered through `sanitizeLessonHtml` (DOMPurify; no
  iframes, forms, inline styles). It returns `""` without a DOM, so lesson HTML
  never appears in server-rendered output.
- Video: `hls.js`, native HLS on Safari. Position is saved every ~15 s while
  playing and on pause/end/leaving; a lesson completes at 80 %, as in the LMS (`logic.ts`).
- Texts: `texts` prop over Polish/English tables (`src/course/texts.ts`).
- The contract is drafted in `proto-draft/` (see its README); generated code in
  `src/gen/proto/public/v1/user_panel_course_*` comes from
  `./proto-course-draft.sh`.

Tests: `npm test` (unit), `pnpm test:catalog-ssr` (builds, then renders the
list on the server from `initialData`), `pnpm test:course-ssr` (builds, then
renders the course view on the server). Never run `pnpm build:publish` unless
asked to release: it publishes to npm.
