import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { createTracker, initTracker, resetTracker, visitorHeaders, type Tracker } from "./core.ts";
import { clientIdCookieName, validateEnvelope } from "./contract.ts";
import { newVisitorId, readVisitorId } from "./visitor.ts";
import { createConsent } from "../consent/core/controller.ts";
import type { BitsnapConsentApi } from "../consent/core/types.ts";
import { setupPage, teardownPage } from "./testing.ts";

const KEY = "Ab12Cd";
const COOKIE = clientIdCookieName(KEY);
const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const trackers: Tracker[] = [];

type Page = ReturnType<typeof setupPage>;

function make(options: Partial<Parameters<typeof createTracker>[0]> = {}) {
  const tracker = createTracker({ projectKey: KEY, ...options });
  trackers.push(tracker);
  return tracker;
}

/** A stand-in for window.BitsnapConsent whose choice the test changes. */
function fakeConsent(
  page: Page,
  analytics: boolean | null,
  ready: Promise<unknown> | undefined = Promise.resolve(),
  banner: { scope?: "global" | "project"; projectKey?: string | null } = { scope: "global", projectKey: null },
) {
  const choice: { analytics: boolean | null } = { analytics };
  (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = {
    ...banner,
    get: () => (choice.analytics === null ? null : { c: { analytics: choice.analytics } }),
    denied: () => choice.analytics === false,
    ready,
  };
  return {
    set(value: boolean | null) {
      choice.analytics = value;
      page.win.dispatchEvent(new page.win.CustomEvent("bitsnap:consent"));
    },
  };
}

function cookies(page: Page, url = page.win.location.href) {
  return page.dom.cookieJar.getCookiesSync(url).filter((cookie) => cookie.key === COOKIE);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  trackers.splice(0).forEach((t) => t.destroy());
  resetTracker();
  mock.timers.reset();
  mock.restoreAll();
  teardownPage();
});

