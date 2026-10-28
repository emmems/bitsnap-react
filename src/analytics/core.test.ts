import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { createTracker, getTracker, initTracker, packEvents, resetTracker, uuidv7, type Tracker } from "./core.ts";
import { validateEnvelope, type ClientEvent } from "./contract.ts";
import { SDK_VERSION } from "../version.ts";
import { createConsent } from "../consent/core/controller.ts";
import type { BitsnapConsentApi } from "../consent/core/types.ts";
import { encodeState } from "../consent/core/cookie.ts";
import { setupPage, teardownPage } from "./testing.ts";

const KEY = "Ab12Cd";
const VIEW = { price_minor: 1999, currency: "PLN", availability: "in_stock" } as const;
const trackers: Tracker[] = [];

function make(options: Partial<Parameters<typeof createTracker>[0]> = {}) {
  const tracker = createTracker({ projectKey: KEY, ...options });
  trackers.push(tracker);
  return tracker;
}

afterEach(() => {
  trackers.splice(0).forEach((t) => t.destroy());
  resetTracker();
  mock.timers.reset();
  mock.restoreAll();
  teardownPage();
});

describe("analytics tracker: envelope", () => {
  it("builds envelopes the contract accepts", async () => {
    const page = setupPage();
    const tracker = make();
    tracker.page("product");
    tracker.track("product_view", VIEW, { product_id: "prod1", page_type: "product" });
    tracker.flush();

    const beacons = await page.beacons();
    assert.equal(beacons.length, 1);
    assert.equal(beacons[0].url, "https://collect.bitsnap.pl/e");
    assert.equal(beacons[0].type, "text/plain");
    assert.equal(beacons[0].parsed.k, KEY);
    const [view, product] = beacons[0].parsed.events;
    for (const event of beacons[0].parsed.events) {
      assert.deepEqual(validateEnvelope(event), { ok: true });
      assert.equal(event.sdk, `bitsnap-react@${SDK_VERSION}`);
      assert.equal(event.source, "sdk_react");
      assert.equal(event.channel, "embed");
      assert.equal(event.env, "live");
      assert.equal(event.schema_version, 1);
      assert.equal(event.host, "shop.example.test");
      assert.equal(event.path, "/products/shoes");
      assert.equal(event.referrer_host, "www.google.com");
      assert.match(event.page_id!, /^[A-Za-z0-9_-]{8,32}$/);
      assert.ok(Math.abs(event.ts - Date.now()) < 5000);
    }
    assert.equal(view.event, "page_view");
    assert.deepEqual(view.props, { landing: true });
    assert.equal(view.page_type, "product");
    assert.equal(product.event, "product_view");
    assert.equal(product.product_id, "prod1");
    assert.equal(view.page_id, product.page_id);
    assert.notEqual(view.event_id, product.event_id);
  });

  it("makes UUIDv7 ids that sort by time", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(a < b);
  });

  it("marks only the first page view as landing and applies the page type afterwards", async () => {
    const page = setupPage();
    const tracker = make();
    tracker.page("shop");
    tracker.page();
    tracker.track("cart_opened", { item_count: 1, value_minor: 100, currency: "PLN" });
    tracker.flush();
    const events = await page.events();
    assert.deepEqual(events.map((e) => e.props), [{ landing: true }, { landing: false }, { item_count: 1, value_minor: 100, currency: "PLN" }]);
    assert.deepEqual(events.map((e) => e.page_type), ["shop", "shop", "shop"]);
  });

  it("captures utm_* and ref from the landing URL once per page load", async () => {
    const page = setupPage(
      "https://shop.example.test/p/one?utm_source=news&utm_medium=email&utm_campaign=autumn&utm_content=hero&utm_term=jan@example.com&ref=friend7&token=abc#x",
    );
    const tracker = make();
    tracker.page("product");
    page.win.history.pushState({}, "", "/p/two?utm_source=other");
    tracker.track("product_view", VIEW);
    tracker.flush();
    const events = await page.events();
    assert.equal(events.length, 2);
    for (const event of events) {
      assert.equal(event.utm_source, "news");
      assert.equal(event.utm_medium, "email");
      assert.equal(event.utm_campaign, "autumn");
      assert.equal(event.utm_content, "hero");
      assert.equal(event.utm_term, null, "campaign values with an @ are dropped");
      assert.equal(event.ref_code, "friend7");
    }
    assert.equal(events[0].path, "/p/one");
    assert.equal(events[1].path, "/p/two", "path follows the current location");
  });

  it("strips query strings, fragments and opaque path segments", async () => {
    const page = setupPage(
      "https://shop.example.test/panel/orders/abcdefghijklmnopqrstuvwxyz0123?email=a@b.pl&secret=1#frag",
      "https://blog.example.test/post?id=7",
    );
    const tracker = make();
    tracker.track("panel_order_viewed", {}, { order_ref: "ord1" });
    tracker.flush();
    const [beacon] = await page.beacons();
    const event = beacon.parsed.events[0];
    assert.equal(event.path, "/panel/orders/:token");
    assert.equal(event.referrer_host, "blog.example.test");
    for (const leak of ["secret", "frag", "a@b.pl", "id=7", "/post"]) {
      assert.ok(!beacon.body.includes(leak), `body leaks ${leak}`);
    }
  });

  it("reports a route template for the dashboard and only sends visitor_id there", async () => {
    const page = setupPage("https://bitsnap.pl/app/stats?tab=1");
    const dashboard = make({ source: "dashboard", channel: "panel", visitorId: "A".repeat(22) });
    dashboard.track("app_page_view", { route: "/app/stats" }, { path: "/app/stats/:id?x=1", page_type: "app" });
    dashboard.flush();
    const react = make({ visitorId: "B".repeat(22) });
    react.track("cart_opened", { item_count: 1, value_minor: 1, currency: "PLN" });
    react.flush();
    const events = await page.events();
    assert.equal(events[0].visitor_id, "A".repeat(22));
    assert.equal(events[0].path, "/app/stats/:id");
    assert.equal(events[0].page_type, "app");
    assert.equal(events[1].visitor_id, undefined);
  });

  it("uses the test env for the ?test= parameter or when asked", async () => {
    const page = setupPage("https://shop.example.test/?test=secret-key");
    make().track("variant_selected", {});
    make({ env: "live" }).track("variant_selected", {});
    for (const tracker of trackers) tracker.flush();
    const events = await page.events();
    assert.deepEqual(events.map((e) => e.env).sort(), ["live", "test"]);
    assert.ok(!(await page.beacons()).some((b) => b.body.includes("secret-key")));
  });

  it("drops invalid events and only warns in debug mode", async () => {
    const page = setupPage();
    const warn = mock.method(console, "warn", () => {});
    const quiet = make();
    // @ts-expect-error missing required props
    quiet.track("product_view", {});
    quiet.track("add_to_cart", { qty: 1, value_minor: 1, currency: "PLN", ...{ email: "a@b.pl" } });
    quiet.track("coupon_applied", { coupon_id: "jan@example.com" });
    quiet.track("consent_updated" as never, {} as never);
    quiet.flush();
    assert.equal(warn.mock.callCount(), 0);

    const loud = make({ debug: true });
    // @ts-expect-error missing required props
    loud.track("product_view", {});
    assert.equal(warn.mock.callCount(), 1);

    const events = await page.events();
    assert.equal(events.length, 1, "only the add_to_cart survives, without the unknown prop");
    assert.deepEqual(events[0].props, { qty: 1, value_minor: 1, currency: "PLN" });
  });

  it("is a no-op for an invalid project key", async () => {
    const page = setupPage();
    const tracker = createTracker({ projectKey: "not a key!" });
    tracker.page("shop");
    tracker.flush();
    assert.equal((await page.events()).length, 0);
  });
});

