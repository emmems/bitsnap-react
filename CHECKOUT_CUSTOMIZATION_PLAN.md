# Backward-compatible checkout appearance

Status: implemented. The API, the drawer/dropdown boundaries, the slot overrides, the checkout stylesheet, the README section and `example/checkout` are in place. `example/checkout` renders the packaged library with mocked responses; with no `appearance` the drawer, the portalled country list, the empty cart and the error state are pixel-identical and computed-style-identical to the pre-change build on desktop and mobile.

## Scope and current behavior

Implement in `bitsnap-react`. `bitsnap-js` contains checkout API helpers, not the checkout UI. The separate hosted checkout in `instapay` is outside this change.

- `src/components/index.ts` exports `BitsnapCart` as `BitsnapCheckout` and exposes `BitsnapCartProps`.
- `BitsnapCart.tsx`: existing `className` and `children` customize the trigger; `numberOfProductsInCartOptions` customizes the badge.
- `CartComponent.tsx`: drawer renders through a portal into `document.body`, has a forced `dark` class and hardcoded appearance.
- `CartComponentContent.tsx` and `SingleProduct.tsx`: hardcoded colors, typography and button styles; quantity controls use shared UI primitives.
- `CountrySelector.tsx` and `src/ui/select.tsx`: dropdown renders through a second Radix portal, with its own forced dark styling.
- `src/global.css` and `postcss.config.js`: styles and generic theme variables are shared with notifications/panel and prefixed with `.bitsnap-react`. Generated CSS must be inspected because prefixing affects root/dark selectors.
- `package.json` exports `bitsnap-react/dist/index.css`; retain this import path and existing JS/type exports.

## Proposed public API

Add one optional `appearance?: CheckoutAppearance` prop to `BitsnapCartProps`. Export the new types through `src/components/index.ts`. All fields are optional.

```tsx
<BitsnapCheckout
  projectID="your-project-id"
  appearance={{
    theme: "light",
    tokens: {
      fontFamily: '"Inter", sans-serif',
      background: "#ffffff",
      foreground: "#202020",
      buttonBackground: "#635bff",
      buttonForeground: "#ffffff",
      radius: "12px",
    },
    elements: {
      title: { style: { fontFamily: '"Georgia", serif', fontSize: "28px" } },
      checkoutButton: { className: "store-checkout-button" },
    },
  }}
/>
```

`theme` accepts `"dark" | "light"`; omitted means today's fixed dark presentation. Avoid automatic system theme selection in the initial release.

`tokens` supplies checkout-wide font family, base font size, background, surface, foreground, muted foreground, border, button background/foreground/hover background, hover surface, focus ring, error color, overlay color and radius. Use typed CSS string values. Keep current responsive widths/layout by default; widths can be overridden through panel CSS/media queries.

`elements` is a typed partial map of stable slots to `{ className?: string; style?: React.CSSProperties }`. Initial slots: root, overlay, panel, header, title, closeButton, productList, product, productImage, productName, productPrice, quantityControl, quantityInput, quantityButton, removeButton, summary, totalLabel, totalValue, deliveryText, countryLabel, countryTrigger, countryDropdown, countrySearch, countryOption, paymentButtons, checkoutButton, emptyState, error, skeleton.

Use CSS variables for shared branding, element styles for direct per-element font/appearance changes, and element classes for pseudo states and responsive styles. Font assets are loaded by the consuming application; the library only applies the supplied family.

## Compatibility contract

1. No `appearance`, or an empty object, preserves the current rendered appearance, font behavior, layout, responsive breakpoints, animations and checkout actions.
2. Existing `className` remains trigger-only; existing children, badge options, callbacks, locale, exported methods and props keep their meanings.
3. Partial configuration changes only the specified appearance properties. Do not add a new default font or impose a typography reset.
4. Store appearance in component props/context, separate from global cart/project configuration. Do not add a global setter or reuse the panel's `setTheme` API.
5. Keep CSS isolated to checkout roots and detached dropdown content. No changes to host page, notifications or panel styling.
6. Preserve native Apple Pay/Google Pay artwork and font behavior. Theme their surrounding layout; use only supported provider button options if those are exposed later.

## Implementation sequence

1. **Capture the baseline.** Create a minimal checkout example with deterministic mocked checkout responses. Record desktop/mobile screenshots for a populated cart, empty cart, loading, unavailable product, error and open country selector. Capture inherited font behavior and quantity button styles as actually rendered, rather than assuming the forced dark class controls every shared primitive.
2. **Add the API and resolver.** Create `src/components/checkout/appearance.ts` with types and a pure resolver for theme defaults and partial tokens. Add the optional prop and exported types. Document stable slot names and the compatibility contract.
3. **Apply appearance at portal boundaries.** Pass appearance from `BitsnapCart` into `CartComponent`; provide it through a checkout-only context around content. Add a stable `data-bitsnap-checkout` marker and `--bitsnap-checkout-*` properties on the DOM theme boundary. Account for the `.bitsnap-react` prefix when styling the boundary itself. Keep SSR's current null behavior for the drawer.
4. **Handle the detached dropdown.** Give Radix content a checkout-scoped DOM theme boundary and propagate resolved variables, font and selected mode explicitly. If a small optional portal-container/wrapper extension is needed in `src/ui/select.tsx`, leave its existing default behavior intact. Verify both ancestor-prefix matching and dark variant matching in built CSS; a class on the content alone may not satisfy ancestor selectors.
5. **Migrate presentation incrementally.** Add checkout-specific CSS and replace hardcoded visual declarations in the drawer, product/quantity controls, summary, country selector, button and feedback states with variables preserving existing computed defaults. Scope adapters for shared UI primitives to checkout. Keep event handlers, fetching, amounts, country selection and payment creation unchanged.
6. **Wire element overrides.** Merge built-in classes first and caller classes last using `cn` where applicable; apply caller inline styles after internal styles while retaining required unspecified styles. Add stable `data-bitsnap-checkout-slot` markers. Explicit child font declarations must honor the checkout font token; individual slot font overrides take precedence. Public styles do not guarantee arbitrary class specificity: document that `cn` resolves Tailwind conflicts, while ordinary CSS follows the normal cascade. Avoid dynamically constructing Tailwind utilities from token values.
7. **Document and validate packaging.** Add README examples for an unchanged integration, custom brand/font, individual element fonts, external CSS hover/focus states and CSS imports. Build ESM/CJS bundles and declaration files; verify root imports, legacy exports and the existing CSS subpath from a consumer fixture. Ship as an additive minor release after validation.

## Validation and acceptance

- Compare omitted/empty appearance against the captured baseline, including host font inheritance, both portals and mobile dimensions.
- Verify partial tokens, light theme, independent element fonts, hover/focus/disabled/error/loading states and an appearance prop update while open.
- Verify branding works through `Bitsnap.showCart()` as well as the trigger, without changing cart add/update/remove, country selection, checkout redirect or wallet button behavior.
- Check unrelated panel/notifications and host DOM retain their appearance; variables and dropdown styling must not leak globally.
- Exercise the packaged output in a consumer that does not compile library Tailwind source: token customization and ordinary CSS classes must still work.
- Add focused automated coverage for fallback resolution, portal propagation and legacy consumer type compatibility. Use the example for visual comparisons; do not create tests that merely repeat class strings. There is no configured test script in the current package, so choose the smallest necessary test setup during implementation.

Completion means old integrations need no edits, new integrations can change shared colors/fonts and individual element appearance, and detached country content receives the same theme correctly. This document specifies future validation; no implementation tests were run while preparing the plan.
