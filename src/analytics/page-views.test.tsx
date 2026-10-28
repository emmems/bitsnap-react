import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { getTracker, initTracker, resetTracker } from "./core.ts";
import { init } from "./embed.ts";
import type { ClientEvent } from "./contract.ts";
import { TEST_KEY, setupReactPage, teardownReactPage } from "./react-testing.ts";

const page = setupReactPage("https://shop.example.test/products");

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let useInstrument: typeof import("./instrument.ts").useInstrument;
let useAnalytics: typeof import("./react.tsx").useAnalytics;
let BitsnapAnalyticsProvider: typeof import("./react.tsx").BitsnapAnalyticsProvider;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ useInstrument } = await import("./instrument.ts"));
  ({ BitsnapAnalyticsProvider, useAnalytics } = await import("./react.tsx"));
});

let seen = 0;
beforeEach(() => {
  resetTracker();
  page.win.history.replaceState({}, "", "/products");
  page.win.document.body.innerHTML = "";
});
afterEach(async () => {
  for (const root of roots.splice(0)) await React.act(async () => root.unmount());
});

const roots: Array<{ unmount: () => void }> = [];

async function mount(element: React.ReactElement) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => root.render(element));
  return { unmount: () => React.act(async () => root.unmount()) };
}

/** Events sent since the previous call. */
async function sentEvents(): Promise<ClientEvent[]> {
  getTracker()?.flush();
  const all = await page.events();
  const fresh = all.slice(seen);
  seen = all.length;
  return fresh;
}

const views = (events: ClientEvent[]) => events.filter((e) => e.event === "page_view");

function Probe({ analytics }: { analytics?: boolean }) {
  const instrument = useInstrument(TEST_KEY, analytics, "cart");
  React.useEffect(() => {
    instrument.track("cart_opened", { item_count: 1, value_minor: 100, currency: "PLN" });
  }, [instrument]);
  return null;
}