describe("analytics tracker: sending", () => {
  it("flushes at 20 events", async () => {
    const page = setupPage();
    const tracker = make();
    for (let i = 0; i < 19; i++) tracker.track("variant_selected", {});
    assert.equal(page.pendingBeacons(), 0);
    tracker.track("variant_selected", {});
    assert.equal(page.pendingBeacons(), 1);
    const [beacon] = await page.beacons();
    assert.equal(beacon.parsed.events.length, 20);
    assert.equal(new Set(beacon.parsed.events.map((e) => e.event_id)).size, 20);
  });

  it("flushes 5 seconds after the first queued event", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const page = setupPage();
    const tracker = make();
    tracker.track("variant_selected", {});
    mock.timers.tick(4999);
    assert.equal(page.pendingBeacons(), 0);
    mock.timers.tick(1);
    assert.equal(page.pendingBeacons(), 1);
    tracker.track("variant_selected", {});
    mock.timers.tick(5000);
    assert.equal(page.pendingBeacons(), 2, "a new timer starts with the next event");
  });

  it("flushes on pagehide and when the page becomes hidden", async () => {
    const page = setupPage();
    const tracker = make();
    tracker.track("variant_selected", {});
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    assert.equal(page.pendingBeacons(), 1);

    tracker.track("variant_selected", {});
    page.win.document.dispatchEvent(new page.win.Event("visibilitychange"));
    assert.equal(page.pendingBeacons(), 1, "visible pages keep their queue");
    Object.defineProperty(page.win.document, "visibilityState", { value: "hidden", configurable: true });
    page.win.document.dispatchEvent(new page.win.Event("visibilitychange"));
    assert.equal(page.pendingBeacons(), 2);
    assert.equal((await page.events()).length, 2);
  });

  it("posts with fetch keepalive and no credentials, as text/plain", async () => {
    const page = setupPage();
    const tracker = make({ endpoint: "https://collect.example.test/" });
    tracker.track("variant_selected", {});
    tracker.flush();
    assert.equal(page.fetches.length, 1);
    const { url, init } = page.fetches[0];
    assert.equal(url, "https://collect.example.test/e");
    assert.equal(init.method, "POST");
    assert.equal(init.keepalive, true);
    assert.equal(init.credentials, "omit");
    assert.equal((init.headers as Record<string, string>)["Content-Type"], "text/plain");
    const body = JSON.parse(init.body as string);
    assert.equal(body.k, KEY);
    assert.equal(body.events.length, 1);
  });

  it("falls back to sendBeacon when fetch is not available", async () => {
    const page = setupPage();
    page.setFetchAvailable(false);
    const tracker = make({ endpoint: "https://collect.example.test/" });
    tracker.track("variant_selected", {});
    tracker.flush();
    const [beacon] = await page.beacons();
    assert.equal(beacon.url, "https://collect.example.test/e");
    assert.equal(beacon.type, "text/plain");
    assert.equal(beacon.parsed.events.length, 1);
  });

  /** Keeps the tracker's queue growing: consent is "loading" until `release()`. */
  function holdConsent(page: ReturnType<typeof setupPage>) {
    let release!: () => void;
    const ready = new Promise<null>((resolve) => (release = () => resolve(null)));
    (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = { get: () => null, ready };
    return async () => {
      release();
      await ready;
      await Promise.resolve();
    };
  }

  // 3-byte characters: 160 of them are 160 UTF-16 chars but 480 bytes.
  const WIDE_PATH = "/" + "€".repeat(160);

  it("caps each body at 32 KB of UTF-8 bytes, wrapper included, and keeps every event", async () => {
    const page = setupPage();
    const releaseConsent = holdConsent(page);
    const tracker = make();
    for (let i = 0; i < 120; i++) tracker.track("variant_selected", {}, { path: WIDE_PATH });
    await releaseConsent();
    tracker.flush();
    const sent = await page.beacons();
    assert.equal(sent.flatMap((b) => b.parsed.events).length, 120);
    for (const beacon of sent) {
      assert.ok(new TextEncoder().encode(beacon.body).length <= 32 * 1024);
      assert.ok(beacon.parsed.events.length <= 50);
    }
    assert.ok(
      sent.some((b) => b.body.length < new TextEncoder().encode(b.body).length),
      "the fixture really has multi-byte characters",
    );
  });

  it("on pagehide keeps only the newest bodies that fit the keepalive quota", () => {
    const events = Array.from({ length: 400 }, (_, i) => ({
      event_id: uuidv7(),
      event: "variant_selected",
      ts: Date.now(),
      path: WIDE_PATH,
      product_id: `p${i}`,
    })) as unknown as ClientEvent[];
    const all = packEvents(KEY, events);
    const leaving = packEvents(KEY, events, true);
    assert.ok(all.length > leaving.length && leaving.length >= 1);
    assert.ok(leaving.reduce((sum, b) => sum + b.bytes, 0) <= 60 * 1024);
    assert.equal(JSON.parse(leaving.at(-1)!.body).events.at(-1).product_id, "p399", "the newest event is kept");
    assert.notEqual(JSON.parse(leaving[0].body).events[0].product_id, "p0", "the oldest were dropped");
    for (const b of leaving) assert.equal(b.bytes, new TextEncoder().encode(b.body).length);
  });

  it("never throws into the host page", () => {
    const page = setupPage();
    (page.win.navigator as unknown as { sendBeacon: unknown }).sendBeacon = () => {
      throw new Error("boom");
    };
    globalThis.fetch = (() => {
      throw new Error("boom");
    }) as typeof fetch;
    const tracker = make({
      onEvent: () => {
        throw new Error("listener");
      },
    });
    assert.doesNotThrow(() => {
      tracker.track("variant_selected", {});
      tracker.track("nope" as never, null as never);
      tracker.page("shop");
      tracker.flush();
    });
  });

  it("is a no-op on the server", () => {
    teardownPage();
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
    const tracker = createTracker({ projectKey: KEY });
    assert.doesNotThrow(() => {
      tracker.page("shop");
      tracker.track("variant_selected", {});
      tracker.flush();
      tracker.setEnabled(true);
      tracker.onEvent(() => {})();
      tracker.destroy();
    });
  });
});

