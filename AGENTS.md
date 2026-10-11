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
- For the panel, configure `setProjectID` and `setLoginURL("/panel/login")` on
  the client before mounting `<PanelProvider><Panel /></PanelProvider>`.
  Mount `<PanelProvider><PanelLogin /></PanelProvider>` at that login URL.

## Avoid these mistakes

- Neither checkout UI component has a test API key prop. For test purchases, use
  `Bitsnap.createCheckout(projectID, { items, apiKey, testMode: true })` from
  `bitsnap-js` on the server. Do not pass keys to React's `createCheckout`.
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
