import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { dashboardRoute, init } from "./embed.ts";
import { uuidv7 } from "./core.ts";
import { validateEnvelope } from "./contract.ts";
import { setupPage, teardownPage } from "./testing.ts";

function script(page: ReturnType<typeof setupPage>, attributes: string) {
  page.win.document.body.innerHTML = `<script id="s" ${attributes}></script>`;
  return page.win.document.getElementById("s");
}

const VIEW = { price_minor: 100, currency: "PLN", availability: "in_stock" } as const;

afterEach(() => {
  teardownPage();
});

describe("analytics embed", () => {
  it("sends a landing page_view on load, then one per SPA navigation", async () => {
    const page = setupPage("https://blog.example.test/a?utm_medium=cpc");
    const api = init(script(page, 'data-project="pk_Ab12Cd" data-page-type="catalog"'));
    assert.ok(api);
    assert.strictEqual(page.win.bitsnap, api);
    page.win.history.pushState({}, "", "/b?x=1");
    page.win.history.replaceState({}, "", "/b?x=2");
    page.win.history.pushState({}, "", "/c");
    page.win.history.back();
    page.win.dispatchEvent(new page.win.PopStateEvent("popstate"));
    api!.track("product_view", VIEW);
    page.win.dispatchEvent(new page.win.Event("pagehide"));

    const [beacon] = await page.beacons();
    assert.equal(beacon.parsed.k, "Ab12Cd");
    const events = beacon.parsed.events;
    for (const event of events) {
      assert.deepEqual(validateEnvelope(event), { ok: true });
      assert.equal(event.source, "script");
      assert.equal(event.channel, "embed");
      assert.equal(event.page_type, "catalog");
      assert.equal(event.utm_medium, "cpc");
    }
    const views = events.filter((e) => e.event === "page_view");
    assert.deepEqual(views.map((e) => e.path), ["/a", "/b", "/c"]);
    assert.deepEqual(views.map((e) => (e.props as { landing: boolean }).landing), [true, false, false]);
    assert.equal(events.at(-1)!.event, "product_view");
  });

  it("tracks nothing automatically with data-auto=off", async () => {
    const page = setupPage();
    const api = init(script(page, 'data-project="Ab12Cd" data-auto="off"'));
    page.win.history.pushState({}, "", "/other");
    api!.track("product_view", VIEW, { product_id: "p1" });
    api!.page("product");
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    const events = await page.events();
    assert.deepEqual(events.map((e) => e.event), ["product_view", "page_view"]);
    assert.equal(events[0].product_id, "p1");
    assert.equal(events[1].page_type, "product");
  });

  it("replays calls queued before the script loaded, and runs later pushes at once", async () => {
    const page = setupPage();
    const queued = [["track", "product_view", VIEW, { product_id: "p9" }], ["page", "shop"], ["bogus", 1]];
    (page.win as unknown as { bitsnap: unknown }).bitsnap = { q: queued };
    // gtag-style `arguments` objects work too.
    queued.push((function () { return arguments; })("track", "variant_selected", {}) as never);
    const api = init(script(page, 'data-project="Ab12Cd" data-auto="off"'));
    (api!.q as { push(...calls: unknown[][]): number }).push(["track", "cart_opened", { item_count: 1, value_minor: 100, currency: "PLN" }]);
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    const events = await page.events();
    assert.deepEqual(events.map((e) => e.event), ["product_view", "page_view", "variant_selected", "cart_opened"]);
    assert.equal(events[0].product_id, "p9");
    assert.equal(events[3].page_type, "shop");
  });

  it("reads data-endpoint and data-env", async () => {
    const page = setupPage();
    init(script(page, 'data-project="Ab12Cd" data-endpoint="https://collect.example.test" data-env="test"'));
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    const [beacon] = await page.beacons();
    assert.equal(beacon.url, "https://collect.example.test/e");
    assert.equal(beacon.parsed.events[0].env, "test");
    assert.equal(beacon.parsed.events[0].page_type, null);
  });

  it("starts once and does nothing without data-project", async () => {
    const page = setupPage();
    const api = init(script(page, 'data-project="Ab12Cd"'));
    assert.strictEqual(init(script(page, 'data-project="Ab12Cd"')), api);

    const other = setupPage();
    const stub = init(script(other, ""));
    assert.ok(stub);
    assert.doesNotThrow(() => {
      stub!.track("product_view", VIEW);
      stub!.page("shop");
    });
    other.win.dispatchEvent(new other.win.Event("pagehide"));
    assert.equal((await other.events()).length, 0);
  });
  it("reads data-source and data-channel, and falls back to script/embed for anything else", async () => {
    const page = setupPage("https://shop.example.test/p/x");
    init(script(page, 'data-project="Ab12Cd" data-source="storefront" data-channel="custom_domain" data-auto="off"'));
    page.win.bitsnap!.track!("product_view", VIEW);
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    const [first] = await page.events();
    assert.equal(first.source, "storefront");
    assert.equal(first.channel, "custom_domain");
    assert.deepEqual(validateEnvelope(first), { ok: true });
    teardownPage();

    const other = setupPage();
    init(script(other, 'data-project="Ab12Cd" data-source="server" data-channel="api" data-auto="off"'));
    other.win.bitsnap!.track!("product_view", VIEW);
    other.win.dispatchEvent(new other.win.Event("pagehide"));
    const [second] = await other.events();
    assert.equal(second.source, "script");
    assert.equal(second.channel, "embed");
  });

  it("honours data-visitor-id only for the dashboard source", async () => {
    const id = "Hwvte4vYwO3TUMb24m7dGM";
    const page = setupPage("https://bitsnap.pl/app/stats");
    init(script(page, `data-project="Ab12Cd" data-source="dashboard" data-channel="hosted" data-visitor-id="${id}" data-page-type="app"`));
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    const [view] = await page.events();
    assert.equal(view.visitor_id, id);
    assert.deepEqual(validateEnvelope(view), { ok: true });
    teardownPage();

    for (const attributes of [
      `data-project="Ab12Cd" data-source="storefront" data-visitor-id="${id}"`,
      `data-project="Ab12Cd" data-visitor-id="${id}"`,
      'data-project="Ab12Cd" data-source="dashboard" data-visitor-id="not a valid id"',
    ]) {
      const other = setupPage();
      init(script(other, `${attributes} data-auto="off"`));
      other.win.bitsnap!.track!("product_view", VIEW);
      other.win.bitsnap!.page!("shop");
      other.win.dispatchEvent(new other.win.Event("pagehide"));
      for (const event of await other.events()) assert.ok(event.visitor_id == null, attributes);
      teardownPage();
    }
  });

  it("reports app_page_view with the route for the dashboard source", async () => {
    const page = setupPage("https://bitsnap.pl/app/orders/1234?tab=x");
    const api = init(script(page, 'data-project="Ab12Cd" data-source="dashboard" data-channel="hosted" data-page-type="app"'));
    page.win.history.pushState({}, "", "/app/stats");
    api!.track("search_performed", { result_count: 3 });
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    const events = await page.events();
    assert.deepEqual(events.map((e) => e.event), ["app_page_view", "app_page_view", "search_performed"]);
    assert.deepEqual(events[0].props, { route: "/app/orders/:id" });
    assert.deepEqual(events[1].props, { route: "/app/stats", previous_route: "/app/orders/:id" });
    for (const event of events) {
      assert.deepEqual(validateEnvelope(event), { ok: true });
      assert.equal(event.source, "dashboard");
      assert.equal(event.page_type, "app");
    }
    assert.equal(events[0].path, "/app/orders/:id");
  });

  it("accepts data-channel=panel and passes event_id through window.bitsnap.track", async () => {
    const page = setupPage("https://bitsnap.pl/app/stats");
    const api = init(script(page, 'data-project="Ab12Cd" data-source="dashboard" data-channel="panel" data-auto="off" data-page-type="app"'));
    const id = uuidv7();
    page.win.bitsnap!.track!("search_performed", { result_count: 1 }, { event_id: id });
    api!.page("app");
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    const [search, view] = await page.events();
    assert.equal(search.channel, "panel");
    assert.equal(search.event_id, id);
    assert.deepEqual(validateEnvelope(search), { ok: true });
    assert.deepEqual(validateEnvelope(view), { ok: true });
  });

  it("folds numeric, digit-bearing and hashid-like record segments into :id", () => {
    assert.equal(dashboardRoute("/app/orders/1234"), "/app/orders/:id");
    assert.equal(dashboardRoute("/app/orders/aB3xK9"), "/app/orders/:id");
    assert.equal(dashboardRoute("/app/coupons/Xk2_9q/edit"), "/app/coupons/:id/edit");
    assert.equal(dashboardRoute("/app/products/Wxyzabc"), "/app/products/:id");
    assert.equal(dashboardRoute("/app/anything/abc123"), "/app/anything/:id", "any segment with a digit");
    assert.equal(dashboardRoute("/app/products/new"), "/app/products/new");
    assert.equal(dashboardRoute("/app/stats"), "/app/stats");
    assert.equal(dashboardRoute("/app/settings"), "/app/settings");
  });

  it("lets data-route-template and an explicit path override the derived route", async () => {
    const page = setupPage("https://bitsnap.pl/app/whatever/xyz");
    const api = init(script(page, 'data-project="Ab12Cd" data-source="dashboard" data-channel="panel" data-route-template="/app/custom/:id"'));
    api!.page("app", { path: "/app/explicit" });
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    const events = await page.events();
    assert.deepEqual(events[0].props, { route: "/app/custom/:id" });
    assert.deepEqual(events[1].props, { route: "/app/explicit", previous_route: "/app/custom/:id" });
  });
});