describe("automatic page views", () => {
  it("sends one page_view per path change for a provider and any number of components", async () => {
    await mount(
      <BitsnapAnalyticsProvider projectKey={TEST_KEY}>
        <Probe />
        <Probe />
      </BitsnapAnalyticsProvider>,
    );
    await mount(<BitsnapAnalyticsProvider projectKey={TEST_KEY} />);
    page.win.history.pushState({}, "", "/products/boots");
    page.win.history.replaceState({}, "", "/products/boots?x=1");
    page.win.history.pushState({}, "", "/cart");
    const found = views(await sentEvents());
    assert.deepEqual(found.map((e) => e.path), ["/products", "/products/boots", "/cart"]);
    assert.deepEqual(found.map((e) => (e.props as { landing: boolean }).landing), [true, false, false]);
  });

  it("does not count a change of the query string or the hash alone as a new page", async () => {
    await mount(<BitsnapAnalyticsProvider projectKey={TEST_KEY} />);
    page.win.history.pushState({}, "", "/products?page=2");
    page.win.history.pushState({}, "", "/products?page=3#reviews");
    page.win.history.replaceState({}, "", "/products?page=3#top");
    page.win.history.pushState({}, "", "/products");
    page.win.location.hash = "#footer";
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(views(await sentEvents()).map((e) => e.path), ["/products"]);
    page.win.history.pushState({}, "", "/products/boots?page=3");
    assert.deepEqual(views(await sentEvents()).map((e) => e.path), ["/products/boots"]);
  });

  it("does not count replaceState to the same path", async () => {
    await mount(<BitsnapAnalyticsProvider projectKey={TEST_KEY} />);
    page.win.history.replaceState({ a: 1 }, "", "/products");
    page.win.history.replaceState({ a: 2 }, "");
    assert.deepEqual(views(await sentEvents()).map((e) => e.path), ["/products"]);
  });

  it("gives an automatic view no page type left over from an earlier manual page()", async () => {
    function Manual() {
      const { page: sendPage } = useAnalytics();
      React.useEffect(() => {
        sendPage("product");
      }, [sendPage]);
      return null;
    }
    await mount(
      <BitsnapAnalyticsProvider projectKey={TEST_KEY} autoPageViews={false}>
        <Manual />
      </BitsnapAnalyticsProvider>,
    );
    assert.deepEqual(views(await sentEvents()).map((e) => e.page_type), ["product"]);
    await mount(<BitsnapAnalyticsProvider projectKey={TEST_KEY} autoPageViews />);
    page.win.history.pushState({}, "", "/next");
    assert.deepEqual(views(await sentEvents()).map((e) => [e.path, e.page_type]), [
      ["/products", null],
      ["/next", null],
    ]);
  });

  it("sends the page view before the events of the children", async () => {
    await mount(
      <BitsnapAnalyticsProvider projectKey={TEST_KEY}>
        <Probe />
      </BitsnapAnalyticsProvider>,
    );
    assert.deepEqual((await sentEvents()).map((e) => e.event), ["page_view", "cart_opened"]);
  });

  it("follows Back and Forward", async () => {
    await mount(<BitsnapAnalyticsProvider projectKey={TEST_KEY} />);
    page.win.history.pushState({}, "", "/a");
    page.win.history.pushState({}, "", "/b");
    page.win.history.back();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(views(await sentEvents()).map((e) => e.path), ["/products", "/a", "/b", "/a"]);
  });

  it("reports the page once when the provider mounts again (strict mode)", async () => {
    const view = await mount(<BitsnapAnalyticsProvider projectKey={TEST_KEY} />);
    await view.unmount();
    await mount(<BitsnapAnalyticsProvider projectKey={TEST_KEY} />);
    assert.equal(views(await sentEvents()).length, 1);
  });

  it("sends no page views with autoPageViews={false}, and a component inside leaves it so", async () => {
    await mount(
      <BitsnapAnalyticsProvider projectKey={TEST_KEY} autoPageViews={false}>
        <Probe />
      </BitsnapAnalyticsProvider>,
    );
    page.win.history.pushState({}, "", "/elsewhere");
    assert.deepEqual((await sentEvents()).map((e) => e.event), ["cart_opened"]);
  });

  it("sends no page views with enabled={false}", async () => {
    initTracker({ projectKey: TEST_KEY });
    await mount(<BitsnapAnalyticsProvider projectKey={TEST_KEY} enabled={false} />);
    page.win.history.pushState({}, "", "/elsewhere");
    assert.deepEqual(await sentEvents(), []);
  });

  it("does not let a provider with an invalid key swallow the page view", async () => {
    await mount(<BitsnapAnalyticsProvider projectKey="not a key!!" />);
    await mount(<BitsnapAnalyticsProvider projectKey={TEST_KEY} />);
    assert.equal(views(await sentEvents()).length, 1);
  });

  it("stops reporting path changes when the last provider unmounts", async () => {
    const view = await mount(<BitsnapAnalyticsProvider projectKey={TEST_KEY} />);
    await view.unmount();
    page.win.history.pushState({}, "", "/after-unmount");
    assert.deepEqual(views(await sentEvents()).map((e) => e.path), ["/products"]);
  });

  it("starts from a component without a provider, once however many components there are", async () => {
    await mount(
      <>
        <Probe />
        <Probe />
      </>,
    );
    await mount(<Probe analytics={false} />);
    page.win.history.pushState({}, "", "/next");
    const found = views(await sentEvents());
    assert.deepEqual(found.map((e) => e.path), ["/products", "/next"]);
    // A component without a provider reports its own page type, never a stale one.
    assert.deepEqual(found.map((e) => e.page_type), ["cart", "cart"]);
  });

  it("shares one page_view per path with the analytics.js script", async () => {
    page.win.document.body.innerHTML = '<script id="s" data-project="Ab12Cd"></script>';
    const api = init(page.win.document.getElementById("s"));
    assert.ok(api);
    await mount(<BitsnapAnalyticsProvider projectKey="Ab12Cd" />);
    page.win.history.pushState({}, "", "/shared");
    page.win.history.pushState({}, "", "/shared-2");
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    delete page.win.bitsnap;
    const events = await page.events();
    const paths = views(events.slice(seen)).map((e) => e.path);
    seen = events.length;
    assert.deepEqual(paths, ["/products", "/shared", "/shared-2"]);
  });
});

process.on("exit", teardownReactPage);
