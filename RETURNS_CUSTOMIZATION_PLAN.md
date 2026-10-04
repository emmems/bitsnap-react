# Customizable return views

Status: implemented except the items below. Date: 2026-10-04. Decisions confirmed 2026-10-04 (see the end of this file).

Done: steps 1-6, the README part of step 7, and the unit tests of step 8. The backend `ExchangePanelSession` is on instapay `main`. With no `appearance` or `texts`, checkout is pixel-identical and computed-style-identical to the previous build. This covers 10 cases: every appearance scenario, mobile, the empty cart, the unavailable error and the open country list.

Still open:
- `example/returns`, and a `texts` scenario in `example/checkout`.
- `test/consumer` type coverage of the new public API, and new-export checks in `verify-package.mjs`.
- The release (1.6.0).
- Panel edge case: when the 24h returns session expires while the panel token is still valid, the panel Returns screen redirects to panel login without dropping the panel token.

## Scope and current state

Implement in `bitsnap-react`. `bitsnap-js` is the server-side SDK (checkout links, webhooks, notifications), not deprecated and not a UI library; it only needs the optional returns client described in `instapay/docs/customer-returns-implementation-plan.md`.

- **Backend is ready.** `instapay` exposes `public.v1.ReturnsService` on `/api/rpc` (`StartReturnSession`, `VerifyReturnSession`, `ListReturnOrders`, `GetReturnableOrder`, `CreateReturnRequest`, `ListMyReturns`, `GetMyReturn`), see `instapay/proto/public/v1/returns.proto` and `apps/bitsnap/server/public-api/returns.service.ts`.
- **No customer-facing return views exist in the library.** `src/gen/proto/public/v1` has no `returns_pb.ts` yet. `proto.sh` already generates `public/v1/*.proto`, so a regen picks it up. `src/panel/return-url.ts` is the post-login redirect helper and is unrelated.
- **Reference implementation:** checkout `appearance` (`src/components/checkout/appearance.ts`, `appearance.context.tsx`, `checkout.css`, `CHECKOUT_CUSTOMIZATION_PLAN.md`). The returns API should look the same, so a shop can reuse one brand object for both.

Because the return views are new, they are built themeable from the start. No pixel-parity baseline is needed, unlike checkout.

## Public API

Same shape as `CheckoutAppearance`: `theme`, `tokens`, `elements`. One addition, `texts`, because the returns flow is mostly copy that a merchant wants to word themselves (policy and instructions).

```tsx
const brand = {
  theme: "light",
  tokens: { fontFamily: '"Inter", sans-serif', buttonBackground: "#635bff", radius: "12px" },
} as const;

<BitsnapCheckout projectID="…" appearance={brand} />

<BitsnapReturns
  projectID="…"
  appearance={{
    ...brand,
    elements: {
      title: { style: { fontFamily: '"Georgia", serif' } },
      submitButton: { className: "store-primary-button" },
    },
  }}
  texts={{ emailStepTitle: "Return a product", successDescription: "We'll email you once it arrives." }}
/>
```

- `theme: "dark" | "light"`, default `"light"`. Returns is an inline page section, not an overlay. Checkout keeps its `"dark"` default for compatibility.
- `tokens` uses the checkout token set. Add only what return views need: `success`, `warning`, `badgeBackground`/`badgeForeground` for status chips, `inputBackground`. Checkout-only tokens such as `overlay` are ignored.
- `elements` is a typed partial map of returns slots to `{ className?, style? }`, merged last with `cn`. This matches checkout.
- `texts` is a partial override of the locale strings (current locales are `pl`/`en`), with sensible defaults from `locale.ts`. Status labels are overridable per backend status. Checkout gets the same `texts` prop (see step 5).
- **Full re-layout (escape hatch):** export the headless hooks (`useReturnSession`, `useReturnOrders`, `useReturnableOrder`, `useCreateReturn`, `useMyReturns`) and the individual step components. A shop can then compose its own page under `<ReturnsProvider projectID host appearance texts>`, which holds the session, query client and appearance. `BitsnapReturns` is that provider plus the default step router. This is the counterpart to checkout's `children`/trigger customization.
- **Exported step components (public in v1):** `ReturnsEmailStep`, `ReturnsCodeStep`, `ReturnsOrderList`, `ReturnsOrderDetail` (line and quantity selection), `ReturnsConfirmation`, `ReturnsResult`, `ReturnsMyReturnsList` and `ReturnsMyReturnDetail`. Each takes navigation callbacks (`onVerified`, `onSelectOrder`, `onSubmitted`, `onBack`, …) and the data IDs it needs, plus its own `className`. It reads session, appearance and texts from `ReturnsProvider`, and throws a clear error when rendered outside it. Their props are part of the semver contract, so keep them small and callback-based.
- **No render-prop or component-replacement map in v1.** Hooks and steps cover that without making the slot API a stability burden.

### Views and slots

The flow is email → code → orders → order/line selection → confirmation → result, plus "my returns" list and detail/status.

