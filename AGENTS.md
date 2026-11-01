# Integrate bitsnap-react

`bitsnap-react` provides checkout, Apple Pay, returns and the customer panel.
Use a Next.js client component or an Astro React island. Use `bitsnap-js` on the
server for products, secret checkout operations and webhooks.

## Install and configure

```sh
npm install bitsnap-js bitsnap-react
# Astro also needs @astrojs/react: npx astro add react
```

Use these application env names; the SDK does not load them:

- `BITSNAP_PROJECT_ID`: public. Pass it from the server as `projectID`.
  If using a public env var, only the project ID may use `NEXT_PUBLIC_`/`PUBLIC_`.
- `BITSNAP_API_KEY`: secret, server-only. Never `NEXT_PUBLIC_*`/`PUBLIC_*`.
- `BITSNAP_WEBHOOK_SECRET`: separate webhook secret, also server-only.

Store secrets in ignored `.env.local` (Next.js), `.env` (Astro) or deployment
server variables. Normal checkout needs no API key. Never pass keys in props,
HTML, browser checkout calls or agent chat.

## Minimal checkout

```tsx
"use client";

import { Bitsnap, BitsnapCheckout, setProjectID } from "bitsnap-react";
import "bitsnap-react/dist/index.css";

type Product = { id: string; name: string };

export default function Checkout({ projectID, products }: {
  projectID: string;
  products: Product[];
}) {
  async function buy(id: string) {
    setProjectID(projectID);
    const error = await Bitsnap.addProductToCart(id, 1);
    if (error) {
      alert("Could not add this product. Try again.");
      return;
    }
    Bitsnap.showCart();
  }

  return (
    <>
      {products.map((product) => (
        <button key={product.id} onClick={() => buy(product.id)}>
          Buy {product.name}
        </button>
      ))}
      <BitsnapCheckout projectID={projectID} locale="pl" />
    </>
  );
}
```

Fetch products with `BitsnapBackend` on the server and pass only public fields.
Import the exported CSS. Configure the project before calling cart methods.
For Astro, omit `"use client"`, and mount with `client:load` or `client:visible`.

## Other components

- `ApplePayButton` requires `items` with `id`, `name`, `price` (minor units) and
  `quantity`. It has no `projectID` prop. Call `setProjectID(projectID)` on the
  client before mounting. Use an effect and a ready flag for standalone buttons.
  Configure Apple Pay and test on an eligible device over HTTPS.
- `BitsnapReturns` takes `projectID` and optional `locale`, `appearance`, `texts`.
- `Product3DViewer` (`bitsnap-react/viewer3d`, ESM only) takes `projectID`,
  `productId`, optional `variantId`; it needs `three`, `@react-three/fiber` and
  `@react-three/drei` installed. Never import it from the main entry.
- For the panel, configure `setProjectID` and `setLoginURL("/panel/login")` on
  the client before mounting `<PanelProvider><Panel /></PanelProvider>`.
  Mount `<PanelProvider><PanelLogin /></PanelProvider>` at that login URL.

## Avoid these mistakes

- Neither checkout UI component has a test API key prop. For test purchases, use
  `Bitsnap.createCheckout(projectID, { items, apiKey, testMode: true })` from
  `bitsnap-js` on the server. Do not pass keys to React's `createCheckout`.
