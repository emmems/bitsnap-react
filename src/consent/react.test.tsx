import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { resetTracker } from "../analytics/core.ts";
import { TEST_KEY, setupReactPage, teardownReactPage } from "../analytics/react-testing.ts";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let BitsnapConsent: typeof import("./react.tsx").BitsnapConsent;
let BitsnapAnalyticsProvider: typeof import("../analytics/react.tsx").BitsnapAnalyticsProvider;
let useAnalytics: typeof import("../analytics/react.tsx").useAnalytics;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ BitsnapConsent } = await import("./react.tsx"));
  ({ BitsnapAnalyticsProvider, useAnalytics } = await import("../analytics/react.tsx"));
});

afterEach(() => {
  page.win.document.body.innerHTML = "";
  page.win.BitsnapConsent?.destroy();
  delete page.win.BitsnapConsent;
  resetTracker();
});

async function mount(element: React.ReactElement) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => root.render(element));
  return { unmount: () => React.act(async () => root.unmount()) };
}

describe("<BitsnapConsent> and the first events", () => {
  it("exists before the passive effects of its siblings run", async () => {
    let seen: unknown = "not run";
    function Sibling() {
      React.useEffect(() => {
        seen = page.win.BitsnapConsent;
      }, []);
      return null;
    }
    const view = await mount(
      React.createElement(React.Fragment, null, React.createElement(Sibling), React.createElement(BitsnapConsent, { preview: true })),
    );
    assert.ok(seen && seen !== "not run", "the API was there when the sibling's effect ran");
    await view.unmount();
  });

  it("holds the first events of the page's children until consent is known", async () => {
    const events: string[] = [];
    // The project config is slow, so consent stays unknown while the children's first effects run.
    const originalFetch = globalThis.fetch;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    globalThis.fetch = (async () => {
      await gate;
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    function FirstEvent() {
      const analytics = useAnalytics();
      React.useEffect(() => {
        analytics.page("shop");
      }, [analytics]);
      return null;
    }
    const view = await mount(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(BitsnapConsent, { projectKey: TEST_KEY, categories: { analytics: true } }),
        React.createElement(
          BitsnapAnalyticsProvider,
          { projectKey: TEST_KEY, onEvent: (event) => events.push(event.event) },
          React.createElement(FirstEvent),
        ),
      ),
    );
    assert.deepEqual(events, [], "page_view waits for the stored choice");
    release();
    await page.win.BitsnapConsent!.ready;
    await React.act(async () => {});
    assert.deepEqual(events, ["page_view"]);
    globalThis.fetch = originalFetch;
    await view.unmount();
  });
});
