# Express checkout example

A copy-paste starting point for InPost Pay and Revolut Pay on a storefront that
uses its own product page and cart state. The same components also render
inside `<BitsnapCheckout>`.

```bash
pnpm install
pnpm --filter bitsnap-react build   # or install the published package
```

`ExpressStorefront.tsx` shows:

- `InPostPayButton` on a product page (`productId` + `quantity`) and in a cart
  (`items`), including the official `bindingPlace`;
- `RevolutPayButton` in the same two placements;
- the pending/confirmed status line and the callbacks a custom cart needs.

Notes:

- The backend answers `availability` and the buttons stay hidden unless the
  provider is available for this cart (credentials, adapter, currency). On an
  older backend (404/501) nothing renders.
- The express cart is durable and server-priced. With `items` the SDK never
  edits your own cart state; without it, the Bitsnap cart is the basket.
- Cancel and failure keep the cart. Products added while paying survive the
  confirmed cleanup.
- Load `bitsnap-react/dist/index.css` once if you also use `BitsnapCheckout`.
  The provider buttons bring their own branding and do not need Tailwind.
- InPost Pay is one page-wide widget: mount one InPost button per page.