- `bitsnap-react`'s own `createCheckout` sends `apiKey` as an `Authorization:
  Bearer` header and is server-side only. Never call it from a client component,
  island or browser bundle. A normal checkout needs no key; omit `apiKey`.
- `bitsnap-react` does not export `handleWebhook`. Import it from `bitsnap-js`
  only in a server route. Pass `request.text()` unchanged, full URL and headers.
  Verify `X-Content-Signature` or `sig` before processing or fulfilment.
- In Next.js use a Node route at `app/api/bitsnap/webhook/route.ts`. In Astro use
  `src/pages/api/bitsnap/webhook.ts`, `prerender = false` and a Node adapter;
  check `output`. A static build alone cannot receive webhook POSTs.
- Check the error object returned by `addProductToCart`. Do not show a successful
  cart state when adding the item failed.
- Mount one cart per page/project. Project configuration is global.

## Verify

1. Configure a test gateway and make a test purchase with a project API key used
   for server test checkout. Current keys have no distinct test/live prefix.
2. Confirm a Test webhook arrives and HMAC verifies. Reject tampered bodies and
   wrong projects. Deduplicate events and separate test/production fulfilment.
3. Build and grep actual secret values in the client output and source maps.
   Set nonempty variables privately; quiet grep avoids printing keys.

```sh
grep -rFq -- "$BITSNAP_API_KEY" .next/static
grep -rFq -- "$BITSNAP_WEBHOOK_SECRET" .next/static
# Astro with Node: use dist/client/_astro instead of .next/static.
```

Exit 0 means a leak, 1 means no match, 2 means a search error. Check the adapter's
client output path. Fix leaks and rotate exposed keys before deploying.

## Full recipes

- [Next.js](https://docs.bitsnap.pl/en/guides/nextjs/)
- [Astro](https://docs.bitsnap.pl/en/guides/astro/)
- [SDK reference](https://docs.bitsnap.pl/en/reference/example/)
- [MCP](https://docs.bitsnap.pl/en/guides/mcp/)
- [bitsnap-integrate skill](https://docs.bitsnap.pl/skills/bitsnap-integrate/SKILL.md)

## Internals (for contributors)

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
- Cart links: `Bitsnap.addProductToCart(id, qty, metadata, { url })` stores the
  product page with the cart line (localStorage), and the cart links the
  item's image and name to it. Relative URLs are resolved against the page
  that adds the item; only `http`/`https` are kept (`cartItemURL`). The
  `ADD_TO_CART` postMessage accepts `url` too. `ProductList`'s default action
  passes `productHref(product)`.
- Styling: `appearance={{ theme, tokens, elements }}`, scoped to
  `[data-bitsnap-products]`. Texts: `texts`, Polish and English defaults by
  `locale`.
- Do not use React Query, `setProjectID` or `setCustomHost` for the list
  itself; `useProducts` takes everything as arguments.

## Cart checkout (`BitsnapCheckout`)

"Next step" posts the cart to `{host}/api/integrations/{projectID}/public-commerce/buy`
(`createPaymentURL` in `src/components/checkout/methods.ts`, body built by
`cartLinkRequest` in `CartProvider.tsx`) and redirects to the returned `url`.

- Payment method choice: while the drawer shows a cart with a country,
  `payment-methods` gets the same body (react-query, keyed by the cart lines,
  country and locale). A non-null `choice` renders `PaymentMethodChoice`
  (online, transfer / BLIK to the seller's phone, `cod` cash on delivery; first
  of `methods` selected) and `/buy` gets `paymentMethod`. `cod` refused by the
  shop comes back as `gateway-not-configured` and shows
  `paymentMethodCodUnavailable`. Anything else (null, error, 404 of an old backend, 5 s
  timeout) is "no choice": plain `/buy`, no `paymentMethod`. A click before the
  answer waits for it and, if a choice arrives, shows it instead of buying.
  While a new country or cart is asked for, the last choice stays as
  `placeholderData` without `cod` (`withoutCod`); a click then fetches the new
  answer and buys only if it still offers the selected method.
- Pending order (`pending-order.ts`): the cart is kept until a
  `/payment/common/...` order is paid, or `placed` (a `cod` order the buyer
  accepted on the order's details form; it is paid to the courier). A
  `/payment/manualPayment/<project>/<order>` page is a placed order paid
  outside Bitsnap, so the cart is cleared at once.
- Express buttons (Apple Pay, Google Pay) are separate online flows.
- Tests mock `fetch` by URL: `cart-buy-error.test.tsx`, `cart-payment-method.test.tsx`.

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
