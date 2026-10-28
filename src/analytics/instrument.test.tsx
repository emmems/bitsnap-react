import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { getTracker, initTracker, resetTracker } from "./core.ts";
import { newMilestones, scoreBucket, type AnalyticsOption } from "./instrument.ts";
import { TEST_KEY, collector, deviceState, setupReactPage, teardownReactPage } from "./react-testing.ts";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let renderToString: typeof import("react-dom/server").renderToString;
let useInstrument: typeof import("./instrument.ts").useInstrument;
let BitsnapAnalyticsProvider: typeof import("./react.tsx").BitsnapAnalyticsProvider;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  renderToString = (await import("react-dom/server")).renderToString;
  ({ useInstrument } = await import("./instrument.ts"));
  ({ BitsnapAnalyticsProvider } = await import("./react.tsx"));
});

beforeEach(() => resetTracker());
afterEach(() => {
  page.win.document.body.innerHTML = "";
});

function Probe({
  analytics,
  projectKey = TEST_KEY,
  name = "cart_opened",
}: {
  analytics?: AnalyticsOption;
  projectKey?: string;
  name?: "cart_opened";
}) {
  const instrument = useInstrument(projectKey, analytics, "cart");
  React.useEffect(() => {
    instrument.track(name, { item_count: 2, value_minor: 1000, currency: "PLN" });
  }, [instrument, name]);
  return null;
}

async function mount(element: React.ReactElement) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => root.render(element));
  return { root, unmount: () => React.act(async () => root.unmount()) };
}

describe("useInstrument", () => {
  it("starts the tracker lazily and sends validated events from the SDK", async () => {
    assert.equal(getTracker(), undefined);
    const seen = collector();
    const view = await mount(<Probe analytics={{ onEvent: seen.onEvent }} />);
    assert.ok(getTracker());
    getTracker()!.flush();
    const sent = await page.events();
    // Without a provider the component starts the tracker, which reports the page itself first.
    assert.deepEqual(sent.map((e) => e.event), ["page_view", "cart_opened"]);
    assert.deepEqual(sent[0].props, { landing: true });
    assert.equal(sent[1].source, "sdk_react");
    assert.equal(sent[1].channel, "embed");
    assert.equal(sent[1].page_type, "cart");
    assert.equal(sent[1].env, "live");
    assert.deepEqual(sent[1].props, { item_count: 2, value_minor: 1000, currency: "PLN" });
    assert.equal(seen.events.length, 1);
    await view.unmount();
  });

  it("sends nothing and creates no tracker with analytics={false}", async () => {
    const seen = collector();
    await mount(<Probe analytics={false} />);
    assert.equal(getTracker(), undefined);
    assert.equal(seen.events.length, 0);
    assert.equal(page.pendingBeacons(), 0);
  });

  it("is a no-op without a valid project key and never throws", async () => {
    await mount(<Probe projectKey="" />);
    await mount(<Probe projectKey="not a key!!" />);
    assert.equal(page.pendingBeacons(), 0);
  });

  it("passes env through", async () => {
    const seen = collector();
    await mount(<Probe analytics={{ onEvent: seen.onEvent, env: "test" }} />);
    assert.equal(seen.events[0].env, "test");
  });

  it("gives each component only its own events", async () => {
    const a = collector();
    const b = collector();
    await mount(
      <>
        <Probe analytics={{ onEvent: a.onEvent }} />
        <Probe analytics={{ onEvent: b.onEvent }} />
      </>,
    );
    assert.equal(a.events.length, 1);
    assert.equal(b.events.length, 1);
    assert.notEqual(a.events[0].event_id, b.events[0].event_id);
  });

  it("uses a <BitsnapAnalyticsProvider> when there is one, and honours the opt-out inside it", async () => {
    const fromProvider = collector();
    await mount(
      <BitsnapAnalyticsProvider projectKey={TEST_KEY} onEvent={fromProvider.onEvent}>
        <Probe />
        <Probe analytics={false} />
      </BitsnapAnalyticsProvider>,
    );
    assert.equal(fromProvider.events.length, 1);
  });

  it("respects enabled={false} on the first events even when the tracker already exists", async () => {
    initTracker({ projectKey: TEST_KEY });
    const fromProvider = collector();
    await mount(
      <BitsnapAnalyticsProvider projectKey={TEST_KEY} enabled={false} onEvent={fromProvider.onEvent}>
        <Probe />
      </BitsnapAnalyticsProvider>,
    );
    getTracker()!.flush();
    assert.equal(fromProvider.events.length, 0);
    assert.equal(page.pendingBeacons(), 0);
  });

  it("stays silent when Bitsnap Consent says no", async () => {
    (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = {
      get: () => ({ c: { analytics: false } }),
    };
    const seen = collector();
    await mount(<Probe analytics={{ onEvent: seen.onEvent }} />);
    delete (page.win as unknown as { BitsnapConsent?: unknown }).BitsnapConsent;
    assert.equal(seen.events.length, 0);
  });

  it("writes no cookie and no Web Storage", async () => {
    const before = deviceState(page.win);
    await mount(<Probe />);
    getTracker()?.flush();
    await page.events();
    assert.equal(deviceState(page.win), before);
  });

  it("renders on the server without touching the tracker", () => {
    const html = renderToString(<Probe />);
    assert.equal(html, "");
    assert.equal(getTracker(), undefined);
  });
});

describe("helpers", () => {
  it("buckets scores the way the contract names them", () => {
    assert.deepEqual([0, 24.9, 25, 49, 50, 74, 75, 99, 100, 140, NaN].map(scoreBucket), [
      "0-24", "0-24", "25-49", "25-49", "50-74", "50-74", "75-99", "75-99", "100", "100", "0-24",
    ]);
  });

  it("returns each milestone once", () => {
    const seen = new Set<number>();
    assert.deepEqual(newMilestones(10, seen), []);
    assert.deepEqual(newMilestones(51, seen), [25, 50]);
    assert.deepEqual(newMilestones(51, seen), []);
    assert.deepEqual(newMilestones(100, seen), [75, 100]);
  });
});

process.on("exit", teardownReactPage);
