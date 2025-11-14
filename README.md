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

# Examples

1. `BitsnapCheckout` Component:

```tsx
import { BitsnapCheckout } from "bitsnap-checkout";

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
import { setProjectID } from "bitsnap-checkout";

// Set the project ID globally
setProjectID("your-project-id");
```

3. Cart Methods:

```tsx
import {
  Bitsnap,
  addProductToCart,
  showCart,
  hideCart,
} from "bitsnap-checkout";

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
import { createCheckout, LinkRequest } from "bitsnap-checkout";

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
import { handleWebhook } from "bitsnap-checkout";

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
} from "bitsnap-checkout";

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
