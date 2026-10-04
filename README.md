# Bitsnap Checkout

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
| `surface`                 | Country dropdown, search bar, loading skeletons         |
| `foreground`              | Titles, prices, total                                   |
| `mutedForeground`         | Empty cart, delivery note, country label, search field  |
| `border`                  | Country trigger, dropdown, product separators            |
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

**Upgrading from 1.6.0.** `BitsnapReturns` still accepts the 1.6.0 props: the
`Environment` enum, `theme.brandColor` (prefer `appearance.tokens`) and the old
text keys (`title`, `email`, `sendCode`, `code`, `verify`, `orders`, `submit`,
`note`, `loading`, `history`). The returns hooks exported from `bitsnap-react`
now work under `ReturnsProvider` and return richer results. The 1.6.0 widget,
`BitsnapReturnsProvider` and its hooks remain available, unchanged and
deprecated, from `bitsnap-react/returns`.

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
`chooseCountry`, `nextStep`, `unavailableProducts`.

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
  await Bitsnap.addProductToCart("product-id", 2, {
    customField: "value",
  });

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

5. Creating Checkout/Payment:

```tsx
import { createCheckout, LinkRequest } from "bitsnap-react";

async function handleCheckout() {
  const request: LinkRequest = {
    items: [
      {
        id: "product-id",
        quantity: 1,
      },
    ],
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
  };

  const result = await createCheckout({
    ...request,
    apiKey: "your-api-key",
    testMode: true,
  });

  if (result.status === "ok") {
    window.location.href = result.redirectURL;
  }
}
```

6. Webhook Handler:

```tsx
import { handleWebhook } from "bitsnap-react";

async function processWebhook(req: Request) {
  const payload = await req.text();
  const url = req.url;
  const headers = Object.fromEntries(req.headers);
  const webhookSecret = "your-webhook-secret";

  const result = await handleWebhook(payload, url, headers, webhookSecret);

  if (result.isErr) {
    console.error("Webhook error:", result.error);
    return;
  }

  // Process the webhook event
  const { projectId, environment, eventData } = result;

  switch (eventData?.event) {
    case "TRANSACTION_SUCCESS":
      // Handle successful transaction
      break;
    case "TRANSACTION_FAILURE":
      // Handle failed transaction
      break;
    // Handle other events...
  }
}
```

Complete Example:

```tsx
import {
  BitsnapCheckout,
  setProjectID,
  setCustomHost,
  Bitsnap,
  createCheckout,
  handleWebhook,
  type LinkRequest,
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

  async function processCheckout(
    items: Array<{ id: string; quantity: number }>,
  ) {
    const checkoutRequest: LinkRequest = {
      items,
      askForAddress: true,
      askForPhone: true,
      details: {
        email: "customer@example.com",
      },
      redirect: {
        successURL: "/success",
        cancelURL: "/cancel",
      },
    };

    const result = await createCheckout({
      ...checkoutRequest,
      testMode: true,
    });

    if (result.status === "ok") {
      window.location.href = result.redirectURL;
    }
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
