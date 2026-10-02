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