describe("bs_vid cookie", () => {
  it("makes 22-character base64url ids", () => {
    const ids = new Set(Array.from({ length: 200 }, newVisitorId));
    assert.equal(ids.size, 200);
    for (const id of ids) assert.match(id, ID_RE);
  });

  it("is set with the documented attributes once analytics is granted", async () => {
    const page = setupPage("https://shop.example.test/products");
    fakeConsent(page, true);
    make();
    await settle();
    const [cookie] = cookies(page);
    assert.ok(cookie, "cookie set");
    assert.match(cookie.value, ID_RE);
    assert.equal(cookie.path, "/");
    assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.secure, true);
    assert.equal(cookie.maxAge, 390 * 24 * 60 * 60);
    // The widest domain the browser accepts: example.test, not the host and not the bare "test".
    assert.equal(cookie.domain, "example.test");
    assert.equal(cookie.hostOnly, false);
  });

  it("is host-only on localhost and has no Secure flag on http", async () => {
    const page = setupPage("http://localhost:3000/");
    fakeConsent(page, true);
    make();
    await settle();
    const [cookie] = cookies(page);
    assert.ok(cookie);
    assert.equal(cookie.hostOnly, true);
    assert.equal(cookie.secure, false);
  });

  it("is set when the choice arrives later, and not before", async () => {
    const page = setupPage();
    const consent = fakeConsent(page, null);
    make();
    await settle();
    assert.equal(cookies(page).length, 0);
    consent.set(true);
    assert.equal(cookies(page).length, 1);
  });

  it("is not set without Bitsnap Consent on the page", async () => {
    const page = setupPage();
    const tracker = make();
    tracker.page();
    tracker.flush();
    await settle();
    assert.equal(cookies(page).length, 0);
    assert.equal(page.win.document.cookie, "");
  });

  it("is not set for a refusal, while the stored choice loads, or with Global Privacy Control", async () => {
    const refused = setupPage();
    fakeConsent(refused, false);
    make();
    await settle();
    assert.equal(cookies(refused).length, 0);
    teardownPage();

    const loading = setupPage();
    fakeConsent(loading, true, new Promise(() => {}));
    (loading.win as unknown as { BitsnapConsent: { get: () => unknown } }).BitsnapConsent.get = () => null;
    make();
    await settle();
    assert.equal(cookies(loading).length, 0);
    teardownPage();

    const gpc = setupPage();
    Object.defineProperty(gpc.win.navigator, "globalPrivacyControl", { value: true });
    fakeConsent(gpc, true);
    make();
    await settle();
    assert.equal(cookies(gpc).length, 0);
  });

  it("keeps its value and expiry on later visits", async () => {
    const page = setupPage();
    fakeConsent(page, true);
    make();
    await settle();
    const [first] = cookies(page);
    const created = first.creation!.getTime();
    const later = make();
    later.page();
    later.flush();
    await settle();
    const [again] = cookies(page);
    assert.equal(again.value, first.value);
    assert.equal(again.creation!.getTime(), created);
    assert.equal(again.maxAge, 390 * 24 * 60 * 60);
    assert.ok(first.expiryTime(first.creation!) - created <= 390 * DAY_MS);
  });

  it("is deleted on every domain variant when analytics is denied", async () => {
    const page = setupPage("https://app.shop.example.test/");
    const consent = fakeConsent(page, true);
    make();
    await settle();
    // Variants an older release or a merchant script may have left behind.
    page.win.document.cookie = `${COOKIE}=aaaaaaaaaaaaaaaaaaaaaa; Path=/`;
    page.win.document.cookie = `${COOKIE}=bbbbbbbbbbbbbbbbbbbbbb; Path=/; Domain=shop.example.test`;
    assert.ok(cookies(page).length >= 2);
    consent.set(false);
    assert.equal(cookies(page).length, 0);
    assert.doesNotMatch(page.win.document.cookie, /bs_vid_/);
  });

  it("is deleted when the stored choice is gone after loading", async () => {
    const page = setupPage();
    const consent = fakeConsent(page, true);
    make();
    await settle();
    assert.equal(cookies(page).length, 1);
    consent.set(null);
    assert.equal(cookies(page).length, 0);
  });

  it("is kept while the stored choice is still loading, so the id does not rotate", async () => {
    const page = setupPage();
    page.win.document.cookie = `${COOKIE}=cccccccccccccccccccccc; Path=/`;
    fakeConsent(page, null, new Promise(() => {}));
    make();
    await settle();
    assert.equal(cookies(page)[0]?.value, "cccccccccccccccccccccc");
  });

  it("follows the real consent controller: accept sets it, withdraw deletes it", async () => {
    const page = setupPage();
    const consent: BitsnapConsentApi = createConsent({ categories: { analytics: true, marketing: false, preferences: false } });
    (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = consent;
    make();
    await consent.ready;
    await settle();
    assert.equal(cookies(page).length, 0, "no choice yet");
    consent.acceptAll();
    assert.equal(cookies(page).length, 1);
    consent.rejectAll();
    assert.equal(cookies(page).length, 0);
    consent.acceptAll();
    assert.equal(cookies(page).length, 1);
    consent.reset();
    assert.equal(cookies(page).length, 0);
    consent.destroy();
  });
});

