import zod from "zod";
import { round } from "./lib/round.number";

const eventPayload = zod.object({
  event: zod.enum([
    "purchase",
    "addToCart",
    "customizeProduct",
    "viewCart",
    "removeFromCart",
    "initiateCheckout",
  ]),
  step: zod.string().optional(),
  value: zod.number().optional(),
  currency: zod.string().optional(),
  content_name: zod.string().optional(),
  items: zod
    .array(
      zod.object({
        id: zod.string(),
        name: zod.string(),
        price: zod.number().default(0),
        currency: zod.string().default("PLN"),
        quantity: zod.number().default(1),
      })
    )
    .optional(),
});
type EventPayload = zod.infer<typeof eventPayload>;

export function sendAnalyticEvent(payload: EventPayload) {
  if (typeof window == "undefined") {
    return;
  }

  sendGoogleAnalyticsEvent(payload);
  sendPixelAnalyticsEvent(payload);
}

function sendGoogleAnalyticsEvent(payload: EventPayload) {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (typeof window.dataLayer == "undefined") {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.dataLayer = [];
    }

    // Map custom events to GA4 ecommerce events
    const ga4Event = mapToGA4EcommerceEvent(payload);

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.dataLayer.push(ga4Event);
  } catch (e) {
    console.warn("cannot send google analytics event", e);
  }
}

function mapToGA4EcommerceEvent(payload: EventPayload) {
  // Calculate total value from items if not provided
  const totalValue =
    payload.value ??
    payload.items?.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
      0
    ) ??
    0;

  // Map items to GA4 format
  const items = payload.items?.map((item) => ({
    item_id: item.id,
    item_name: item.name || item.id,
    price: round((item.price || 0) / 100, 2),
    quantity: item.quantity || 1,
  }));

  // Build base ecommerce object
  const ecommerce: Record<string, unknown> = {
    currency: payload.currency || "PLN",
    value: round(totalValue / 100, 2),
  };

  if (items && items.length > 0) {
    ecommerce.items = items;
  }

  // Map event names to GA4 ecommerce events
  let eventName: string;
  switch (payload.event) {
    case "purchase":
      eventName = "purchase";
      // Purchase events require transaction_id, but we'll use a timestamp-based one if not provided
      ecommerce.transaction_id = payload.step || `txn_${Date.now()}`;
      break;
    case "addToCart":
      eventName = "add_to_cart";
      break;
    case "viewCart":
      eventName = "view_cart";
      break;
    case "removeFromCart":
      eventName = "remove_from_cart";
      break;
    case "initiateCheckout":
      eventName = "begin_checkout";
      break;
    case "customizeProduct":
      // Customize product is not a standard GA4 ecommerce event
      // We'll send it as a custom event with ecommerce data
      eventName = "customize_product";
      break;
    default:
      eventName = payload.event;
  }

  return {
    event: eventName,
    ecommerce,
    // Include step if provided for additional context
    ...(payload.step && { step: payload.step }),
    // Include content_name if provided
    ...(payload.content_name && { content_name: payload.content_name }),
  };
}

function sendPixelAnalyticsEvent(payload: EventPayload) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (typeof window.fbq == "undefined") {
    return;
  }

  let eventType = "";
  let eventName = "";
  let eventPayload: unknown = {};

  switch (payload.event) {
    case "purchase":
      eventType = "track";
      eventName = "Purchase";
      eventPayload = {
        category_name: payload.step,
        ...payload,
      };
      break;
    case "addToCart":
      eventType = "track";
      eventName = "Add to Cart";
      eventPayload = {
        category_name: payload.step,
        ...payload,
      };
      break;
    case "customizeProduct":
      eventType = "track";
      eventName = "Customize Product";
      eventPayload = {
        category_name: payload.step,
        ...payload,
      };
      break;
    case "viewCart":
      eventType = "track";
      eventName = "View Cart";
      eventPayload = {
        category_name: payload.step,
        ...payload,
      };
      break;
    case "removeFromCart":
      eventType = "track";
      eventName = "Remove from Cart";
      eventPayload = {
        category_name: payload.step,
        ...payload,
      };
      break;
    case "initiateCheckout":
      eventType = "track";
      eventName = "Initiate Checkout";
      eventPayload = {
        category_name: payload.step,
        ...payload,
      };
      break;
    default:
      break;
  }

  if (window.location.search.includes("analytics")) {
    console.log("Pushing FB event", eventType, eventName, eventPayload);
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.fbq(eventType, eventName, eventPayload);
}
