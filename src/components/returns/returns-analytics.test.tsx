import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { create, toBinary, type DescMessage, type MessageInitShape } from "@bufbuild/protobuf";
import { getTracker, resetTracker } from "@/src/analytics/core";
import { collector, findPII, setupReactPage, teardownReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import { CreateReturnRequestResponseSchema } from "src/gen/proto/public/v1/returns_pb";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let ReturnsProvider: typeof import("./ReturnsProvider.tsx").ReturnsProvider;
let ReturnsOrderDetail: typeof import("./OrderSteps.tsx").ReturnsOrderDetail;
let useCreateReturn: typeof import("./hooks.ts").useCreateReturn;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ ReturnsProvider } = await import("./ReturnsProvider.tsx"));
  ({ ReturnsOrderDetail } = await import("./OrderSteps.tsx"));
  ({ useCreateReturn } = await import("./hooks.ts"));
});

const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;

function proto<T extends DescMessage>(schema: T, init: MessageInitShape<T>) {
  return new Response(toBinary(schema, create(schema, init)) as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/proto" },
  });
}

beforeEach(() => {
  resetTracker();
  page.win.sessionStorage.clear();
  globalThis.fetch = (async (input: string) => {
    const url = String(input);
    if (url.endsWith("/CreateReturnRequest")) {
      return proto(CreateReturnRequestResponseSchema, { request: { id: "ret-1" } } as never);
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  console.error = () => {};
});
afterEach(async () => {
  console.error = originalError;
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  resetTracker();
});

async function mount(element: React.ReactElement) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => root.render(element));
  await React.act(async () => void (await new Promise((r) => setTimeout(r, 30))));
  return container;
}

describe("returns analytics", () => {
  it("reports a return started for the order, once", async () => {
    const seen = collector();
    await mount(
      <ReturnsProvider projectID={TEST_KEY} analytics={{ onEvent: seen.onEvent }}>
        <ReturnsOrderDetail orderId="order-9" onContinue={() => {}} />
      </ReturnsProvider>,
    );
    const started = seen.named("return_started");
    assert.equal(started.length, 1);
    assert.equal(started[0].order_ref, null, "the order id may be an access token");
    assert.deepEqual(started[0].props, {});
    assert.equal(started[0].page_type, "returns");
  });

  it("reports a submitted return with the item count, not the note", async () => {
    const seen = collector();
    let submit: ReturnType<typeof useCreateReturn>["submit"] | undefined;
    function Harness() {
      submit = useCreateReturn().submit;
      return null;
    }
    await mount(
      <ReturnsProvider projectID={TEST_KEY} analytics={{ onEvent: seen.onEvent }}>
        <Harness />
      </ReturnsProvider>,
    );
    let result: unknown;
    await React.act(async () => {
      result = await submit!({
        orderId: "order-9",
        items: [
          { lineId: "l1", quantity: 1 },
          { lineId: "l2", quantity: 3 },
        ],
        note: "Please contact jane.doe@example.com, it broke",
      });
    });
    assert.ok(result, "the request was created");
    const [submitted] = seen.named("return_submitted");
    assert.deepEqual(submitted.props, { reason_code: "unspecified", item_count: 2 });
    assert.equal(submitted.order_ref, null);
    assert.deepEqual(findPII(seen.events), []);
    assert.ok(!JSON.stringify(seen.events).includes("broke"));
  });

  it("does not report a return that failed", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;
    const seen = collector();
    let submit: ReturnType<typeof useCreateReturn>["submit"] | undefined;
    function Harness() {
      submit = useCreateReturn().submit;
      return null;
    }
    await mount(
      <ReturnsProvider projectID={TEST_KEY} analytics={{ onEvent: seen.onEvent }}>
        <Harness />
      </ReturnsProvider>,
    );
    await React.act(async () => void (await submit!({ orderId: "order-9", items: [{ lineId: "l1", quantity: 1 }] })));
    assert.equal(seen.named("return_submitted").length, 0);
  });

  it("sends nothing with analytics={false}, and writes no cookie", async () => {
    const seen = collector();
    await mount(
      <ReturnsProvider projectID={TEST_KEY} analytics={false}>
        <ReturnsOrderDetail orderId="order-9" onContinue={() => {}} />
      </ReturnsProvider>,
    );
    assert.equal(seen.events.length, 0);
    assert.equal(getTracker(), undefined);
    assert.equal(page.win.document.cookie, "");
  });
});

process.on("exit", teardownReactPage);
