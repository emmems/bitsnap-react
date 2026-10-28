import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { create, toBinary, type DescMessage, type MessageInitShape } from "@bufbuild/protobuf";
import { resetTracker } from "@/src/analytics/core";
import { collector, findPII, setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  FailureMessage,
  GetUserGroupsResponseSchema,
  NotificationUserResponseSchema,
} from "src/gen/proto/dashboard/v1/notifications_pb";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let Notifications: typeof import("./NotificationsComponentPublic.tsx").default;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  Notifications = (await import("./NotificationsComponentPublic.tsx")).default;
});

let userExists = false;
const roots: Array<{ unmount: () => void }> = [];

function proto<T extends DescMessage>(schema: T, init: MessageInitShape<T>) {
  return new Response(toBinary(schema, create(schema, init)) as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/proto" },
  });
}

beforeEach(() => {
  resetTracker();
  userExists = false;
  page.win.localStorage.clear();
  globalThis.fetch = (async (input: string) => {
    const url = String(input);
    if (url.endsWith("/GetUserGroups")) return proto(GetUserGroupsResponseSchema, { groups: [] });
    if (url.endsWith("/CreateNotificationUser")) {
      return proto(NotificationUserResponseSchema, {
        result: userExists
          ? { case: "failure", value: FailureMessage.NOTIFICATION_USER_ALREADY_EXIST }
          : { case: "success", value: {} },
        accessToken: userExists ? undefined : "tok",
        userId: "u1",
      } as MessageInitShape<typeof NotificationUserResponseSchema>);
    }
    return new Response(null, { status: 202 });
  }) as typeof fetch;
});
afterEach(async () => {
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  resetTracker();
});

async function signUp(props: React.ComponentProps<typeof Notifications>) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => root.render(<Notifications slug="shop" {...props} />));
  await React.act(async () => void (await new Promise((r) => setTimeout(r, 30))));

  const email = container.querySelector<HTMLInputElement>("#bts-notifications-form-email")!;
  const setValue = Object.getOwnPropertyDescriptor(page.win.HTMLInputElement.prototype, "value")!.set!;
  await React.act(async () => {
    setValue.call(email, "jane.doe@example.com");
    email.dispatchEvent(new page.win.Event("input", { bubbles: true }));
  });
  await React.act(async () =>
    container.querySelector<HTMLInputElement>("#bts-notifications-form-marketing-consent")!.click(),
  );
  await React.act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new page.win.Event("submit", { bubbles: true, cancelable: true }));
  });
  // The form reports success after a one second pause.
  await React.act(async () => void (await new Promise((r) => setTimeout(r, 1200))));
}

describe("notifications analytics", () => {
  it("reports a new sign-up for the product, without the email address", async () => {
    const seen = collector();
    await signUp({ projectID: TEST_KEY, productID: "prodAbc", analytics: { onEvent: seen.onEvent } });
    const [signup] = seen.named("availability_signup");
    assert.ok(signup, "availability_signup was reported");
    assert.deepEqual(signup.props, {});
    assert.equal(signup.product_id, "prodAbc");
    assert.deepEqual(findPII(seen.events), []);
    assert.ok(!JSON.stringify(seen.events).includes("jane"));
  });

  it("reports an address that is already subscribed too (every successful signup)", async () => {
    userExists = true;
    const seen = collector();
    await signUp({ projectID: TEST_KEY, analytics: { onEvent: seen.onEvent } });
    assert.equal(seen.named("availability_signup").length, 1);
    assert.ok(page.win.document.querySelector("main"), "the component still rendered");
  });

  it("sends nothing with analytics={false}", async () => {
    const seen = collector();
    await signUp({ projectID: TEST_KEY, analytics: false });
    assert.equal(seen.events.length, 0);
    assert.equal(page.pendingBeacons(), 0);
  });
});

process.on("exit", teardownReactPage);