describe("bs_vid cookie scope", () => {
  const jarSize = (page: Page) => page.dom.cookieJar.serializeSync().cookies?.length ?? 0;

  it("takes the registrable domain under a multi-label public suffix", async () => {
    const page = setupPage("https://shop.example.co.uk/");
    fakeConsent(page, true);
    make();
    await settle();
    const [cookie] = cookies(page);
    assert.equal(cookie.domain, "example.co.uk");
    assert.equal(cookie.hostOnly, false);
    // Neither the rejected suffix nor a sibling site sees it, and nothing else was left behind.
    assert.equal(jarSize(page), 1);
    assert.equal(page.dom.cookieJar.getCookiesSync("https://co.uk/").length, 0);
    assert.equal(page.dom.cookieJar.getCookiesSync("https://other.co.uk/").length, 0);
  });

  it("stays out of a shared hosting suffix such as github.io", async () => {
    const page = setupPage("https://foo.github.io/");
    fakeConsent(page, true);
    make();
    await settle();
    const [cookie] = cookies(page);
    assert.ok(cookie, "cookie set");
    // github.io is refused; the site's own host is the widest that sticks.
    assert.equal(cookie.domain, "foo.github.io");
    assert.equal(jarSize(page), 1);
    assert.equal(page.dom.cookieJar.getCookiesSync("https://github.io/").length, 0);
    assert.equal(page.dom.cookieJar.getCookiesSync("https://bar.github.io/").length, 0);
  });

  for (const url of ["http://127.0.0.1:3000/", "http://[::1]:3000/", "http://localhost:3000/"]) {
    it(`is host-only on ${url}`, async () => {
      const page = setupPage(url);
      fakeConsent(page, true);
      make();
      await settle();
      const [cookie] = cookies(page);
      assert.ok(cookie, "cookie set");
      assert.equal(cookie.hostOnly, true);
      assert.equal(jarSize(page), 1);
    });
  }

  it("is deleted on https with the Secure flag, on the host and every parent domain", async () => {
    const page = setupPage("https://app.shop.example.test/");
    const consent = fakeConsent(page, true);
    make();
    await settle();
    page.win.document.cookie = `${COOKIE}=aaaaaaaaaaaaaaaaaaaaaa; Path=/; Secure`;
    page.win.document.cookie = `${COOKIE}=bbbbbbbbbbbbbbbbbbbbbb; Path=/; Secure; Domain=shop.example.test`;
    page.win.document.cookie = `${COOKIE}=cccccccccccccccccccccc; Path=/; Secure; Domain=example.test`;
    assert.ok(cookies(page).length >= 3);
    consent.set(false);
    assert.equal(cookies(page).length, 0);
  });

  it("is deleted even when its value is malformed", async () => {
    const page = setupPage("https://shop.example.test/");
    const consent = fakeConsent(page, true);
    make();
    await settle();
    page.win.document.cookie = `${COOKIE}=not-a-valid-id; Path=/`;
    consent.set(false);
    assert.equal(cookies(page).length, 0);
  });

  it("belongs to one project: another project's consent neither reads nor deletes it", async () => {
    const page = setupPage("https://shop.example.test/");
    const other = clientIdCookieName("OtherKey");
    page.win.document.cookie = `${other}=zzzzzzzzzzzzzzzzzzzzzz; Path=/`;
    const consent = fakeConsent(page, true);
    const tracker = make();
    await settle();
    assert.match(cookies(page)[0].value, ID_RE);
    assert.notEqual(cookies(page)[0].value, "zzzzzzzzzzzzzzzzzzzzzz");
    tracker.page();
    tracker.flush();
    assert.ok((await page.events()).every((event) => event.client_id !== "zzzzzzzzzzzzzzzzzzzzzz"));
    consent.set(false);
    assert.equal(cookies(page).length, 0);
    assert.match(page.win.document.cookie, new RegExp(`${other}=zzzzzzzzzzzzzzzzzzzzzz`));
  });
});

