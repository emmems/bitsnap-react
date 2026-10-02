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
| `/?unavailable=1`                   | Unavailable product + checkout error            |
| `?latency=1500`                     | Loading skeletons                              |

The radio buttons switch the appearance while the cart is open, which is part of
the supported behaviour.

## Notes

- `src/mocks.ts` stubs `fetch` (products, countries, buy) and adds the
  `script[data-name="internal-cart"]` tag the library reads the project ID from.
- The stylesheet comes from the package (`bitsnap-react/dist/index.css`) and no
  Tailwind source is compiled here, which is how a real integration works.
  `vite.config.ts` disables PostCSS on purpose: running a selector prefixer over
  the shipped stylesheet would scope every rule twice.
