import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { create, toBinary, type DescMessage, type MessageInitShape } from "@bufbuild/protobuf";
import { resetTracker } from "@/src/analytics/core";
import { collector, findPII, setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  GetPreOrderDetailsResponseSchema,
  IsOneClickPaymentAvailableResponseSchema,
  OneClickAuthorizePaymentResponseSchema,
} from "src/gen/proto/public/v1/public_api_pb";

const page = setupReactPage();

/** The Apple Pay session the button creates; the test drives its callbacks. */
class FakeApplePaySession {
  static STATUS_SUCCESS = 0;
  static STATUS_FAILURE = 1;
  static instances: FakeApplePaySession[] = [];
  [key: string]: unknown;
  completed: number[] = [];
  began = false;
  constructor() {
    FakeApplePaySession.instances.push(this);
  }
  begin() {
    this.began = true;
  }
  abort() {}
  completePayment(result: { status: number }) {
    this.completed.push(result.status);
  }
  completeShippingMethodSelection() {}
}
(page.win as unknown as Record<string, unknown>).ApplePaySession = FakeApplePaySession;
Object.assign(globalThis, { ApplePaySession: FakeApplePaySession });

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let ApplePayButton: typeof import("./ApplePay.tsx").default;
let setProjectID: typeof import("./CartProvider.tsx").setProjectID;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ApplePayButton = (await import("./ApplePay.tsx")).default;
  ({ setProjectID } = await import("./CartProvider.tsx"));
});

const product = { id: "prod1", ownerID: "o", name: "Mug", description: null, price: 2500, currency: "PLN", metadata: {}, image_url: null };
let authorizeSucceeds = true;
const roots: Array<{ unmount: () => void }> = [];
const originalLog = console.log;
const originalError = console.error;

function proto<T extends DescMessage>(schema: T, init: MessageInitShape<T>) {
  return new Response(toBinary(schema, create(schema, init)) as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/proto" },
  });
}

beforeEach(() => {
  resetTracker();
  authorizeSucceeds = true;
  FakeApplePaySession.instances = [];
  page.win.localStorage.setItem("checkout", JSON.stringify({ products: [] }));
  setProjectID(TEST_KEY);
  globalThis.fetch = (async (input: string) => {
    const url = String(input);
    if (url.endsWith("/IsOneClickPaymentAvailable")) {
      return proto(IsOneClickPaymentAvailableResponseSchema, { applePay: true });
    }
    if (url.endsWith("/GetPreOrderDetails")) {
      return proto(GetPreOrderDetailsResponseSchema, { totalAmount: 2500, currency: "PLN", country: "PL" });
    }
    if (url.endsWith("/AuthorizeOneClickPayment")) {
      return proto(OneClickAuthorizePaymentResponseSchema, {
        isSuccess: authorizeSucceeds,
        redirectUrl: "",
        transactionId: "tx",
      });
    }
    if (url.includes("/public-commerce/products")) {
      return new Response(JSON.stringify({ success: true, result: [product] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  console.log = () => {};
  console.error = () => {};
});
afterEach(async () => {
  console.log = originalLog;
  console.error = originalError;
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  resetTracker();
});

const settle = () => React.act(async () => void (await new Promise((r) => setTimeout(r, 40))));

/** Mounts the button, clicks it and returns the session it started. */
async function start(analytics: React.ComponentProps<typeof ApplePayButton>["analytics"]) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(<ApplePayButton items={[{ id: "prod1", name: "Mug", price: 2500, quantity: 1 }]} analytics={analytics} />);
  });
  await settle();
  const button = container.querySelector<HTMLElement>("button, apple-pay-button, [role=button]");
  assert.ok(button, "the Apple Pay button renders");
  await React.act(async () => button!.click());
  await settle();
  return FakeApplePaySession.instances[0];
}

describe("ApplePayButton analytics", () => {
  it("reports the click and the wallet as the chosen payment method", async () => {
    const seen = collector();
    const session = await start({ onEvent: seen.onEvent });
    assert.ok(session?.began);
    assert.deepEqual(seen.names().slice(0, 2), ["apple_pay_clicked", "payment_method_selected"]);
    assert.deepEqual(seen.named("payment_method_selected")[0].props, { gateway: "apple_pay", method: "apple_pay" });
  });

  it("reports cancel once", async () => {
    const seen = collector();
    const session = await start({ onEvent: seen.onEvent });
    await React.act(async () => {
      (session.oncancel as (e: unknown) => void)({});
      (session.oncancel as (e: unknown) => void)({});
    });
    assert.deepEqual(seen.named("apple_pay_result").map((e) => e.props), [{ outcome: "cancel" }]);
  });

  it("reports the delivery choice and a successful payment without any personal data", async () => {
    const seen = collector();
    const session = await start({ onEvent: seen.onEvent });
    await React.act(async () => {
      await (session.onshippingmethodselected as (e: unknown) => Promise<void>)({
        shippingMethod: { identifier: "inpost" },
      });
    });
    await React.act(async () => {
      await (session.onpaymentauthorized as (e: unknown) => Promise<void>)({
        payment: {
          token: { paymentData: {}, paymentMethod: {}, transactionIdentifier: "tx" },
          billingContact: { givenName: "Jane", familyName: "Doe", emailAddress: "jane.doe@example.com", phoneNumber: "+48123456789" },
          shippingContact: { givenName: "Jane", emailAddress: "jane.doe@example.com", addressLines: ["Main St 1"], postalCode: "00-001" },
        },
      });
    });
    assert.deepEqual(seen.named("delivery_method_selected").map((e) => e.props), [{ method: "inpost" }]);
    assert.deepEqual(seen.named("payment_submitted").map((e) => e.props), [{ gateway: "apple_pay", method: "apple_pay" }]);
    assert.deepEqual(seen.named("apple_pay_result").map((e) => e.props), [{ outcome: "success" }]);
    assert.deepEqual(findPII(seen.events), []);
    assert.ok(!JSON.stringify(seen.events).includes("Doe"));
    assert.ok(!JSON.stringify(seen.events).includes("00-001"));
  });

  it("reports a declined payment as fail", async () => {
    authorizeSucceeds = false;
    const seen = collector();
    const session = await start({ onEvent: seen.onEvent });
    await React.act(async () => {
      await (session.onpaymentauthorized as (e: unknown) => Promise<void>)({
        payment: { token: { paymentData: {}, paymentMethod: {}, transactionIdentifier: "tx" } },
      });
    });
    assert.deepEqual(seen.named("apple_pay_result").map((e) => e.props), [{ outcome: "fail" }]);
  });

  it("sends nothing with analytics={false}", async () => {
    const seen = collector();
    const session = await start(false);
    await React.act(async () => (session.oncancel as (e: unknown) => void)({}));
    assert.equal(seen.events.length, 0);
    assert.equal(page.pendingBeacons(), 0);
  });
});

process.on("exit", teardownReactPage);