describe("client_id", () => {
  it("is on every event while analytics is granted and the cookie exists", async () => {
    const page = setupPage();
    fakeConsent(page, true);
    const tracker = make();
    tracker.page();
    tracker.track("cart_opened", { item_count: 1, value_minor: 100, currency: "PLN" });
    tracker.flush();
    await settle();
    const events = await page.events();
    assert.equal(events.length, 2);
    const id = cookies(page)[0].value;
    for (const event of events) {
      assert.equal(event.client_id, id);
      assert.deepEqual(validateEnvelope(event), { ok: true });
    }
  });

  it("reaches events held until the stored choice loaded", async () => {
    const page = setupPage();
    let release!: () => void;
    const ready = new Promise<void>((resolve) => (release = resolve));
    fakeConsent(page, null, ready);
    const tracker = make();
    tracker.page();
    tracker.flush();
    assert.equal((await page.events()).length, 0);
    const consent = (page.win as unknown as { BitsnapConsent: { get: () => unknown } }).BitsnapConsent;
    consent.get = () => ({ c: { analytics: true } });
    release();
    await settle();
    page.win.dispatchEvent(new page.win.CustomEvent("bitsnap:consent:ready"));
    const [event] = await page.events();
    assert.equal(event.event, "page_view");
    assert.match(event.client_id!, ID_RE);
    assert.equal(event.client_id, cookies(page)[0].value);
  });

  it("is omitted without a banner, after a refusal and with Global Privacy Control", async () => {
    const none = setupPage();
    const plain = make();
    plain.page();
    plain.flush();
    assert.equal((await none.events())[0].client_id, undefined);
    assert.ok(!("client_id" in (await none.events())[0]));
    teardownPage();

    const refused = setupPage();
    const consent = fakeConsent(refused, null);
    const tracker = make();
    consent.set(false);
    tracker.page();
    tracker.flush();
    // A refusal sends nothing at all.
    assert.deepEqual(await refused.events(), []);
  });

  it("is omitted once consent is withdrawn, and the cookie is gone", async () => {
    const page = setupPage();
    const consent = fakeConsent(page, true);
    const tracker = make();
    await settle();
    tracker.page();
    tracker.flush();
    const [before] = await page.events();
    assert.match(before.client_id!, ID_RE);

    // A reset leaves no choice: the tracker may still run, but without an id.
    consent.set(null);
    tracker.page();
    tracker.flush();
    const events = await page.events();
    assert.equal(events.length, 2);
    assert.ok(!("client_id" in events[1]));
  });

  it("is not shown to the onEvent listener", async () => {
    const page = setupPage();
    fakeConsent(page, true);
    const seen: unknown[] = [];
    const tracker = make({ onEvent: (event) => seen.push(event) });
    await settle();
    tracker.page();
    tracker.flush();
    const [sent] = await page.events();
    assert.ok(sent.client_id);
    assert.ok(seen.length > 0);
    assert.ok(seen.every((event) => !("client_id" in (event as object))));
  });
});

describe("X-Bitsnap-Visitor header", () => {
  it("is built from the same condition as client_id", async () => {
    const page = setupPage();
    const consent = fakeConsent(page, true);
    assert.deepEqual(visitorHeaders(KEY), {}, "no cookie yet");
    make();
    await settle();
    const id = cookies(page)[0].value;
    assert.deepEqual(visitorHeaders(KEY), { "X-Bitsnap-Visitor": id });
    assert.equal(readVisitorId(page.win as unknown as Window, KEY), id);
    consent.set(false);
    assert.deepEqual(visitorHeaders(KEY), {});
  });

  it("is empty with a leftover cookie but no granted consent, and on the server", async () => {
    const page = setupPage();
    page.win.document.cookie = `${COOKIE}=dddddddddddddddddddddd; Path=/`;
    assert.deepEqual(visitorHeaders(KEY), {});
    fakeConsent(page, null);
    assert.deepEqual(visitorHeaders(KEY), {});
    teardownPage();
    assert.deepEqual(visitorHeaders(KEY), {});
  });

  it("is empty when the tracker is disabled", async () => {
    const page = setupPage();
    fakeConsent(page, true);
    const tracker = initTracker({ projectKey: KEY });
    await settle();
    const id = cookies(page)[0].value;
    assert.deepEqual(visitorHeaders(KEY), { "X-Bitsnap-Visitor": id });
    assert.deepEqual(visitorHeaders(), { "X-Bitsnap-Visitor": id }, "the running tracker's project");
    assert.deepEqual(visitorHeaders("OtherKey"), {}, "another project");
    tracker.setEnabled(false);
    assert.deepEqual(visitorHeaders(KEY), {});
    initTracker({ projectKey: KEY, enabled: true });
    assert.deepEqual(visitorHeaders(KEY), { "X-Bitsnap-Visitor": id });
    initTracker({ projectKey: KEY, enabled: false });
    assert.deepEqual(visitorHeaders(KEY), {});
  });

  it("is empty in an automated browser and with Global Privacy Control", async () => {
    const page = setupPage();
    fakeConsent(page, true);
    page.win.document.cookie = `${COOKIE}=eeeeeeeeeeeeeeeeeeeeee; Path=/`;
    assert.deepEqual(visitorHeaders(KEY), { "X-Bitsnap-Visitor": "eeeeeeeeeeeeeeeeeeeeee" }, "no tracker, cookie of the script");
    Object.defineProperty(page.win.navigator, "webdriver", { value: true, configurable: true });
    assert.deepEqual(visitorHeaders(KEY), {});
    initTracker({ projectKey: KEY });
    assert.deepEqual(visitorHeaders(KEY), {});
    teardownPage();

    const gpc = setupPage();
    fakeConsent(gpc, true);
    gpc.win.document.cookie = `${COOKIE}=eeeeeeeeeeeeeeeeeeeeee; Path=/`;
    Object.defineProperty(gpc.win.navigator, "globalPrivacyControl", { value: true });
    assert.deepEqual(visitorHeaders(KEY), {});
  });
});