| Group | Slots |
| --- | --- |
| Frame | `root`, `header`, `title`, `description`, `backButton`, `stepIndicator`, `error`, `emptyState`, `skeleton` |
| Auth | `emailForm`, `emailInput`, `codeForm`, `codeInput`, `resendButton`, `logoutButton` |
| Orders | `orderList`, `orderCard`, `orderReference`, `orderDate`, `orderTotal`, `pagination` |
| Selection<br>(no `lineImage`: the API has no line images yet) | `lineList`, `line`, `lineName`, `linePrice`, `lineQuantityControl`, `quantityButton`, `quantityInput`, `lineIneligibleReason`, `noteInput` |
| Confirmation and result | `summary`, `submitButton`, `secondaryButton`, `successState`, `returnReference`, `returnInstructions` |
| My returns | `returnList`, `returnCard`, `statusBadge`, `history`, `historyEntry` |

Each slot is rendered as a `data-bitsnap-returns-slot` attribute, so plain CSS can target it too. The slot list is part of the public contract and is documented in the README.

## Implementation sequence

1. **Extract a shared appearance core (refactor, no behavior change).** Move the generic parts of `appearance.ts` (`omitUndefined`, token→CSS-variable resolution, shadcn variable remapping, slot lookup) into `src/lib/appearance-core.ts`, parameterized by variable prefix, token map and presets. Rebuild `resolveCheckoutAppearance` on it with identical output. The `appearance.test.ts` expectations must not change. Rerun the checkout example; computed styles must be unchanged.
2. **Returns appearance module.** Add `src/components/returns/appearance.ts` with `ReturnsAppearance`, `RETURNS_SLOT_NAMES`, `--bitsnap-returns-*` variables and `light`/`dark` presets. Also add `appearance.context.tsx` with `ReturnsAppearanceProvider`/`useReturnsSlot`, and `returns.css`, where every rule is scoped to `[data-bitsnap-returns]` in `@layer components`. Extend the `postcss.config.js` exclude to `/\[data-bitsnap-(checkout|returns)/`. If any Radix popover/select is used, give its portal content the same boundary, the way `CountrySelector` does.
3. **Data layer.** Generate `returns_pb` and the connect-query hooks for `public/v1/returns.proto` (see "Codegen" below), and add `rpcProvider.returns`. Keep the session token per `<BitsnapReturns>` instance: React state plus `sessionStorage` keyed by project ID, with no global setter and no `localStorage`. Handle `SESSION_EXPIRED` by returning to the email step. Never log the token. Use the per-instance `host` prop, falling back to `setCustomHost`. Fix the `PublicApiClient` transport cache, which ignores the host after first use. Generate an idempotency key once per confirmation screen.
4. **Views.** Build the step components in `src/components/returns/`. Use one submit path per form, disable buttons while pending, and keep quantity controls accessible. Show the per-line `exclusion_reason` for ineligible lines and format money from minor units and currency. Apply `useReturnsSlot` and slot markers on every slot in the table. `BitsnapReturns` composes the steps and is SSR-safe: it renders the email step or a skeleton on the server and needs no `window` during render.
5. **Texts and locale (returns and checkout).** Add returns strings for `pl` and `en`, merge `texts` overrides, and map backend statuses (`submitted`, `approved`, `awaiting_receipt`, `received`, …) to labels. Move the shared machinery into `src/lib/texts.ts`: typed string tables per locale, the locale fallback, and a merge with caller overrides. Then add an optional `texts?: Partial<CheckoutTexts>` prop to `BitsnapCheckout` (`cart`, `emptyCart`, `total`, `delivery`, `chooseCountry`, `nextStep`, `unavailableProducts`, …). Pass it through the existing checkout appearance context, and replace `translate(key)` calls with a `useCheckoutText(key)` hook. Without `texts`, checkout must render exactly the same strings, and `setLocale`/`getLocale` keep working. A `texts` override applies whatever the locale; if a shop needs different copy per language, it passes a different object.
6. **Panel "Returns" screen.** Add `"returns"` and `"return-details"` to `PanelScreen` and a "Returns" item to the panel navigation. Build the screen from the exported step components inside `ReturnsProvider`: orders → selection → confirmation → result, plus "my returns" and detail. This also checks that the step components are composable enough for shops.
   - **Session:** reuse the panel login, with no second code. The panel access token is a server-side lucia session whose row holds the customer email, so the backend can trust that email. `ReturnsService` does not accept panel tokens today, so add one backend RPC in `instapay`: `ExchangePanelSession(project_id, access_token, environment) → session_token, expires_at`. It validates the lucia session, takes the email from the session (never from the request), and issues a normal returns session for that email and project. The returns session must not outlive the panel session. Reject invalid or expired tokens with `SESSION_EXPIRED`. Rate-limit it like `VerifyReturnSession`. Add the RPC to `returns.proto` and cover it in `returns.service.test.ts`. On the client, `ReturnsProvider` takes an optional `panelAccessToken`; when it is set, the provider exchanges it on mount and the step router starts at the order list. When the panel logs out, the returns session is dropped too.
   - **Appearance:** add an optional `returnsAppearance` prop to `Panel`. When it is omitted, derive `buttonBackground`/`focusRing` from the panel's existing `theme.colors.brand`, so the screen matches the panel without configuration. Existing panel screens and `setTheme` are unchanged.
   - **Fix while touching the code:** pass the session explicitly instead of relying on `localStorage`, and do not log tokens (`PanelOrderHistory.tsx` and `PublicOrderPage.tsx` currently log access tokens).
