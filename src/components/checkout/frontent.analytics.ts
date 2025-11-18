import zod from "zod";

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

function sendGoogleAnalyticsEvent(
  payload: Record<string, string | number | boolean | object | undefined>
) {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (typeof window.dataLayer == "undefined") {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.dataLayer = [];
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.dataLayer.push(payload);
  } catch (e) {
    console.warn("cannot send google analytics event", e);
  }
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