describe("analytics tracker: privacy", () => {
  it("sends nothing when disabled and drops the queue on setEnabled(false)", async () => {
    const page = setupPage();
    const off = make({ enabled: false });
    off.track("variant_selected", {});
    off.flush();
    assert.equal((await page.events()).length, 0);

    const on = make();
    on.track("variant_selected", {});
    on.setEnabled(false);
    on.flush();
    on.track("variant_selected", {});
    on.flush();
    assert.equal((await page.events()).length, 0);
    on.setEnabled(true);
    on.track("variant_selected", {});
    on.flush();
    assert.equal((await page.events()).length, 1);
  });

  it("honours Global Privacy Control and skips automated browsers", async () => {
    const page = setupPage();
    const seen: ClientEvent[] = [];
    const tracker = make({ onEvent: (e) => seen.push(e) });
    Object.defineProperty(page.win.navigator, "globalPrivacyControl", { value: true, configurable: true });
    tracker.track("variant_selected", {});
    tracker.flush();
    Object.defineProperty(page.win.navigator, "globalPrivacyControl", { value: false, configurable: true });
    Object.defineProperty(page.win.navigator, "webdriver", { value: true, configurable: true });
    tracker.track("variant_selected", {});
    tracker.flush();
    assert.equal((await page.events()).length, 0);
    assert.equal(seen.length, 0);
    Object.defineProperty(page.win.navigator, "webdriver", { value: false, configurable: true });
    tracker.track("variant_selected", {});
    tracker.flush();
    assert.equal((await page.events()).length, 1);
  });

  it("stops sending and drops its queue once the visitor rejects analytics", async () => {
    const page = setupPage();
    let choice: { c: { analytics: boolean } } | null = null;
    (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = { get: () => choice, ready: Promise.resolve(null) };
    const tracker = make();
    tracker.track("variant_selected", {});
    choice = { c: { analytics: false } };
    page.win.dispatchEvent(new page.win.CustomEvent("bitsnap:consent", { detail: { c: { analytics: false }, action: "reject_all" } }));
    tracker.flush();
    tracker.track("variant_selected", {});
    tracker.flush();
    assert.equal((await page.events()).length, 0);

    choice = { c: { analytics: true } };
    page.win.dispatchEvent(new page.win.CustomEvent("bitsnap:consent", { detail: { c: { analytics: true }, action: "accept_all" } }));
    tracker.track("variant_selected", {});
    tracker.flush();
    assert.equal((await page.events()).length, 1);
  });

  it("keeps tracking while no choice was made, and when analytics is accepted", async () => {
    const page = setupPage();
    (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = { get: () => null, ready: Promise.resolve(null) };
    const tracker = make();
    await Promise.resolve();
    tracker.track("variant_selected", {});
    tracker.flush();
    assert.equal((await page.events()).length, 1);
  });

  it("notices a consent banner that appears after the tracker started", async () => {
    const page = setupPage();
    const tracker = make();
    tracker.track("variant_selected", {});
    (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = {
      get: () => ({ c: { analytics: false } }),
      ready: Promise.resolve(null),
    };
    page.win.dispatchEvent(new page.win.Event("bitsnap:consent:ready"));
    tracker.flush();
    tracker.track("variant_selected", {});
    tracker.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal((await page.events()).length, 0);
  });

  it("holds events until the consent banner has loaded the stored choice", async () => {
    const page = setupPage();
    let release!: () => void;
    let choice: { c: { analytics: boolean } } | null = null;
    const ready = new Promise<null>((resolve) => (release = () => resolve(null)));
    (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = { get: () => choice, ready };
    const tracker = make();
    tracker.track("variant_selected", {});
    tracker.flush();
    assert.equal(page.pendingBeacons(), 0, "nothing leaves before the stored choice is known");

    choice = { c: { analytics: true } };
    release();
    await ready;
    await Promise.resolve();
    assert.equal(page.pendingBeacons(), 1, "the held events go out once consent is ready");
  });

  it("drops held events when the stored choice turns out to be a rejection", async () => {
    const page = setupPage();
    let release!: () => void;
    let choice: { c: { analytics: boolean } } | null = null;
    const ready = new Promise<null>((resolve) => (release = () => resolve(null)));
    (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = { get: () => choice, ready };
    const tracker = make();
    tracker.track("variant_selected", {});
    choice = { c: { analytics: false } };
    release();
    await ready;
    await Promise.resolve();
    tracker.flush();
    assert.equal((await page.events()).length, 0);
  });

  it("touches no cookies, Web Storage or IndexedDB", async () => {
    const page = setupPage();
    const touched: string[] = [];
    const proto = page.win.Storage.prototype as unknown as Record<string, unknown>;
    for (const name of ["getItem", "setItem", "removeItem", "clear", "key"]) {
      proto[name] = () => void touched.push(`Storage.${name}`);
    }
    const docProto = Object.getPrototypeOf(page.win.document) as Document;
    const cookie = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(docProto), "cookie") ??
      Object.getOwnPropertyDescriptor(docProto, "cookie");
    assert.ok(cookie, "jsdom exposes document.cookie");
    const owner = Object.getOwnPropertyDescriptor(docProto, "cookie") ? docProto : Object.getPrototypeOf(docProto);
    Object.defineProperty(owner, "cookie", {
      configurable: true,
      get() {
        touched.push("cookie.get");
        return "";
      },
      set() {
        touched.push("cookie.set");
      },
    });
    for (const name of ["localStorage", "sessionStorage", "indexedDB"]) {
      Object.defineProperty(page.win, name, {
        configurable: true,
        get() {
          touched.push(name);
          return undefined;
        },
      });
    }

    const tracker = make();
    tracker.page("product");
    tracker.track("variant_selected", {}, { product_id: "p1", variant_id: "v1" });
    tracker.flush();
    page.win.dispatchEvent(new page.win.Event("pagehide"));
    tracker.destroy();
    assert.equal((await page.events()).length, 2);
    assert.deepEqual(touched, []);
  });
});

describe("analytics tracker: onEvent", () => {
  it("passes each envelope to listeners before it is sent, until unsubscribed", async () => {
    const page = setupPage();
    const first: ClientEvent[] = [];
    const second: ClientEvent[] = [];
    const tracker = make({ onEvent: (e) => first.push(e) });
    const off = tracker.onEvent((e) => {
      assert.equal(page.pendingBeacons(), 0, "called before sending");
      second.push(e);
    });
    tracker.track("variant_selected", {}, { product_id: "p1" });
    off();
    tracker.track("variant_selected", {}, { product_id: "p2" });
    assert.equal(first.length, 2);
    assert.equal(second.length, 1);
    assert.equal(first[0].product_id, "p1");
    assert.deepEqual(validateEnvelope(first[0]), { ok: true });
    tracker.flush();
    assert.deepEqual((await page.events()).map((e) => e.event_id), first.map((e) => e.event_id));
  });
});

describe("analytics tracker: onEvent and consent", () => {
  function consentWithReady(page: ReturnType<typeof setupPage>) {
    let release!: () => void;
    let choice: { c: { analytics: boolean } } | null = null;
    const ready = new Promise<null>((resolve) => (release = () => resolve(null)));
    (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = { get: () => choice, ready };
    return {
      async resolve(value: { c: { analytics: boolean } } | null) {
        choice = value;
        release();
        await ready;
        await Promise.resolve();
      },
    };
  }

  it("holds listener calls until consent is ready, then delivers them", async () => {
    const page = setupPage();
    const consent = consentWithReady(page);
    const seen: ClientEvent[] = [];
    const tracker = make({ onEvent: (e) => seen.push(e) });
    tracker.track("variant_selected", {});
    assert.equal(seen.length, 0, "consent is still loading");
    await consent.resolve(null);
    assert.equal(seen.length, 1);
    tracker.track("variant_selected", {});
    assert.equal(seen.length, 2, "afterwards listeners run at once");
  });

  it("never calls listeners for events held while consent turns out to be a rejection", async () => {
    const page = setupPage();
    const consent = consentWithReady(page);
    const seen: ClientEvent[] = [];
    const tracker = make({ onEvent: (e) => seen.push(e) });
    tracker.track("variant_selected", {});
    await consent.resolve({ c: { analytics: false } });
    assert.equal(seen.length, 0);
    tracker.track("variant_selected", {});
    assert.equal(seen.length, 0, "denied tracking emits nothing");
  });
});

describe("analytics tracker: real consent controller", () => {
  const consents: BitsnapConsentApi[] = [];
  const consentConfig = {
    version: 1,
    categories: { analytics: true, marketing: false, preferences: false },
  };
  afterEach(() => consents.splice(0).forEach((api) => api.destroy()));

  function attach(page: ReturnType<typeof setupPage>, options: Parameters<typeof createConsent>[0] = {}) {
    const api = createConsent({ locale: "en", config: consentConfig, ...options });
    consents.push(api);
    (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = api;
    return api;
  }

  it("sends nothing when a rejection queued before ready is committed after the tracker attached", async () => {
    const page = setupPage();
    const api = attach(page);
    const seen: ClientEvent[] = [];
    const tracker = make({ onEvent: (e) => seen.push(e) });
    tracker.track("variant_selected", {}); // attaches to the consent API and is held
    api.rejectAll(); // the merchant's own consent tool, before ready
    await api.ready;
    await new Promise((resolve) => setTimeout(resolve, 0));
    tracker.flush();
    assert.equal(seen.length, 0, "listeners never saw an event of a visitor who refused");
    assert.equal(page.pendingBeacons(), 0);
    assert.equal((await page.events()).length, 0);
  });

  it("does not track a visitor who refused analytics on an older banner until they answer again", async () => {
    const page = setupPage();
    const old = { id: "abc", ts: 1, bv: 1, c: { analytics: false, marketing: false, preferences: false } };
    page.win.document.cookie = `bitsnap_consent=${encodeState(old)}; Path=/`;
    const api = attach(page, { config: { ...consentConfig, version: 2 } });
    const seen: ClientEvent[] = [];
    const tracker = make({ onEvent: (e) => seen.push(e) });
    await api.ready;
    assert.equal(api.get(), null);
    tracker.track("variant_selected", {});
    tracker.flush();
    assert.equal(seen.length, 0);
    assert.equal(page.pendingBeacons(), 0);

    api.acceptAll(); // a fresh answer on the new banner
    tracker.track("variant_selected", {});
    assert.equal(seen.length, 1);
  });
});

describe("analytics tracker: event_id", () => {
  it("uses a valid deterministic UUIDv7 from the extra and ignores an invalid one", async () => {
    const page = setupPage();
    const tracker = make();
    const id = uuidv7(1_700_000_000_000);
    tracker.track("variant_selected", {}, { event_id: id });
    tracker.track("variant_selected", {}, { event_id: "not-a-uuid" });
    tracker.flush();
    const [first, second] = await page.events();
    assert.equal(first.event_id, id);
    assert.deepEqual(validateEnvelope(first), { ok: true });
    assert.notEqual(second.event_id, "not-a-uuid");
    assert.deepEqual(validateEnvelope(second), { ok: true });
  });
});

describe("analytics tracker: singleton", () => {
  it("does not remember a malformed key, so a later valid call still starts tracking", () => {
    setupPage();
    const bad = initTracker({ projectKey: "not a key!" });
    assert.equal(getTracker(), undefined);
    const good = initTracker({ projectKey: KEY });
    assert.notStrictEqual(good, bad);
    assert.strictEqual(getTracker(), good);
  });

  it("applies env and endpoint of a later call to the running tracker and warns on another key in debug mode", async () => {
    const page = setupPage();
    const a = initTracker({ projectKey: KEY });
    const warn = mock.method(console, "warn", () => {});
    assert.strictEqual(initTracker({ projectKey: "Other1", debug: true }), a);
    assert.equal(warn.mock.callCount(), 1);
    assert.strictEqual(initTracker({ projectKey: KEY, env: "test", endpoint: "https://collect.example.test" }), a);
    a.track("variant_selected", {});
    a.flush();
    const [beacon] = await page.beacons();
    assert.equal(beacon.url, "https://collect.example.test/e");
    assert.equal(beacon.parsed.events[0].env, "test");
  });

  it("applies enabled of a later call to the running tracker", async () => {
    const page = setupPage();
    const a = initTracker({ projectKey: KEY });
    assert.strictEqual(initTracker({ projectKey: KEY, enabled: false }), a);
    a.track("variant_selected", {});
    a.flush();
    assert.equal(page.pendingBeacons(), 0, "opted out before the first event");
    initTracker({ projectKey: KEY, enabled: true });
    a.track("variant_selected", {});
    a.flush();
    assert.equal(page.pendingBeacons(), 1);
  });

  it("returns the existing tracker when initialised twice", () => {
    setupPage();
    assert.equal(getTracker(), undefined);
    const a = initTracker({ projectKey: KEY });
    const b = initTracker({ projectKey: "Other1" });
    assert.strictEqual(a, b);
    assert.strictEqual(getTracker(), a);
    resetTracker();
    assert.notStrictEqual(initTracker({ projectKey: KEY }), a);
  });
});