7. **Exports, docs and example.** Export `BitsnapReturns`, `ReturnsProvider`, the step components and their prop types, the hooks, `ReturnsAppearance*`/`ReturnsTexts`/`CheckoutTexts` types and `RETURNS_SLOT_NAMES` from `src/components/index.ts`. Add a README section mirroring the checkout appearance section, with a slot and token reference, a shared-brand example, CSS-only theming and headless usage. Add `example/returns` with mocked RPC responses that covers every step, empty and error states, both themes, a custom layout composed from the step components, and the panel Returns screen. Extend `example/checkout` with a `texts` case.
8. **Tests and release.** Add resolver tests for returns, a test that the shared core keeps checkout output identical, tests for text merging and fallback (checkout without `texts` keeps its strings), consumer type checks (`test/consumer`) for the new exports, and `test:package`. Publish as an additive minor release (1.6.0). Publishing is a separate, explicitly authorized step.

## Validation

- Existing checkout integrations render identically after step 1, on desktop and mobile.
- Every returns step works with no `appearance`, with the light and dark themes, with partial tokens, and with slot overrides. Restyling must not affect the panel, notifications, checkout or the host page.
- A single brand object passed to both `BitsnapCheckout` and `BitsnapReturns` produces consistent colors and fonts.
- Checkout without `texts` shows the same strings in `pl` and `en`; partial `texts` changes only the given keys.
- A custom page composed from the step components completes the flow. Each step used outside `ReturnsProvider` fails with a clear error.
- Panel: a logged-in panel user opens Returns and sees their orders with no extra code. An expired or logged-out panel token sends them to panel login. A panel token for one email never exposes another customer's orders. Other panel screens look and behave the same.
- End to end against the local `instapay` with a test project: email → `424242`-style code (test mode) → order → quantities → submit → status visible in "my returns" and in the dashboard returns queue.
- The packaged build works in a consumer that does not compile the library's Tailwind source.

## Decisions (confirmed 2026-10-04)

1. The default returns theme is `"light"`. Checkout stays `"dark"`.
2. Checkout also gets `texts` in this change (step 5).
3. Step components are exported publicly in v1, alongside the hooks.
4. The customer `Panel` gets a Returns screen built from the same step components (step 6). It reuses the panel login: the backend exchanges the panel access token (email held in the server-side session) for a returns session.

## Execution

Coding is done by Sonnet 5.5 agents. After each phase, a separate reviewer checks the result before the next phase starts.

- **Backend** (`instapay` worktree `t3code/e1bd0c4a`): `docs/returns-panel-session-exchange-plan.md`. Runs in parallel with phase L1.
- **L1, shared foundations:** steps 1 and 5 (checkout part): the shared appearance core, `src/lib/texts.ts`, and checkout `texts`. Checkout output must be identical without `texts`.
- **L2, returns:** steps 2, 3, 4 and 5 (returns part): returns appearance, data layer, `ReturnsProvider` (including `panelAccessToken` → `ExchangePanelSession`), step components and `BitsnapReturns`.
- **L3, panel and release prep:** steps 6, 7 and 8: panel Returns screen, exports, README, `example/returns`, tests and packaging checks. Do not publish.

Work happens on branch `feat/customizable-returns` in this repo. Changes stay uncommitted until reviewed.

### Codegen

`proto.sh` reads `../instapay/proto`, which is the main checkout on `prod`. Until the backend change is merged, generate from the worktree instead, and do not edit `proto.sh`:

```sh
PATH="/home/emems/.t3/worktrees/instapay/t3code-e1bd0c4a/apps/bitsnap/node_modules/.bin:$PATH" \
protoc -I . --proto_path=/home/emems/.t3/worktrees/instapay/t3code-e1bd0c4a/proto \
  --es_out ./src/gen/proto --es_opt target=ts --es_opt ts_nocheck=true \
  --connect-query_out ./src/gen/proto --connect-query_opt target=ts --connect-query_opt ts_nocheck=true \
  /home/emems/.t3/worktrees/instapay/t3code-e1bd0c4a/proto/public/v1/returns.proto
```

`protoc-gen-connect-query` is not installed in this repo; the `PATH` prefix borrows it from `instapay`. Keep only the new returns files and revert unrelated generated churn.

### Baseline (2026-10-04)

`npm test` passes and `npx tsc --noEmit -p tsconfig.json` reports 0 errors. Both must stay that way after every phase.
