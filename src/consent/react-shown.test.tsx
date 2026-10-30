import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { TEST_KEY, setupReactPage } from "../analytics/react-testing.ts";

// Its own file: the impression is once per page (window), and `react.test.tsx` shares one window.
const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let BitsnapConsent: typeof import("./react.tsx").BitsnapConsent;

const originalFetch = globalThis.fetch;
let posts: Record<string, unknown>[] = [];

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ BitsnapConsent } = await import("./react.tsx"));
});

afterEach(() => {
  page.win.document.body.innerHTML = "";
  page.win.BitsnapConsent?.destroy();
  delete page.win.BitsnapConsent;
  globalThis.fetch = originalFetch;
});

describe("<BitsnapConsent> impression", () => {
  it("sends one shown ping under StrictMode and re-renders", async () => {
    posts = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/consent/config")) return new Response("{}", { status: 404 });
      posts.push(JSON.parse(init!.body as string));
      return new Response("ok");
    }) as typeof fetch;
    const container = page.win.document.createElement("div");
    page.win.document.body.appendChild(container);
    const root = createRoot(container);
    const element = (title: string) =>
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(BitsnapConsent, { projectKey: TEST_KEY, categories: { analytics: true }, title }),
      );
    await React.act(async () => root.render(element("one")));
    await React.act(async () => root.render(element("two"))); // the effect re-runs: a new controller
    await page.win.BitsnapConsent!.ready;
    await React.act(async () => {});
    assert.equal(posts.length, 1);
    assert.equal(posts[0].action, "shown");
    assert.equal(posts[0].k, TEST_KEY);
    assert.equal("consent_id" in posts[0], false);
    assert.equal("c" in posts[0], false);
    await React.act(async () => root.unmount());
  });
});