describe("whose consent counts", () => {
  const send = async (page: Page) => {
    const tracker = make();
    tracker.page();
    tracker.flush();
    await settle();
    return { tracker, events: await page.events(), header: visitorHeaders(KEY) };
  };
  const stored = (page: Page) => cookies(page).length;

  it("ignores a project-scope banner of another project: no cookie, client_id or header", async () => {
    const page = setupPage("https://shop.example.test/");
    fakeConsent(page, true, Promise.resolve(), { scope: "project", projectKey: "Other1" });
    const { events, header } = await send(page);
    assert.equal(stored(page), 0);
    assert.equal(events[0]?.client_id, undefined);
    assert.deepEqual(header, {});
  });

  it("does not delete the cookie when a banner of another project withdraws", async () => {
    const page = setupPage("https://shop.example.test/");
    const consent = fakeConsent(page, true, Promise.resolve(), { scope: "project", projectKey: KEY });
    make();
    await settle();
    assert.equal(stored(page), 1);
    // Another project's banner takes over the page and its choice is withdrawn.
    const other = fakeConsent(page, true, Promise.resolve(), { scope: "project", projectKey: "Other1" });
    other.set(false);
    assert.equal(stored(page), 1);
    void consent;
  });

  it("counts a project-scope banner of the same project", async () => {
    const page = setupPage("https://shop.example.test/");
    const consent = fakeConsent(page, true, Promise.resolve(), { scope: "project", projectKey: KEY });
    const { events, header } = await send(page);
    assert.equal(stored(page), 1);
    assert.match(events[0]?.client_id ?? "", ID_RE);
    assert.equal(header["X-Bitsnap-Visitor"], cookies(page)[0].value);
    consent.set(false);
    assert.equal(stored(page), 0);
  });

  it("counts a site-scope banner on a merchant's own site", async () => {
    const page = setupPage("https://shop.example.test/");
    fakeConsent(page, true, Promise.resolve(), { scope: "global", projectKey: "Other1" });
    const { events } = await send(page);
    assert.equal(stored(page), 1);
    assert.match(events[0]?.client_id ?? "", ID_RE);
  });

  for (const url of ["https://bitsnap.pl/shop/x", "https://store.bitsnap.pl/"]) {
    it(`does not count a site-scope banner on ${url}`, async () => {
      const page = setupPage(url);
      const consent = fakeConsent(page, true, Promise.resolve(), { scope: "global", projectKey: null });
      const { events, header } = await send(page);
      assert.equal(stored(page), 0);
      assert.equal(events[0]?.client_id, undefined);
      assert.deepEqual(header, {});
      consent.set(false);
      assert.equal(stored(page), 0);
    });

    it(`counts a project-scope banner of the project on ${url}`, async () => {
      const page = setupPage(url);
      fakeConsent(page, true, Promise.resolve(), { scope: "project", projectKey: KEY });
      await send(page);
      assert.equal(stored(page), 1);
    });
  }

  it("never counts a consent script that reports no scope", async () => {
    const page = setupPage("https://shop.example.test/");
    (page.win as unknown as { BitsnapConsent: unknown }).BitsnapConsent = {
      get: () => ({ c: { analytics: true } }),
      ready: Promise.resolve(),
    };
    const { events, header } = await send(page);
    assert.equal(stored(page), 0);
    assert.equal(events[0]?.client_id, undefined);
    assert.deepEqual(header, {});
  });
});
