# Bitsnap Checkout

## Instructions for coding agents

Read [AGENTS.md](./AGENTS.md) before integrating this package. Follow the
[Next.js](https://docs.bitsnap.pl/en/guides/nextjs/) or
[Astro](https://docs.bitsnap.pl/en/guides/astro/) recipe. Keep API keys and webhook
secrets on the server.

The library is designed to provide a complete e-commerce checkout solution that can be easily integrated into web applications, with focus on:

- User experience
- Payment processing
- Cart management
- Product management
- Webhook support

It uses modern React patterns and libraries like:

- React Query for data fetching
- Zod for schema validation
- Protocol Buffers for data serialization
- Tailwind CSS for styling

## Express checkout: InPost Pay and Revolut Pay (unreleased)

The cart-aware express buttons are additive: a shop that does not enable the
providers sees no change, older SDK versions keep working with the new backend,
and this SDK hides a button when an older backend does not implement the express
API (404/501) or the provider is not available.

```tsx
"use client";

import { InPostPayButton, RevolutPayButton, setProjectID } from "bitsnap-react";

setProjectID(projectID);

// A product page: the first click adds the product to the Bitsnap cart.
<InPostPayButton projectID={projectID} productId={variant.id} quantity={1} locale="pl" />

// A cart page, including the SDK's own cart:
<RevolutPayButton projectID={projectID} locale="pl" />;
```

Inside `<BitsnapCheckout>` both buttons render in the express area of the cart
drawer when the backend reports them available. `items` lets a custom cart
layout pass its lines instead of using the Bitsnap cart. Provider scripts load
lazily in the browser only; server rendering outputs no clickable button.

The browser cart is uploaded to a durable, server-priced cart before a provider
starts. Updates carry the revision they saw. A stale tab is reconciled with a
three-way merge against the last confirmed lines: disjoint edits are combined,
and a line both sides changed differently is reported as a cart conflict
instead of being overwritten. The cart token stays in `localStorage` scoped to
the project, host and environment. Cancel and failure keep the cart. Only a
server-confirmed payment removes the purchased lines, so products added while
paying survive; the next attempt starts a new cart from what is left.

Delivery is quoted through the public pre-order API and sent with both the
availability call and the provider start, so a deliverable cart is never
mounted with zero shipping. If the quote is unavailable the express buttons stay
hidden and the regular checkout remains the fallback. Revolut Pay express does
not collect a shipping address, so its button is hidden for a cart that needs
delivery.

Revolut Pay is confirmed by `revolut/status` (webhook-authoritative), never by
the widget's `success` event. InPost Pay runs the official widget with the
documented `merchantClientId`, basket binding key and basket events; its
`orderCreated` event is only a hint to ask `inpost/status`, and the cart is
cleared only after the signed server-side order state confirms it.

New texts: `expressPending`, `expressConfirmed`, `expressFailed`,
`expressCancelled`, `expressLoadFailed`, `expressCartUnavailable`,
`expressCartConflict`, `expressPriceChanged`, `expressProductUnavailable` (EN/PL
defaults, overridable through `texts`).

## 1.18.0

Customer panel changes after 1.17.0 (`BitsnapPanel` / `PanelPage`, course,
audiobook player, `ProductList`).

- **Panel navigation.** A bottom bar on phones and a sidebar from `md` up:
  Biblioteka, Zamówienia, Zwroty, Konto. The sidebar shows the shop logo and
  name, the customer's e-mail and "Wyloguj się". New **Konto** screen
  (e-mail, language, logout). Orders show amounts in the customer's locale and
  a retry button when loading fails.
- **Library.** Product cards with a type badge (Audio, Kurs, Pliki, Bilet) and
  one action ("Słuchaj", "Otwórz kurs", "Pobierz pliki", "Pokaż bilet").
  Product details show real file names, a ticket card and Google Play next to
  the App Store link. A product in the URL can be an id or the old protobuf
  JSON value.
- **`ProductList` on phones: two columns.** New appearance token
  `gridMinWidth` (default `9rem`); set `appearance.tokens.gridMinWidth: "100%"`
  to keep one column.
- **Course.** On phones: tabs (Opis, Pliki, Pytania), a sticky bar with
  previous / mark as completed / next above the panel navigation, an up-next
  card and a contents toggle (also for tests and locked items). Collapsible
  outline sections. On desktop, previous / completed / next are one row.
- **Audiobook player.** No autoplay on open. HLS errors are recovered (an
  expired chapter URL is fetched again once, also on Safari's native HLS) and
  shown with a retry button. Previous / next chapter, ±10 s, speed
  (remembered per device), sleep timer and time left. Lock-screen controls
  seek by 10 s. Styles are scoped to `.bitsnap-react`, dark mode supported.
  New optional `AudioPlayer` props: `author`, `locale`, `onError`,
  `onExpiredUrl`, `onFinished`, `coverShownBeside`; ref methods
  `selectChapter`, `retry`, `getError`.

## 1.17.0

Changes after 1.16.0, in the e-mail + 6-digit-code logins of `PanelLogin`,
`BitsnapReturns` and the notifications login dialog.

- **Shop logo on every login step.** The logo from the shop settings (light
  and dark variant) shows above the form, as does Bitsnap's logo when the shop
  has none. The height is reserved while it loads, so the form does not jump.
  A variant that does not load is replaced by the other one; Bitsnap's logo
  shows only when none loads. The image's alt text is the shop name, else
  "Logo sklepu" / "Shop logo" by locale.
- **`PanelLogin`: the logo moved** from the page header (alt "Company Logo",
  `theme.logoURL` / `theme.logoDarkURL`) into the login card, above the title.
  The theme logos are still used, per variant: `logoUrl` replaces only the
  light theme logo and `logoDarkUrl` only the dark one.
  The card is top-aligned instead of vertically centred.
- **New props.** `PanelLogin` and `BitsnapReturns`: `showLogo` (default
  `true`), `logoUrl` (light background), `logoDarkUrl` (dark background).
  Notifications: `showLoginLogo` (default `true`; `projectLogo`,
  `projectLogoDark` and `projectName` are used first). The notifications
  component reads the shop logo when it mounts, so the dialog has it on open.
- **`BitsnapReturns`:** the logo sits above the step indicator.
- **New login flow states.** E-mail step and code step, with a code restored
  after a reload (`sessionStorage`, 10 minutes); "I already have a code" asks
  for the e-mail first; a throttled resend is reported as "already sent" (not
  as a new code); countdown from the server's `retryIn`; rate limit, expired
  code, too many attempts, e-mail not found, delivery failed or unavailable and
  network errors each have their own message; one live region announces
  "step 1 of 2" / "step 2 of 2".
- **Returns texts: new optional keys** `resendSent`, `codeSpamHint`,
  `codeValidity`, `codeIncomplete` and `errorNetwork`. They are optional in
  `ReturnsTexts`, so code that builds a complete texts object still compiles.
- **Notifications login: new text keys** `loginVerifyButton`,
  `loginResendInText`, `loginResentMessage`, `loginExpiredError`,
  `loginTooManyAttemptsError`, `loginRateLimitedError`, `loginNetworkError`,
  `loginSpamHint`, `loginValidityHint`, `loginVerifyingButton`,
  `loginStepEmailHint`, `loginStepCodeHint`, `loginAlreadySentMessage`,
  `loginEmailNotFoundError`, `loginDeliveryUnavailableError`,
  `loginResendNewCodeButton`, `loginNoCodeButton` and
  `loginCodeIncompleteError`; all optional.
- The server must provide `GetLoginBranding` (public API) for the shop logo;
  without it the logos given as props, or Bitsnap's, are used.

## Capabilities

### Cart Management:

- Allows adding products to cart
- Manages cart state (show/hide)
- Handles cart items quantity updates
- Provides cart total calculations
- Supports removing items from cart

### Checkout Flow:

- Handles checkout process
- Supports different payment gateways
- Manages shipping/billing addresses
- Handles coupon codes
- Supports different delivery methods

### Product Management:

- Fetches product details from Bitsnap
- Handles product variants
- Manages product inventory/stock
- Supports product metadata

### Features:

- Supports multiple currencies
- Internationalization support
- Webhook handling
- Error handling
- Loading states
- Responsive design
- Protocol buffer integration

### Integration:

- Can be integrated into existing websites
- Configurable project ID
- Customizable host URL
- Supports test/production environments

## Checkout appearance

`BitsnapCheckout` accepts an optional `appearance` prop. Omitting it - or passing
`{}` - keeps the current presentation exactly as it is, so existing integrations
do not have to change.

### Import the stylesheet

```tsx
import "bitsnap-react/dist/index.css";
```

The stylesheet ships ready to use. Do not run it through a PostCSS prefixer or
compile the library's Tailwind source again: the rules are already scoped.

### Brand colors, font and radius

```tsx
import { BitsnapCheckout } from "bitsnap-react";

function MyComponent() {
  return (
    <BitsnapCheckout
      projectID="your-project-id"
      appearance={{
        tokens: {
          fontFamily: '"Inter", sans-serif',
          background: "#ffffff",
          foreground: "#202020",
          buttonBackground: "#635bff",
          buttonForeground: "#ffffff",
          radius: "12px",
        },
      }}
    />
  );
}
```

Fonts are not loaded by the library - load the font file in your application, the
checkout only applies the family you pass.

### Light theme

```tsx
<BitsnapCheckout projectID="your-project-id" appearance={{ theme: "light" }} />
```

`theme` accepts `"dark"` (the default presentation) and `"light"`. There is no
automatic system theme selection.

### Individual elements

Every part of the checkout is addressable through a stable slot. Slots accept a
`className` (merged after the built-in classes) and a `style` (merged after the
built-in styles):

```tsx
<BitsnapCheckout
  projectID="your-project-id"
  appearance={{
    elements: {
      title: { style: { fontFamily: '"Georgia", serif', fontSize: "28px" } },
      checkoutButton: { className: "store-checkout-button" },
      countryOption: { className: "px-4" },
    },
  }}
/>
```

| Slot                 | Element                                     |
| -------------------- | ------------------------------------------- |
| `root`               | Theme boundary of the drawer                |
| `overlay`            | Backdrop behind the drawer                   |
| `panel`              | Drawer panel                                |
| `header`             | Drawer header row                           |
| `title`              | "Cart" heading                              |
| `closeButton`        | Close button                                |
| `productList`        | Scrollable product list                     |
| `product`            | Single product row                          |
| `productImage`       | Product image                               |
| `productName`        | Product name                                |
| `productPrice`       | Product price                               |
| `quantityControl`    | Quantity stepper                            |
| `quantityInput`      | Quantity value input                        |
| `quantityButton`     | Quantity `-`/`+` buttons                    |
| `removeButton`       | "Remove" button                             |
| `summary`            | Total block                                 |
| `totalLabel`         | "Total" label                               |
| `totalValue`         | Total amount                                |
| `deliveryText`       | Delivery note                               |
| `countryLabel`       | "Choose country" label                      |
| `countryTrigger`     | Country select trigger                      |
| `countryDropdown`    | Portalled country list                      |
| `countrySearch`      | Country search field                        |
| `countryOption`      | Single country option                       |
| `paymentButtons`     | Apple Pay / Google Pay wrappers              |
| `paymentMethods`     | "How would you like to pay?" group (online, transfer / BLIK to a phone, cash on delivery) |
| `paymentMethodOption`| Single payment method card                   |
| `checkoutButton`     | "Next step" button                          |
| `emptyState`         | Empty cart message                          |
| `error`              | Checkout error message                      |
| `skeleton`           | Loading placeholder                         |

The same names are rendered as `data-bitsnap-checkout-slot` attributes, and the
drawer/dropdown boundaries carry `data-bitsnap-checkout`, so plain CSS works too:

```css
/* brand hover and focus states that the library cannot express */
.store-checkout-button:hover {
  filter: brightness(1.1);
}

[data-bitsnap-checkout-slot="countryOption"]:hover {
  background: #eef2ff;
}
```

Custom classes follow the normal CSS cascade; `className` is merged with `cn`, so
conflicting Tailwind utilities from the library are resolved in your favor.

### Tokens

| Token                     | Applies to                                              |
| ------------------------- | ------------------------------------------------------- |
| `fontFamily`              | The whole checkout                                      |
| `fontSize`                | The whole checkout                                      |
| `background`              | Panel, country trigger                                  |
| `surface`                 | Country dropdown, search bar, loading skeletons, selected payment method |
| `foreground`              | Titles, prices, total                                   |
| `mutedForeground`         | Empty cart, delivery note, country label, search field  |
| `border`                  | Country trigger, dropdown, product separators, payment method cards |
| `buttonBackground`        | "Next step" button                                      |
| `buttonForeground`        | "Next step" button                                      |
| `buttonHoverBackground`   | "Next step" button on hover                             |
| `hoverSurface`            | Close button, country options                           |
| `focusRing`               | Focus rings of the shared controls                      |
| `error`                   | Error message, unavailable product outline              |
| `overlay`                 | Drawer backdrop                                         |
| `radius`                  | Radius of the rounded elements                          |

### What stays untouched

- The trigger button (`className`, `children`, `numberOfProductsInCartOptions`) and
  every callback keep their current meaning.
- The appearance lives in the checkout component only. It is not a global setting
  and does not reuse the panel's `setTheme`.
- Apple Pay and Google Pay keep their native artwork and fonts; only the space
  around them is themed.
- Layout, responsive widths and checkout actions are unchanged. Override widths
  from your own CSS.
- The country list is rendered in a portal. It receives the theme (colors, font,
  focus ring and stacking) as soon as you pass an `appearance`; without one it
  renders exactly as before.

## Returns

`BitsnapReturns` is the customer return flow: email, verification code, orders,
line and quantity selection, confirmation, result, plus a list of earlier returns
with their status. The views are themeable from the start, with the same
`appearance` shape as the checkout. It needs the same stylesheet
(`bitsnap-react/dist/index.css`).

```tsx
import { BitsnapReturns } from "bitsnap-react";
import "bitsnap-react/dist/index.css";

function ReturnsPage() {
  return <BitsnapReturns projectID="your-project-id" />;
}
```

It is an inline page section, not an overlay, and it is safe to render on the
server.

**Upgrading from 1.6.0.** 1.6.0 code keeps working without changes, imported
from `bitsnap-react` or `bitsnap-react/returns`. Both paths now export this
implementation.
- **`BitsnapReturns` props:** it still accepts the `Environment` enum, `theme.brandColor` (prefer `appearance.tokens`) and the old text keys (`title`, `email`, `sendCode`, `code`, `verify`, `orders`, `submit`, `note`, `loading`, `history`).
- **Provider:** `BitsnapReturnsProvider` is an alias of `ReturnsProvider`.
- **Hooks:** they accept both the 1.6.0 calls (`useReturnOrders(pageSize, pageToken)`, `useMyReturns(pageSize, pageToken)`) and the new object form. Their results include the 1.6.0 fields (`data`, `mutateAsync`, `startSession`, `verifySession`, `starting`, `verifying`) next to the new ones.
- **Visual change:** the widget now uses the new themed views.
- **Wording:** without `texts`, the wording follows the library locale (`setLocale`). 1.6.0 was always English.

| Prop                | Meaning                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `projectID`         | Bitsnap project ID                                                          |
| `host`              | API host. Falls back to `setCustomHost`, then `https://bitsnap.pl`         |
| `environment`       | `"production"` (default) or `"test"`                                        |
| `appearance`        | `{ theme, tokens, elements }`, see below                                    |
| `texts`             | Partial text overrides, see [Texts](#texts)                                 |
| `locale`            | Locale of texts, dates and money. Defaults to `getLocale()`                 |
| `panelAccessToken`  | Customer panel token; skips email and code, see [Panel](#returns-in-the-customer-panel) |
| `className`         | Class of the themed root element                                            |

The session token lives in React state and `sessionStorage` (one key per project),
never in `localStorage`, and is never logged. An expired session returns the flow
to the email step.

### Shared brand

One object can style the checkout and the returns views:

```tsx
import { BitsnapCheckout, BitsnapReturns } from "bitsnap-react";

const brand = {
  theme: "light",
  tokens: {
    fontFamily: '"Inter", sans-serif',
    buttonBackground: "#635bff",
    buttonForeground: "#ffffff",
    radius: "12px",
  },
} as const;

<BitsnapCheckout projectID="your-project-id" appearance={brand} />
<BitsnapReturns
  projectID="your-project-id"
  appearance={{
    ...brand,
    elements: {
      title: { style: { fontFamily: '"Georgia", serif' } },
      submitButton: { className: "store-primary-button" },
    },
  }}
/>
```

`theme` is `"light"` or `"dark"`. The default for returns is `"light"`; the
checkout keeps its `"dark"` default. `elements` take `{ className, style }`,
merged after the built-in classes and styles, exactly like the checkout slots.

### Return tokens

The returns views use the checkout tokens, plus five more. `overlay` is
checkout-only and ignored by returns.

| Token                     | Applies to                                                 | Returns only |
| ------------------------- | ---------------------------------------------------------- | ------------ |
| `fontFamily`, `fontSize`  | All returns views                                          |              |
| `background`              | Page background                                            |              |
| `surface`                 | Cards, summaries, loading skeletons                         |              |
| `foreground`              | Titles, names, amounts                                     |              |
| `mutedForeground`         | Descriptions, dates, hints                                  |              |
| `border`                  | Cards, inputs, separators                                   |              |
| `buttonBackground`        | Primary buttons                                            |              |
| `buttonForeground`        | Primary buttons                                            |              |
| `buttonHoverBackground`   | Primary buttons on hover                                    |              |
| `hoverSurface`            | Secondary buttons, selectable cards                         |              |
| `focusRing`               | Focus rings                                                |              |
| `error`                   | Error messages                                             |              |
| `radius`                  | Rounded elements                                           |              |
| `success`                 | Result screen, completed and refunded statuses              | yes          |
| `warning`                 | Statuses that need attention                                | yes          |
| `badgeBackground`         | Status badges                                              | yes          |
| `badgeForeground`         | Status badges                                              | yes          |
| `inputBackground`         | Text inputs and the note field                              | yes          |

### Return slots

Slots are exported as `RETURNS_SLOT_NAMES` and rendered as
`data-bitsnap-returns-slot` attributes.

| Group                     | Slots                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Frame                     | `root`, `header`, `title`, `description`, `backButton`, `stepIndicator`, `error`, `emptyState`, `skeleton`                  |
| Auth                      | `emailForm`, `emailInput`, `codeForm`, `codeInput`, `resendButton`, `logoutButton`                                         |
| Orders                    | `orderList`, `orderCard`, `orderReference`, `orderDate`, `orderTotal`, `pagination`                                         |
| Selection                 | `lineList`, `line`, `lineName`, `linePrice`, `lineQuantityControl`, `quantityButton`, `quantityInput`, `lineIneligibleReason`, `noteInput` |
| Confirmation and result   | `summary`, `submitButton`, `secondaryButton`, `successState`, `returnReference`, `returnInstructions`                       |
| My returns                | `returnList`, `returnCard`, `statusBadge`, `history`, `historyEntry`                                                       |

### Texts

Both `BitsnapCheckout` and `BitsnapReturns` accept a `texts` prop: a partial
object that overrides the default strings whatever the locale. Without it the
strings are unchanged, and `setLocale`/`getLocale` keep working. For different
copy per language, pass a different object.

```tsx
<BitsnapCheckout
  projectID="your-project-id"
  texts={{ cart: "Your basket", nextStep: "Pay now" }}
/>

<BitsnapReturns
  projectID="your-project-id"
  locale="en"
  texts={{
    emailStepTitle: "Return a product",
    successDescription: "We'll email you once it arrives.",
    statusAwaitingReceipt: "On its way to us",
  }}
/>
```

Checkout keys (`CheckoutTexts`): `cart`, `emptyCart`, `total`, `delivery`,
`chooseCountry`, `nextStep`, `unavailableProducts`, `checkoutFailed`,
`noPaymentGateway`, `gatewayNotConfigured`, `shippingNotConfigured`,
`mixedRecurring`, `currencyUnsupported`, `priceChanged`, `paymentMethodLegend`,
`paymentMethodOnline`, `paymentMethodOnlineDescription`,
`paymentMethodManualTransfer`, `paymentMethodManualBlik`,
`paymentMethodManualBoth`, `paymentMethodManualDescription`,
`paymentMethodManualBlikNote`, `paymentMethodCod`,
`paymentMethodCodDescription`, `paymentMethodCodUnavailable`.

### Paying online, by transfer / BLIK to a phone or on delivery

When the shop turned on manual payments with "show at checkout", the cart asks
the buyer how they want to pay before "Next step": online (card, BLIK code,
instant transfer through the shop's gateway) or by hand (bank transfer and/or
BLIK to the seller's phone number; the label follows the accounts the seller
has). The first option is the seller's preferred one and is selected. The
seller's account and phone number are shown only after the order is placed, on
the Bitsnap payment page the cart redirects to; the order waits for the payment
there and the cart is cleared.

When the shop offers cash on delivery and the cart qualifies (delivery to
Poland, at least one shipped product, no subscription), the cart lists
"Płatność przy odbiorze" / "Cash on delivery" last. The buyer pays the courier.
Like any order, the cart is kept until the buyer has finished the order's
details form: the order is then "placed" (or "paid" once the seller marks it)
and its lines leave the cart. A buyer who goes back from the form still has the
cart. The cart asks again when the buyer changes the country; until the answer
arrives it keeps showing the last choice without cash on delivery. If the shop refuses cash on delivery for the order
anyway, the cart shows `paymentMethodCodUnavailable` and asks for the methods
again.

The cart asks `POST /public-commerce/payment-methods` (same body as `/buy`) once
per cart content. `choice: null`, an error, a timeout (5 s) or an older
bitsnap.pl that does not have the endpoint leave the cart as before: no choice
and a plain `/buy`. `/buy` gets `paymentMethod: "online" | "manual" | "cod"`
only when the choice was shown; the choice appears whenever the answer lists
two or more methods this version knows (others are ignored). Apple Pay and Google Pay are online payments and do not
change.

When "Next step" fails, the cart shows the text of the backend error code
(`noPaymentGateway`, `gatewayNotConfigured`, `shippingNotConfigured`,
`mixedRecurring`, `currencyUnsupported`, `priceChanged`; `unavailableProducts`
for `product-not-found`). Server errors (5xx, `internal`) and `invalid-request`
show `checkoutFailed`. For any other 4xx code the cart shows the message sent
by the server, else `checkoutFailed`. It never shows the bare code, and never
a message that is HTML, multi-line, longer than 200 characters or a stack
trace.

These keys were added in 1.11.0. If you type your own language
objects, use `Partial<CheckoutTexts>` (the `texts` prop already accepts it) so
that they keep compiling when new keys appear.

Returns keys (`ReturnsTexts`) cover each step (`emailStepTitle`,
`codeStepDescription`, `ordersEmpty`, `confirmationSubmit`, `successTitle`,
`myReturnsTitle`, ...), the request statuses (`statusSubmitted`,
`statusApproved`, `statusAwaitingReceipt`, `statusReceived`, `statusRefunded`,
`statusFallback`, ...) and the error messages (`errorGeneric`,
`errorInvalidCode`, `errorSessionExpired`, ...). Strings with placeholders such
as `{reference}` or `{count}` keep them in overrides. See `ReturnsTexts` and
`CheckoutTexts` in the type declarations for the full list and the placeholders.

### Custom layout

Compose your own page from the step components under `ReturnsProvider`. The
provider holds the session, appearance, texts and the transport, and renders the
themed root. Each step takes small navigation callbacks and the IDs it needs, and
throws a clear error when rendered outside the provider.

```tsx
import {
  ReturnsConfirmation,
  ReturnsEmailStep,
  ReturnsCodeStep,
  ReturnsOrderDetail,
  ReturnsOrderList,
  ReturnsProvider,
  ReturnsResult,
  useReturnSession,
  type SelectedReturnLine,
} from "bitsnap-react";

function Flow() {
  const { isAuthenticated } = useReturnSession();
  const [step, setStep] = useState<"email" | "code" | "orders" | "order" | "confirm" | "done">("email");
  const [orderId, setOrderId] = useState("");
  const [items, setItems] = useState<SelectedReturnLine[]>([]);
  const [note, setNote] = useState("");
  const [returnId, setReturnId] = useState("");

  if (!isAuthenticated) {
    return step === "code" ? (
      <ReturnsCodeStep onBack={() => setStep("email")} />
    ) : (
      <ReturnsEmailStep onSubmitted={() => setStep("code")} />
    );
  }
  if (step === "order") {
    return (
      <ReturnsOrderDetail
        orderId={orderId}
        initialItems={items}
        initialNote={note}
        onBack={() => setStep("orders")}
        onContinue={(selection) => {
          setItems(selection.items);
          setNote(selection.note);
          setStep("confirm");
        }}
      />
    );
  }
  if (step === "confirm") {
    return (
      <ReturnsConfirmation
        orderId={orderId}
        items={items}
        note={note}
        onBack={() => setStep("order")}
        onSubmitted={(id) => {
          setReturnId(id);
          setStep("done");
        }}
      />
    );
  }
  if (step === "done") {
    return <ReturnsResult returnId={returnId} onContinue={() => setStep("orders")} />;
  }
  return (
    <ReturnsOrderList
      onSelectOrder={(id) => {
        setOrderId(id);
        setStep("order");
      }}
    />
  );
}

<ReturnsProvider projectID="your-project-id" appearance={brand}>
  <Flow />
</ReturnsProvider>;
```

Available steps: `ReturnsEmailStep`, `ReturnsCodeStep`, `ReturnsOrderList`
(`onSelectOrder`, `onOpenMyReturns`, `showLogout`), `ReturnsOrderDetail`,
`ReturnsConfirmation`, `ReturnsResult`, `ReturnsMyReturnsList` and
`ReturnsMyReturnDetail`. Each accepts its own `className`. A session left in
`sessionStorage` is picked up on the next visit, so `useReturnSession().status`
is `"hydrating"` until the provider has read it on the client.

### Headless hooks

To build the markup yourself, use the hooks under `ReturnsProvider`: they return
data, loading and error state, and actions, and no markup.

| Hook                         | Returns                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `useReturnSession()`         | `status`, `isAuthenticated`, `start(email)`, `verify(code)`, `resend()`, `logout()`, `error` |
| `useReturnOrders(options?)`  | Paged returnable `orders`, `total`, `next()`, `previous()`, `refetch()` |
| `useReturnableOrder(id)`     | `order` with per-line eligibility, `returnHistory`                      |
| `useCreateReturn()`          | `submit({ orderId, items, note })`; retries reuse one idempotency key    |
| `useMyReturns(options?)`     | Paged earlier returns                                                   |
| `useMyReturn(id)`            | One return with its status and history                                  |

```tsx
function Orders() {
  const { orders, isLoading, errorKey } = useReturnOrders();
  if (isLoading) return null;
  return <ul>{orders.map((order) => <li key={order.canonicalOrderId}>{order.displayReference}</li>)}</ul>;
}
```

A request that fails with `SESSION_EXPIRED` drops the session, so
`useReturnSession().status` becomes `"anonymous"`.

### CSS only

Everything is also addressable without props. The root carries
`data-bitsnap-returns` and the theme class (`light` or `dark`), and every slot
carries `data-bitsnap-returns-slot`. The library rules sit in `@layer components`,
so ordinary stylesheets win:

```css
/* the theme is applied as inline custom properties, so overrides need !important */
[data-bitsnap-returns] {
  --bitsnap-returns-button-background: #635bff !important;
  --bitsnap-returns-radius: 12px !important;
}

[data-bitsnap-returns-slot="orderCard"]:hover {
  border-color: #635bff;
}

[data-bitsnap-returns-slot="line"][data-ineligible] {
  opacity: 0.5;
}
```

Token variables are named `--bitsnap-returns-<token in kebab case>`, for example
`--bitsnap-returns-muted-foreground`.

### Returns in the customer panel

The `Panel` has a Returns screen (`/panel?state=returns`, with `orderId` and
`returnId` in the URL for the selected order and return). It is built from the
step components above and reuses the panel login: the panel access token is
exchanged for a returns session, so the customer sees their orders with no
second code, and there is no email, code or logout step. When the panel session
has expired, the customer is sent to the panel login.

```tsx
<Panel
  returnsAppearance={{ theme: "light", tokens: { buttonBackground: "#635bff" } }}
  returnsTexts={{ ordersTitle: "Choose an order to return" }}
/>
```

| Prop                | Meaning                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| `returnsAppearance` | `ReturnsAppearance` of the screen                                                |
| `returnsTexts`      | `Partial<ReturnsTexts>` of the screen                                            |

Without `returnsAppearance`, `buttonBackground` and `focusRing` come from the
panel's `theme.colors.brand` (set with `setTheme`) and `buttonForeground` is
chosen for contrast. Other panel screens and `setTheme` are unchanged. The
navigation label follows `setLocale` ("Zwroty" / "Returns").

## Product list

`ProductList` renders a shop's product catalog: a responsive grid of cards with
image, name, price, "add to cart" and pagination. It is the same component the
Bitsnap custom-domain shop home page uses, and it can be embedded on any site.
It needs the same stylesheet (`bitsnap-react/dist/index.css`) and is safe to
render on the server.

```tsx
import { ProductList } from "bitsnap-react";
import "bitsnap-react/dist/index.css";

function ShopPage() {
  return (
    <ProductList
      projectID="your-project-id"
      locale="pl-PL"
      pageSize={24}
      productHref={(product) => `https://shop.example.com/p/${product.uniqueSlug}`}
    />
  );
}
```

Import it from `bitsnap-react/catalog` when you do not use the checkout on that
page: the entry exposes only the list and its hook, and the cart (the heavy
part of the package) is loaded on the first "Add to cart" click, or never when
you pass `onAddToCart`. The CommonJS build of the entry re-exports
`bitsnap-react`, so it shares state with it but is not lean; use ESM for the
smaller entry.

```tsx
import { ProductList, useProducts } from "bitsnap-react/catalog";
```

### Props

| Prop            | Meaning                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `projectID`     | Project (shop) ID. Required.                                                                         |
| `host`          | Backend origin. Defaults to `https://bitsnap.pl` (or what `setCustomHost` set at first render). `""` = same origin. |
| `locale`        | Language of the texts, price format and product translations. Defaults to `pl-PL`.                   |
| `pageSize`      | Products per page, 1 to 48. Defaults to 24.                                                          |
| `search`        | Text filter. A change goes back to page 1.                                                           |
| `initialData`   | First page (`{ items, totalCount }`) fetched on the server. Always used for the first request (so it must be page 1 for the same props). |
| `productHref`   | `(product) => string`. Defaults to the relative `/p/{uniqueSlug}`, which works on a custom domain.   |
| `appearance`    | `{ theme, tokens, elements }`, like the checkout. Light theme by default.                            |
| `texts`         | `Partial<ProductListTexts>`. Polish and English defaults, picked by `locale`.                        |
| `renderItem`    | `(product, context) => ReactNode` replaces the content of a card (`context` has `href`, `price`).    |
| `onAddToCart`   | `(product) => void \| Promise<void>`. Replaces the default add to cart.                              |
| `showCartOnAdd` | Open the cart drawer after the default add to cart. Defaults to `true`.                              |
| `className`     | Class of the root element.                                                                           |

Prices are in minor units (grosze, cents), as everywhere else in the library.
Cards show "od {price}" when the variants differ in price, a struck-through
regular price for discounts and an "unavailable" state for products out of
stock. Products with a ready 3D model (`has3d`, sent by Bitsnap servers with
3D support) get a small "3D" badge in the top right corner (slot
`model3dBadge`, texts `model3d` / `model3dLabel`).

### Add to cart

Products the backend marks `addToCart` (a single price, not a subscription) get
an "Add to cart" button. By default it calls `Bitsnap.addProductToCart` with
quantity 1 and then opens the cart (`BitsnapCheckout` must be mounted on the
page, see [Checkout appearance](#checkout-appearance)). The list aligns the
cart's project ID and host from the list's `projectID`/`host` props, but only
when the page has not set them yet (`setProjectID`, `setCustomHost`, or the
cart script tag). When the page cart already belongs to another project or
host, the list does not take it over: it logs a warning and shows the error
message, so pass `onAddToCart` there. The cart item is `cartItemId ?? id`, the
variant ID for single-variant products. The default action also passes the
card's `productHref` as the cart item's `url`, so the image and name in the
cart link back to the product page.
Products with variants or a subscription link to the product page ("Wybierz" /
"Zobacz"). Pass `onAddToCart` to do something else, for example to use your own
cart.

### Server rendering

```tsx
const firstPage = await fetch(
  "https://bitsnap.pl/api/integrations/your-project-id/public-commerce/product-list?limit=24&offset=0",
).then((response) => response.json());

<ProductList projectID="your-project-id" pageSize={24} initialData={firstPage} />;
```

Without `initialData` the server renders a loading skeleton and the browser
fetches the first page. The component never reads `window` while rendering.

### Appearance and texts

```tsx
<ProductList
  projectID="your-project-id"
  appearance={{
    theme: "dark",
    tokens: { buttonBackground: "#635bff", radius: "12px", fontFamily: "Inter" },
    elements: { card: { className: "my-card" }, name: { style: { fontSize: 18 } } },
  }}
  texts={{ addToCart: "Do koszyka" }}
/>
```

Tokens: `fontFamily`, `fontSize`, `background`, `surface`, `foreground`,
`mutedForeground`, `border`, `buttonBackground`, `buttonForeground`,
`buttonHoverBackground`, `hoverSurface`, `focusRing`, `error`, `badgeBackground`,
`badgeForeground`, `radius`. Slots (`PRODUCT_LIST_SLOT_NAMES`, also exposed as
`data-bitsnap-products-slot`): `root`, `grid`, `card`, `cardLink`, `image`,
`imagePlaceholder`, `body`, `name`, `description`, `price`, `comparePrice`,
`badge`, `model3dBadge`, `actions`, `addToCartButton`, `selectButton`, `message`, `pagination`,
`paginationButton`, `pageIndicator`, `emptyState`, `error`, `retryButton`,
`skeleton`. All rules are scoped to `[data-bitsnap-products]`.

### `useProducts`

Build your own layout on the same data:

```tsx
const { products, totalCount, page, pageCount, setPage, isLoading, error, refetch } =
  useProducts({ projectID: "your-project-id", pageSize: 12, search });
```

It uses a plain `fetch` without credentials, does not read the global project ID
or host, aborts the request when the inputs change, does nothing during server
rendering and uses `initialData` for the first request instead of fetching
(so it must be page 1 for the same options). If the catalog shrinks below the
current page, `page` falls back to the last page. `page` starts at 1; `products` keeps the previous page while the next one
loads.

### Embedding on your own site (CORS)

The list calls `GET {host}/api/integrations/{projectID}/public-commerce/product-list`
from the browser. The domain of the embedding site must be known to the project:
add it to the project's site, success or cancel URLs, or to the allowed domains
in the Bitsnap dashboard. Otherwise the browser blocks the response. On a Bitsnap
custom domain nothing has to be configured.

## 3D product viewer (`bitsnap-react/viewer3d`)

An interactive 3D model of a product: slow auto-rotation (about one turn per
34 s, paused while the buyer drags and when off screen or in a background tab,
off with `prefers-reduced-motion`), models over 10 MB load only after a click
("Pokaż model 3D (24 MB)"), full screen with a buy bar, a gesture hint shown once
per browser, phones keep scrolling the page until the buyer taps the model.

The subpath is **ESM only** and needs three optional peer dependencies:

```bash
npm install three @react-three/fiber @react-three/drei
```

```tsx
import { Product3DViewer } from "bitsnap-react/viewer3d";

<Product3DViewer
  projectID="your-project-id"
  productId="prodv2_..."
  variantId={selectedVariantId} // optional; switching swaps the model in place
/>;
```

The viewer reads `GET {host}/api/integrations/{projectID}/public-commerce/products?ids={productId}&include=model3d`
(the endpoint the cart already uses) and renders `fallback` (nothing by
default) while loading, when the product or the chosen variant has no ready
model, and on servers without 3D support. three and React Three Fiber load
with `import()` only once the model may be shown, never during the server
render; the main `bitsnap-react` and `bitsnap-react/catalog` entries never
reach them, so pages without the viewer do not grow.

| Prop            | Description                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `productId`     | Bitsnap product ID (or a variant ID).                                                                        |
| `variantId`     | The variant the page shows. A variant without its own model shows the product's.                             |
| `projectID`     | Defaults to `setProjectID`.                                                                                  |
| `host`          | Backend origin. Defaults to `https://bitsnap.pl` / `setCustomHost`. On a custom domain pass the domain.     |
| `locale`        | `pl-PL` (default) or `en*`.                                                                                  |
| `decoderPath`   | Draco decoder folder. Default: three's decoder on jsDelivr for the installed `three` revision (see below).   |
| `renderBuyBar`  | `({ product, variant, close }) => ReactNode`: the bar of the full screen view. Default: name, price, "Dodaj do koszyka" (Bitsnap cart, loaded on click). |
| `productUrl`    | Product page stored with the cart item by the default bar. Defaults to the current page.                    |
| `fallback`      | Rendered when there is nothing to show.                                                                      |
| `reportHref`    | "Zgłoś ten model" link (DSA notice form); the viewer adds `url` with the page address.                       |
| `startSignal`   | Bump the number to start loading now, a big model included (for your own "View in 3D" button).              |
| `hideNotes`     | Hide the disclaimer, report link and model facts under the viewer.                                           |
| `texts`         | Overrides of any string (`Viewer3DCopy`).                                                                    |
| `appearance`    | `{ background, foreground, muted, border, accent, radius }`, or set `--bitsnap-viewer3d-*` in your CSS.      |

`useProduct3DModel(productId, variantId?, { projectID, host, locale })` returns
`{ status: "loading" | "ready" | "none" | "error", model, product, variant, retry }`
for your own layout, and `Model3DViewer` renders a model you already have
(`model`, `productName`, plus the props above).

**Draco decoder.** Compressed models need the Draco decoder. By default the
viewer loads three's own decoder files from
`https://cdn.jsdelivr.net/npm/three@0.<REVISION>.0/examples/jsm/libs/draco/gltf/`,
matching the `three` you installed (jsDelivr allows any origin). To self-host,
copy `node_modules/three/examples/jsm/libs/draco/gltf/` to your site and pass
`decoderPath="/draco/"`. A Content-Security-Policy needs `connect-src` for the
file host (`files.bitsnap.pl`) and the decoder host, `worker-src blob:` and
`'wasm-unsafe-eval'` (Meshopt).

**CORS.** Model files are served from `files.bitsnap.pl` with
`Access-Control-Allow-Origin: *` for model paths; the product request follows
the same rules as the product list (see below).

# Examples

1. `BitsnapCheckout` Component:

```tsx
import { BitsnapCheckout } from "bitsnap-react";

function MyComponent() {
  return (
    <BitsnapCheckout
      projectID="your-project-id"
      onVisibleChange={(isVisible) =>
        console.log("Cart visibility:", isVisible)
      }
      className="custom-class"
    >
      {/* Optional custom cart trigger button content */}
      <span>My Custom Cart Button</span>
    </BitsnapCheckout>
  );
}
```

2. `setProjectID`:

```tsx
import { setProjectID } from "bitsnap-react";

// Set the project ID globally
setProjectID("your-project-id");
```

3. Cart Methods:

```tsx
import { Bitsnap } from "bitsnap-react";

// Modern approach using namespace
async function handleCart() {
  // Add product to cart
  await Bitsnap.addProductToCart(
    "product-id",
    2,
    { customField: "value" },
    // Optional: the cart links the item's image and name to this page.
    { url: "https://shop.example.com/p/product-slug" },
  );

  // Show cart
  Bitsnap.showCart();

  // Hide cart
  Bitsnap.hideCart();
}

// Legacy approach (deprecated)
async function legacyHandleCart() {
  await addProductToCart("product-id", 1);
  showCart();
  hideCart();
}
```

5. Creating Checkout/Payment (server-side only):

`createCheckout` sends an `Authorization: Bearer` header, so a browser key would
be visible to anyone loading your page. Create the checkout in a server route or
server action and redirect the browser to the returned URL:

```ts
// app/api/bitsnap/checkout/route.ts
import { Bitsnap, type LinkRequest } from "bitsnap-js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const projectID = process.env.BITSNAP_PROJECT_ID;
  const apiKey = process.env.BITSNAP_API_KEY;
  if (!projectID || !apiKey) {
    return new Response("Not configured", { status: 500 });
  }

  // Pick the fields you accept. Do not forward a raw client body to the API.
  const { items } = (await request.json()) as {
    items?: Array<{ id: string; quantity: number }>;
  };
  if (!items?.length) {
    return new Response("No items", { status: 400 });
  }

  const linkRequest: LinkRequest = {
    items,
    details: {
      email: "customer@example.com",
      name: "John Doe",
      address: {
        name: "John Doe",
        line1: "123 Street",
        city: "City",
        country: "US",
      },
    },
    askForAddress: true,
    askForPhone: true,
    apiKey,
    testMode: true,
  };

  const result = await Bitsnap.createCheckout(projectID, linkRequest);

  // The SDK does not check the HTTP status. Check that a URL came back.
  if (!result.redirectURL) {
    return new Response("Checkout failed", { status: 502 });
  }
  return Response.json({ url: result.redirectURL });
}
```

`bitsnap-react` also exports its own `createCheckout(request)`. It takes the same
request and sends `apiKey` as an `Authorization: Bearer` header, so it is
**server-side only**: calling it from a client component, an island or any
browser bundle would expose the project API key to every visitor. A normal
checkout needs no key at all. For a keyed server checkout use
`Bitsnap.createCheckout(projectID, request)` from `bitsnap-js`.

On success `createCheckout` returns `{ status: "ok", redirectURL }`. A failed
response no longer throws and no longer yields an undefined `redirectURL`: it
returns an `Err` with `status: "error"` instead (`result.ERR === true`), typed
as `CreateCheckoutResult`. Check `result.status === "ok"` before reading
`redirectURL`. `result.error` is the backend code (`invalid-request`,
`product-not-available`, `product-not-found`, `no-payment-gateway`,
`gateway-not-configured`, `shipping-not-configured`, `mixed-recurring`,
`currency-unsupported`, `price-changed`, `internal`). New backends send
`internal` for their own failures; `internal-error` is what the library uses
when an older backend sent no code. `result.data` is a `BuyErrorData`
(`{ message?, itemIds? }`), except for `item-ids-not-found`
(`ITEM_IDS_NOT_FOUND`), where it is the array of ids; both are exported.
`message` is the reason sent by the server, when it was usable. `result.type`
is `internal` for 5xx and `badInput` for 4xx.

```tsx
import { ITEM_IDS_NOT_FOUND, type BuyErrorData } from "bitsnap-react";

if (result.status === "error") {
  if (result.error === ITEM_IDS_NOT_FOUND) {
    const ids = result.data as string[];
  } else {
    const { message } = (result.data ?? {}) as BuyErrorData;
  }
}
```

`createPaymentURL` returns the same errors: the backend code in `error`,
`type: "badInput"` for 4xx (`"internal"` for 5xx) and `data: { message }`.
When the backend lists unavailable products (`itemIds`) under
`product-not-available` or `product-not-found` (or sends no code), the error is
`item-ids-not-found` and `data` is the array of ids. With any other code the
code is kept and the ids are in `data.itemIds`.

```tsx
// Client component: no key, only the returned URL.
const { url } = await fetch("/api/bitsnap/checkout", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ items: [{ id: "product-id", quantity: 1 }] }),
}).then((r) => r.json());
window.location.href = url;
```

Without a key, the browser can still create a normal checkout for a public
product by adding it to the cart and calling `Bitsnap.showCart()`. Only server
test checkout needs `apiKey`.

6. Webhook Handler (server-side only):

`handleWebhook` is exported by `bitsnap-js`, not by `bitsnap-react`. Install
`bitsnap-js` and run this in a server route.

```ts
// app/api/bitsnap/webhook/route.ts
import { Event, handleWebhook } from "bitsnap-js";

export const runtime = "nodejs";

export async function processWebhook(req: Request) {
  const webhookSecret = process.env.BITSNAP_WEBHOOK_SECRET;
  if (!webhookSecret) return new Response("Not configured", { status: 500 });

  // Pass the raw body and the full URL. Never call req.json() first.
  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  const result = await handleWebhook(payload, req.url, headers, webhookSecret);

  if (result.isErr) {
    console.error("Webhook error:", result.error);
    return new Response("Invalid signature", { status: 401 });
  }

  // Process the webhook event
  const { projectId, environment, eventData } = result;

  // Parsed enums are numeric. Compare against the exported Event enum,
  // not against the string "TRANSACTION_SUCCESS".
  switch (eventData?.event) {
    case Event.TRANSACTION_SUCCESS:
      // Handle successful transaction
      break;
    case Event.TRANSACTION_FAILURE:
      // Handle failed transaction
      break;
    // Handle other events...
  }
}
```

Complete Example:

```tsx
"use client";

import {
  BitsnapCheckout,
  setProjectID,
  setCustomHost,
  Bitsnap,
} from "bitsnap-react";

// Configure globally
setProjectID("your-project-id");
setCustomHost("https://your-custom-host.com");

function Store() {
  async function handleBuyNow(productId: string) {
    // Add to cart
    await Bitsnap.addProductToCart(productId, 1);

    // Show cart
    Bitsnap.showCart();
  }

  // A hosted checkout link without an API key: create it in a server route
  // (see "Creating Checkout/Payment" above) and follow the returned URL.
  async function processCheckout(
    items: Array<{ id: string; quantity: number }>,
  ) {
    const response = await fetch("/api/bitsnap/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) {
      console.error("Checkout failed");
      return;
    }
    const { url } = await response.json();
    window.location.href = url;
  }

  return (
    <div>
      <button onClick={() => handleBuyNow("product-123")}>Buy Now</button>

      <BitsnapCheckout
        projectID="your-project-id"
        onVisibleChange={(isVisible) => {
          console.log("Cart visibility changed:", isVisible);
        }}
      />
    </div>
  );
}
```

`createCheckout` and `handleWebhook` are not part of this client bundle: the
keyed checkout and webhook verification belong to `bitsnap-js` on the server.

---

## Capabilities

### Authentication:

- Email-based login with OTP verification
- Session management
- Logout functionality

### Product Management:

- Browse purchased products
- View product details
- Audio playback with chapter navigation
- File downloads
- Progress tracking

### User Features:

- Profile management
- Order history viewing
- Subscription plan management
- Notification preferences

## Configuration

Before using the Panel components, configure the library globally:

```tsx
import {
  setProjectID,
  setTheme,
  setLoginURL,
  setHost,
  PanelProvider,
} from "bitsnap-react";

// Configure globally - call once at app initialization
setProjectID("your-project-id");
setLoginURL("/panel/login");
setHost("https://api.bitsnap.pl");

// Optional: Set theme
setTheme({
  logoURL: "https://yourdomain.com/logo.png",
  logoDarkURL: "https://yourdomain.com/logo-dark.png",
  colors: {
    brand: "#ff0000",
    brandDark: "#cc0000",
  },
});
```

### Configuration Options

| Function                | Type             | Description                                              |
| ----------------------- | ---------------- | -------------------------------------------------------- |
| `setProjectID`          | `string`         | Your Bitsnap project ID                                  |
| `setLoginURL`           | `string`         | URL for login page (default: `/panel/login`)             |
| `setHost`               | `string`         | Custom API host URL                                      |
| `setTheme`              | `GetThemeOutput` | Theme configuration (logo, colors)                      |
| `setAllowedReturnOrigins` | `string[]`    | Allowed return URL origins (auto-set by `setProjectID`)  |

### Theme Type

```tsx
interface GetThemeOutput {
  logoURL?: string;
  logoDarkURL?: string;
  colors?: {
    brand?: string;
    brandDark?: string;
  };
}
```

## Usage

Wrap your application with `PanelProvider`:

```tsx
import { PanelProvider } from "bitsnap-react";

function App() {
  return (
    <PanelProvider>
      <YourApp />
    </PanelProvider>
  );
}
```

### Panel Component

The main panel component displays the authenticated user panel with products, orders, and profile.

```tsx
import { Panel } from "bitsnap-react";

function MyPage() {
  return <Panel />;
}
```

### PanelLogin Component

The login component handles email-based authentication with OTP verification.

```tsx
import { PanelLogin } from "bitsnap-react";

function LoginPage() {
  return <PanelLogin />;
}
```

Customers sign in with an e-mail and a 6-digit code. The code field fills in
from the keyboard suggestion or a paste (spaces and dashes are ignored) and
submits on the sixth digit. A pending code survives a reload or an app switch
(`sessionStorage`, up to 10 minutes). Texts are Polish by default; pass
`locale="en"` for English, and `texts` to override any string:

```tsx
<PanelLogin locale="en" texts={{ title: "Welcome back", wrongCode: "That code is wrong." }} />
```

The returns widget and the notifications login use the same code field and
messages.

## Complete Example

### App Entry Point

```tsx
import {
  setProjectID,
  setTheme,
  setLoginURL,
  setHost,
  PanelProvider,
  Panel,
  PanelLogin,
} from "bitsnap-react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Configure at app startup
setProjectID("your-project-id");
setLoginURL("/panel/login");
setHost("https://api.bitsnap.pl");

setTheme({
  logoURL: "https://yourdomain.com/logo.png",
  colors: {
    brand: "#4F46E5",
    brandDark: "#3730A3",
  },
});

export default function App() {
  return (
    <PanelProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/panel" element={<Panel />} />
          <Route path="/panel/login" element={<PanelLogin />} />
        </Routes>
      </BrowserRouter>
    </PanelProvider>
  );
}
```

### Login Page

```tsx
import { PanelLogin } from "bitsnap-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <PanelLogin />
    </div>
  );
}
```

### Panel Page (Authenticated)

```tsx
import { Panel } from "bitsnap-react";

export default function DashboardPage() {
  return <Panel />;
}
```

## Panel Screens

The panel provides the following screens:

| Screen        | Path                         | Description                        |
| ------------- | ---------------------------- | ---------------------------------- |
| Products      | `/panel`                     | Browse and view purchased products |
| Orders        | `/panel?state=orders`        | View order history and invoices    |
| Profile       | `/panel?state=profile`       | User profile and settings          |
| Notifications | `/panel?state=notifications` | Notification preferences           |
| Plans         | `/panel?state=plans`         | Subscription management            |
| Returns       | `/panel?state=returns`       | Return products, track returns     |

## Features Detail

### Products Screen

- Displays all purchased products
- Shows product cards with image, name, and description
- Click to view product details
- Supports audio, file, and ticket products
- "Pliki 3D": purchased 3D model files (download on click with a short-lived
  link, licence, "the seller removed this file"); hidden on servers without 3D
  delivery
- An empty list shows an empty state; only an expired session signs the buyer
  out

### Product Details

- Full product information display
- Audio player with chapter navigation
- File download links
- Progress tracking

### Audio Player

- Chapter selection
- Play/pause controls
- Seek functionality
- Media session integration (lock screen controls)
- Progress persistence

### Order History

- List of all invoices
- Invoice status (paid, unpaid, overdue)
- Download PDF invoices

### Profile

- View email address
- Logout functionality

### Notifications

- Toggle all notifications
- Notification preferences

## Merchant analytics (`bitsnap-react/analytics`)

A small tracker that sends buyer-behaviour events (page views, product views, cart and checkout steps) to Bitsnap, so your dashboard can show visits, sources and funnels. By default it is cookieless: it never uses `localStorage`, `sessionStorage` or IndexedDB, events live in memory and the visitor is recognised on the server by a daily-rotating hash that is never stored. The one exception is the consented `bs_vid_<projectKey>` cookie, described in [Returning visitors](#returning-visitors-the-bs_vid_projectkey-cookie).

What an event holds: the event name, a timestamp, the page host and path (no query string, no fragment), the referrer's host, `utm_*` and `ref` from the landing URL, ids of the product/variant/order involved, and a few numbers (price in minor units, quantity). It never holds names, emails, phone numbers, addresses, IPs, coupon codes, form values or free text.

Tracking stays off when `enabled` is `false`, when the browser sends Global Privacy Control (`navigator.globalPrivacyControl`), or when the browser is automated (`navigator.webdriver`). When [Bitsnap Consent](#cookie-consent-bitsnap-consent) is on the page and the visitor rejected analytics, the tracker stops and drops what it had queued. Without a stored choice it keeps going, because it stores nothing on the device (the `bs_vid_<projectKey>` cookie needs a granted choice).

### Script tag

```html
<script src="https://bitsnap.pl/embed/v1/analytics.js" data-project="pk_…" defer></script>
```

The standalone file is `dist/embed/analytics.js` (about 7.8 KB gzipped, no React). It sends a `page_view` on load and when the path changes through `history.pushState`/`replaceState`/back-forward (a change of the query string or hash alone is not a new page). Attributes: `data-project` (required), `data-env="live|test"`, `data-endpoint` (default `https://collect.bitsnap.pl`), `data-auto="on|off"` (default `on`), `data-page-type="shop|catalog|product|cart|checkout|…"`.

Bitsnap's own pages set three more: `data-source="script|storefront|dashboard"` (default `script`), `data-channel="embed|hosted|custom_domain"` (default `embed`) and `data-visitor-id`, a 22-character id that is only honoured with `data-source="dashboard"` (on any other source the collector computes the visitor id itself). With `data-source="dashboard"` the script sends `app_page_view` (with the route) instead of `page_view`. Unknown values fall back to the defaults.

```js
window.bitsnap.track("product_view", { price_minor: 4900, currency: "PLN", availability: "in_stock" }, { product_id: "…" });
window.bitsnap.page("product");

// Before the script has loaded, queue calls instead:
(window.bitsnap = window.bitsnap || { q: [] }).q.push(["track", "variant_selected", {}, { product_id: "…" }]);
```

### React

```tsx
import { BitsnapAnalyticsProvider, useAnalytics } from "bitsnap-react/analytics";

<BitsnapAnalyticsProvider projectKey="pk_…" onEvent={(event) => myTool.track(event.event, event.props)}>
  <App />
</BitsnapAnalyticsProvider>;

function Product({ id }: { id: string }) {
  const { track } = useAnalytics();
  // track("product_view", { price_minor, currency, availability }, { product_id: id })
}
```

The provider sends a `page_view` on mount and on every path change (`pushState`, `replaceState`, Back/Forward), like the script tag. Pass `autoPageViews={false}` to turn that off and call `page()` yourself; otherwise drop your own `page()` calls, or each page is counted twice. The same goes for instrumented components used without a provider: they start the automatic page views too, so a manual `page()` next to them double-counts unless you pass `analytics={false}` to them. An automatic page view carries no page type of its own (a component without a provider supplies its own), so it does not inherit one set by an earlier manual `page(type)`. The page views are a per-page singleton too: the page gets exactly one `page_view` per path change however many providers, instrumented components or `analytics.js` embeds it has.

`useAnalytics()` returns no-ops outside the provider and on the server. `onEvent` receives every event before it is sent, so you can forward it to your own tools after your own consent step; it is not called while tracking is off. The tracker is a per-page singleton: the first provider's `projectKey`, `env` and `endpoint` win.

Without React, use the core directly (`startAutoPageViews(() => tracker.page(null))` gives you the same automatic page views): `initTracker({ projectKey })` returns the page's tracker (`track`, `page`, `flush`, `setEnabled`, `onEvent`). Events are batched: sent every 5 seconds, at 20 events, and when the page is hidden (`fetch` with `keepalive`, with `navigator.sendBeacon` as the fallback). Failed sends are not retried.

### Automatic analytics in components

The Bitsnap components report their own events, so a project key is all you need. Each component takes an `analytics` prop:

```tsx
<ProductList projectID="…" />                                  // tracks (default)
<ProductList projectID="…" analytics={false} />                // opt out
<ProductList projectID="…" analytics={{ onEvent: (e) => myTool.track(e.event, e.props), env: "test" }} />
```

`onEvent` receives only the events of that component. `env: "test"` events are stored but never reach the merchant's stats. Parts inside a component inherit its setting; a surrounding `<BitsnapAnalyticsProvider>` owns the tracker and its `onEvent` still sees everything (and its `autoPageViews` decides on the page views). Nothing is written to Storage, cookies only as described under [Returning visitors](#returning-visitors-the-bs_vid_projectkey-cookie), and events carry no personal data (no emails, names, order contents or free text).

| Component | Events |
| --- | --- |
| `ProductList` | `product_list_viewed`, `product_impression` (card ≥50% visible), `product_clicked`, `add_to_cart` |
| `BitsnapCheckout` / `Bitsnap.addProductToCart` | `cart_opened`, `checkout_started`, `add_to_cart`, `remove_from_cart` |
| `ApplePay` | `apple_pay_clicked`, `payment_method_selected`, `delivery_method_selected`, `payment_submitted`, `apple_pay_result` |
| `GooglePay` | `payment_method_selected`, `payment_submitted` |
| Notifications | `availability_signup` |
| Panel | `panel_login`, `panel_order_viewed`, `panel_download` |
| Returns | `return_started`, `return_submitted` |
| Course | `course_opened`, `lesson_started`, `lesson_completed`, `video_progress` (25/50/75/100% of naturally played time), `test_submitted`, `lesson_rated` |

Without a `<BitsnapAnalyticsProvider>`, an instrumented component that starts the tracker also sends the automatic `page_view`s (it does not when `analytics={false}`). The components do not emit `product_view`, `checkout_step_completed`, `checkout_validation_error`, `coupon_applied` or `coupon_rejected` (the drawer hands over to the hosted checkout). Use `useAnalytics()` or the embed script for those. Because the tracker is a per-page singleton, the first project key wins: use one project per page. The course sends nothing in creator preview.

For your own components, `useInstrument(projectKey, analytics)` returns the same `{ track }` helper and `<InstrumentProvider value={instrument}>` shares it with the parts below.

### Returning visitors: the `bs_vid_<projectKey>` cookie

Without a cookie the server can only tell visitors apart for one day. When [Bitsnap Consent](#cookie-consent-bitsnap-consent) is on the page and the visitor grants **analytics**, the tracker sets one first-party cookie:

| | |
| --- | --- |
| Name | `bs_vid_<projectKey>`, with your bare public project key (like `bitsnap_consent_<projectKey>`). It is per project because consent is: on bitsnap.pl many merchants share one site, and one merchant's consent or refusal must never grant or delete another's id |
| Value | 22 random base64url characters (16 bytes from `crypto.getRandomValues`); not derived from anything about the visitor |
| Lifetime | 390 days (under the 13 months the CNIL allows), set once and not extended on later visits |
| Domain | The widest registrable domain the browser accepts (like Google Analytics), host-only on `localhost` and IP hosts |
| Attributes | `Path=/; SameSite=Lax`, plus `Secure` on https |
| Set when | Bitsnap Consent reports `analytics` granted, on load or on the `bitsnap:consent` event |
| Deleted when | `analytics` is withdrawn or the choice is reset: on the host and every parent domain |

While analytics is granted and the cookie exists, every event carries it as `client_id`, and the requests that create a checkout or payment link (the cart's `/buy` and `/api/payment/link/auto` calls) send it as the `X-Bitsnap-Visitor` header. The server derives a stable visitor id from it, which lets your stats count returning visitors and credit a purchase to the visit that led to it. Without a granted choice (no banner, a refusal, a choice still loading, Global Privacy Control) there is no cookie, no `client_id` and no header, and tracking stays cookieless as before.

The cookie only follows a banner that speaks for the project: a project-scope banner (`scope: "project"`) with the same project key, or, on your own site, a site-scope banner. A banner for another project never sets, reads or deletes it, and on bitsnap.pl (and its subdomains) the site-wide choice is bitsnap's own, so only a project-scope choice for your key counts.

Declare the cookie in your banner's cookie list (category `analytics`, purpose "shop statistics: recognising returning visitors", lifetime 13 months): add `{ name: "Bitsnap statistics", category: "analytics", cookies: ["bs_vid_<projectKey>"] }` to `services` in the banner config, with your exact bare project key, which also lets the banner delete it on withdrawal from pages that run no tracker. Do not use a `bs_vid_*` prefix: the banner deletes every cookie that matches it, which on a site shared by several merchants (bitsnap.pl) would wipe other projects' ids too.

### Release notes (1.11.0)

- **The cart shows why it cannot continue to payment.** When `/buy` fails, the cart shows a localized text for the backend code (no payment gateway, delivery not configured, changed price, mixed subscription cart, unsupported currency), else the server's reason, else `checkoutFailed`. It never shows a bare code such as `internal-error`. Older bitsnap.pl responses are read too.
- **`createCheckout` returns an error instead of a broken success.** A failed response returns an `Err` with `status: "error"` (typed `CreateCheckoutResult`) instead of `{ status: "ok", redirectURL: undefined }` or a thrown error. Check `result.status === "ok"` before reading `redirectURL`.
- **`createPaymentURL` errors carry the backend code** in `error` (`badInput` for 4xx, `internal` for 5xx) and `data: { message }`, instead of always `internal-error`.
- **New checkout text keys** (`checkoutFailed`, `noPaymentGateway`, `gatewayNotConfigured`, `shippingNotConfigured`, `mixedRecurring`, `currencyUnsupported`, `priceChanged`). Type your language objects as `Partial<CheckoutTexts>`.

### Release notes (1.10.0)

- **Requires bitsnap.pl with `X-Bitsnap-Visitor` support.** The cart's `/buy` and `/api/payment/link/auto` requests now send that header while analytics is granted, and a server whose CORS preflight does not allow it makes those checkouts fail in the browser. Deploy bitsnap.pl first, then publish and install this version.
- **Page views are now automatic by default.** `<BitsnapAnalyticsProvider>` and instrumented components without a provider send a `page_view` on mount and on every path change. If you call `page()` yourself, pass `autoPageViews={false}` to the provider (and `analytics={false}` to components used without one), or each page is counted twice.
- **Update the consent script too.** The tracker only sets `bs_vid_<projectKey>` for a banner that reports its `scope` and `projectKey` (1.10.0 and later); an older consent script is treated as not speaking for the project, so the tracker stays cookieless.
- **Update `analytics.js` and the npm package together.** Both share one page-wide registry to send a single `page_view` per path change; an older copy of either does not know about it, and the page is counted twice while both run.
- New consented first-party cookie `bs_vid_<projectKey>` and `client_id` on events (see above); declare it in your banner's cookie list by its exact name.

## Cookie consent (Bitsnap Consent)

An embeddable cookie banner with equal "Accept all" / "Reject all" buttons, per-category settings, light and dark themes, Polish and English texts, and Google Consent Mode v2. It renders in a Shadow DOM, stores only one first-party cookie (`bitsnap_consent`) and never uses `localStorage`.

### Script tag

```html
<script src="https://bitsnap.pl/embed/v1/consent.js" data-project="pk_…" defer></script>
```

The standalone file is `dist/embed/consent.js` (about 9 KB gzipped, no React). Attributes: `data-project`, `data-theme="auto|light|dark"`, `data-locale="auto|pl|en"`, `data-position="bottom|bottom-left|bottom-right"`, `data-privacy-url`, `data-scope="project"`, `data-api-host`, `data-collect-host`, `data-gcm="on|off"`, `data-categories="analytics,marketing"` (used when there is no remote config), `data-reload-on-withdraw="true"`.

For a live preview in a settings page, add `data-preview="on"`: the banner is shown on every load, nothing is read from or written to the cookie, and nothing is sent to the collect host. `data-title` and `data-description` replace the banner heading and text (the same options exist as `preview`, `title` and `description` in the core `ConsentOptions`).

With `data-project` the banner loads its config from `/api/consent/config` (3 s timeout, then defaults) and sends each choice to `<collect host>/consent`. When the banner opens on its own (no valid stored choice, or a newer banner version), it also sends one anonymous impression ping per page load, `{ k, action: "shown", bv, host, ts }`: no id, no choice, nothing stored, and none when the visitor reopens the settings. Without a project key nothing leaves the page.

### React

```tsx
import { BitsnapConsent, useConsent } from "bitsnap-react/consent";

<BitsnapConsent projectKey="pk_…" locale="pl" privacyPolicyUrl="/polityka-prywatnosci" />;

function CookieSettings() {
  const { consent, open } = useConsent();
  return <button onClick={open}>Cookie settings ({consent?.c.marketing ? "marketing on" : "marketing off"})</button>;
}
```

`<BitsnapConsent />` renders nothing on the server. A `config` prop (`ConsentConfig`, partial) overrides the project config.

### Loading scripts after consent

```html
<script type="text/plain" data-bitsnap-consent="marketing" data-src="https://example.com/pixel.js"></script>
<script type="text/plain" data-bitsnap-consent="analytics">/* inline code */</script>
<iframe data-bitsnap-consent="marketing" data-src="https://www.youtube.com/embed/…"></iframe>
```

After consent for the category the placeholder is replaced by a real script (attributes copied, `type` dropped, `data-src` becomes `src`), and an iframe gets its `src`. Categories are `analytics`, `marketing` and `preferences`.

### JavaScript API

```js
BitsnapConsent.get();                  // null or { id, ts, bv, c: { analytics, marketing, preferences } }
BitsnapConsent.on("change", (d) => {}); // returns an unsubscribe function; d.action is accept_all | reject_all | custom | withdraw | reset
BitsnapConsent.open();                 // settings layer; any [data-bitsnap-consent-open] element does the same
BitsnapConsent.acceptAll(); BitsnapConsent.rejectAll(); BitsnapConsent.accept({ analytics: true });
BitsnapConsent.reset();                // clears the choice and asks again
BitsnapConsent.ready;                  // Promise, resolves once config and the stored choice are applied
BitsnapConsent.scope;                  // "global" (bitsnap_consent) or "project" (bitsnap_consent_<projectKey>)
BitsnapConsent.projectKey;             // the bare public project key the banner was started with, or null
```

`window` also receives `CustomEvent("bitsnap:consent", { detail })` on every choice. Categories missing from `accept()` are denied. When a visitor withdraws a category, the cookies listed in `services[].cookies` are deleted (best effort; a trailing `*` matches a prefix), and the page reloads if `reloadOnWithdraw` is set.

### Google Consent Mode v2

If `gtag` or `dataLayer` exists (or `data-gcm="on"`), the script sets `consent default` (everything denied except `security_storage`, `wait_for_update: 500`) before anything else, and `consent update` after each choice: analytics → `analytics_storage`, marketing → `ad_storage`, `ad_user_data`, `ad_personalization`, preferences → `functionality_storage`, `personalization_storage`.
