# Checkout appearance example

A minimal store page that renders the packaged checkout with deterministic mocked
responses, so every appearance state can be inspected without a backend.

```bash
pnpm install --ignore-workspace   # standalone project, the library is linked
pnpm --filter bitsnap-react build # the example consumes bitsnap-react/dist
pnpm dev
```

## What it covers

| URL                                | State                                          |
| ---------------------------------- | ---------------------------------------------- |
| `/?scenario=default`                | No appearance - must stay identical to before   |
| `/?scenario=dark`                   | `theme: "dark"`                                |
| `/?scenario=light`                  | `theme: "light"`                               |
| `/?scenario=tokens`                 | Brand colors, font family, radius               |
| `/?scenario=elements`               | Per element fonts and classes                   |
| `/?scenario=external-css`           | Slot classes styled from the app stylesheet     |
| `/?cart=empty`                      | Empty cart                                     |
| `?cart=many`                        | Ten lines: the list scrolls, header and footer stay |
| `/?unavailable=1`                   | Unavailable product + checkout error            |
| `?latency=1500`                     | Loading skeletons                              |
| `?fail=1`                           | Products cannot be loaded (retry state)        |
| `?priceChange=1`                    | Price updated mark (open once without it first) |
| `?missing=1`                        | Unavailable row                                |
| `?buy=pending`                      | Busy "Go to checkout"                          |
| `?country=none&countriesLatency=4000` | Country-missing hint                         |
| `?presentation=drawer\|dialog`      | Right drawer (default) or centred dialog; bottom sheet below 640 px or at most 500 px high |
| `?locale=pl`                        | Polish texts and country names                 |
| `?logos=1`                          | Payment choice with cash on delivery and logos in every card (open on `localhost`) |
| `?open=1`                           | Opens the cart on load                         |
| `/?scenario=custom`                 | Square corners, brand button, darker control outline (19a tokens) |
| `?theme=host`                       | Host page with its own CSS variables; the cart follows them |
| `?theme=host&dark=1`                | The same page in its dark mode (`dark` class on `<html>`; the button toggles it) |
| `?theme=shadcn` (`&dark=1`)         | A shadcn/ui site; tokens are `var(--background)`, `var(--primary)`, ... |
| `?host=preflight`                   | Host page with Tailwind v3 preflight and generic element rules (`src/preflight.css`), loaded after the cart's CSS |
| `?font=latin`                       | Host font with latin glyphs only (Google Fonts `text=` subset): Polish letters come from the fallback font |
| `?express=1`                        | Apple Pay, Google Pay, InPost Pay and Revolut Pay answer "available" (test mode); the buttons are the providers' own |
| `?css=cart`                         | Only `bitsnap-react/cart/cart.css` instead of `dist/index.css` |
| `?consent=1`                        | The consent banner (preview mode); hidden while the cart is open |

The radio buttons switch the appearance while the cart is open, which is part of
the supported behaviour.

## Notes

- `src/mocks.ts` stubs `fetch` (products, countries, payment methods, buy and,
  with `?express=1`, the wallet RPCs and the express API) and adds the
  `script[data-name="internal-cart"]` tag the library reads the project ID from.
- `?express=1` needs the network: the providers' scripts load from Apple,
  Google, InPost and Revolut. Chromium has no `ApplePaySession`; the example
  stubs it. Google Pay shows only for a buyer with a saved card
  (`existingPaymentMethodRequired`), so in a fresh browser it stays hidden and
  Apple Pay takes the row. InPost's widget needs a merchant client id InPost
  knows; with the example's made-up one it draws no button.
- The stylesheet comes from the package (`bitsnap-react/dist/index.css`, or
  `cart.css` with `?css=cart`) and no
  Tailwind source is compiled here, which is how a real integration works.
  `vite.config.ts` disables PostCSS on purpose: running a selector prefixer over
  the shipped stylesheet would scope every rule twice.
