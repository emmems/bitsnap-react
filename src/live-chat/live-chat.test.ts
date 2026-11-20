import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { createVisitorChatClient } from "../chat/client";
import { ensure, contrastRatio } from "../consent/core/contrast";
import { DEFAULT_TEXTS } from "../consent/core/texts";
import { panelEmailKey, panelSessionKey } from "../panel/session-storage";
import { init, originAllowed } from "./loader";
import { mount, mountHostedPage } from "./panel";
import { PROTOCOL, type ChatConfig, type PanelOptions } from "./protocol";

const config: ChatConfig = {
  enabled: true, projectId: "18", chatUrl: "https://chat.bitsnap.pl", challengeOrigin: "https://bitsnap.pl",
  captchaContext: "live_chat_demo", texts: { shopName: "Sklep", greeting: "<em>Witaj!</em>" },
  look: { theme: "auto", accent: "#a3462a", position: "bottom-right" },
  origins: ["https://shop.test"], limits: { messageMax: 1000 },
};
const record = { token: "bvis_mock", expiresAt: Math.floor(Date.now() / 1000) + 600 };
const next = () => new Promise((resolve) => setTimeout(resolve, 10));

function setup(t: { after(fn: () => void): void }) {
  const dom = new JSDOM("<!doctype html><html lang=pl><body></body></html>", { url: "https://shop.test/p?tracking=a" });
  const browser = dom.window;
  browser.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
  Object.defineProperty(browser.document, "visibilityState", { value: "visible" });
  const globals = {
    window: browser, document: browser.document, location: browser.location, localStorage: browser.localStorage,
    AbortController: browser.AbortController, requestAnimationFrame: (fn: () => void) => fn(),
  };
  const restorers = Object.entries(globals).map(([key, value]) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value, writable: true });
    return () => previous ? Object.defineProperty(globalThis, key, previous) : Reflect.deleteProperty(globalThis, key);
  });
  const oldFetch = globalThis.fetch;
  t.after(() => { browser.close(); restorers.forEach((restore) => restore()); globalThis.fetch = oldFetch; });
  return browser;
}

test("loader gates config, loads a matching protocol once and supports offline preview", async (t) => {
  const win = setup(t);
  const script = document.createElement("script");
  script.src = "https://bitsnap.pl/embed/v1/bitsnap-chat.js";
  script.dataset.project = "demo";
  script.dataset.preview = "";
  const inline = document.createElement("script");
  inline.dataset.bitsnapChatConfig = "";
  inline.type = "application/json";
  inline.textContent = JSON.stringify(config);
  document.body.append(inline);
  let fetches = 0;
  globalThis.fetch = async () => { fetches++; throw Error("preview must be local"); };
  init(script);
  const api = window.BitsnapChat!;
  init(script);
  assert.equal(window.BitsnapChat, api);
  const opening = api.open();
  await next();
  assert.equal(document.querySelector<HTMLScriptElement>("head script")?.src,
    "https://bitsnap.pl/embed/v1/bitsnap-chat-panel.js?v=" + api.version);
  window.BitsnapChatPanel = { protocol: 9, mount: () => assert.fail("unsupported protocol") };
  document.querySelector("head script")!.dispatchEvent(new win.Event("load"));
  await opening;
  const root = document.querySelector("bitsnap-chat")!.shadowRoot!;
  assert.match(root.querySelector(".loader-status")!.textContent!, /Odśwież/);
  assert.equal(fetches, 0);
  assert.ok(originAllowed("https://a.shop.test", ["https://*.shop.test"]));
  assert.ok(!originAllowed("https://shop.test", ["https://*.shop.test"]));
  assert.ok(!originAllowed("https://fake-shop.test", ["https://*.shop.test"]));
  assert.ok(originAllowed("https://a.shop.test:8443", ["https://*.shop.test:8443"]));
  assert.ok(!originAllowed("https://a.shop.test", ["https://*.shop.test:8443"]));
  assert.equal((root.host as HTMLElement).style.position, "static");
});

test("visitor client handles a null thread without messages", async () => {
  const client = createVisitorChatClient({ token: record.token, projectId: "18", fetch: async (url, init) => {
    assert.match(String(url), /\/v1\/visitor\/thread.*peek=1/);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer " + record.token);
    return Response.json({ thread: null, limits: { max_runes: 700 } });
  } });
  assert.deepEqual(await client.getVisitorThread(true), { thread: null, messages: [], hasMore: false, messageMax: 700 });
});

test("first send waits for correctly bound Turnstile, then offers and saves email", async (t) => {
  let close = () => {};
  t.after(() => close());
  const win = setup(t);
  const root = document.body.appendChild(document.createElement("div")).attachShadow({ mode: "open" });
  const target = root.appendChild(document.createElement("div"));
  const options: PanelOptions = {
    protocol: PROTOCOL, root, target, config, projectKey: "demo", locale: "pl", apiOrigin: "https://bitsnap.pl",
    close() {}, clearBadge() {},
  };
  assert.equal(mount({ ...options, protocol: 0 }), undefined);
  const requests: { path: string; body?: Record<string, unknown>; token: string | null }[] = [];
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ path, body, token: new Headers(init?.headers).get("Authorization") });
    if (path.endsWith("/identify")) return Response.json({ ...record, token: "bvis_identified", identity: { email: body.email, verified: false } });
    if (path.endsWith("/sessions")) return Response.json({ ...record, identity: null }, { status: 201 });
    if (path.endsWith("/messages")) return Response.json({ message: { id: "m1", body: body.body, status: "pending" } }, { status: 202 });
    return Response.json({ thread: { id: "thread", composer_locked: false }, messages: [{ id: "m1", body: "Hej", author_email: "visitor" }], has_more: false });
  };
  const panel = mount(options)!;
  close = panel.close;
  panel.open();
  assert.equal(target.querySelector(".bubble")?.textContent, "<em>Witaj!</em>");
  assert.equal(target.querySelector(".bubble em"), null);
  const field = target.querySelector("textarea")!;
  field.value = "Hej";
  field.dispatchEvent(new win.Event("input", { bubbles: true }));
  assert.equal(target.querySelector("iframe"), null);
  assert.equal(requests.length, 0);
  target.querySelector<HTMLButtonElement>(".composer button")!.click();
  const frame = target.querySelector("iframe")!;
  assert.ok(frame);
  assert.equal(field.value, "Hej");
  const attempt = new URL(frame.src).searchParams.get("attempt");
  assert.match(attempt!, /^[a-f0-9]{16}$/);
  function deliver(data: Record<string, unknown>) {
    window.dispatchEvent(new win.MessageEvent("message", {
      source: frame.contentWindow, origin: config.challengeOrigin,
      data: { type: "bitsnap:turnstile", action: "live_chat_start", attempt, formContext: config.captchaContext, ...data },
    }));
  }
  deliver({ token: "wrong", attempt: "wrong" });
  assert.equal(requests.length, 0);
  deliver({ interactive: true });
  assert.ok(target.querySelector(".captcha.interactive"));
  deliver({ token: "proof" });
  await next();
  assert.equal(target.querySelector("iframe"), null);
  assert.equal(requests[0].path, "/api/live-chat/v1/demo/sessions");
  assert.deepEqual(requests[0].body, { captchaToken: "proof", attempt, locale: "pl" });
  assert.equal(requests[1].token, "Bearer bvis_mock");
  assert.match(String(requests[1].body?.client_id), /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/);
  assert.deepEqual(Object.keys(requests[1].body!).sort(), ["body", "client_id", "page_url"]);
  assert.equal(requests[1].body?.page_url, "https://shop.test/p");
  assert.equal(target.querySelector<HTMLElement>(".email-card")!.hidden, false);
  target.querySelector<HTMLButtonElement>(".skip")!.click();
  assert.equal(target.querySelector<HTMLElement>(".email-card")!.hidden, true);
  target.querySelector<HTMLButtonElement>(".add")!.click();
  target.querySelector<HTMLInputElement>("#bchat-email")!.value = "TEST@example.test";
  target.querySelector<HTMLButtonElement>(".email-card button")!.click();
  await next();
  assert.deepEqual(requests[2].body, { email: "test@example.test" });
  assert.equal(requests[3].token, "Bearer bvis_identified");
  assert.match(target.querySelector(".identity")!.textContent!, /test@example.test/);
});

test("buyer display comes from the panel and an anonymous conversation upgrades before send", async (t) => {
  let close = () => {};
  t.after(() => close());
  setup(t);
  localStorage.setItem("bitsnap-chat:demo", JSON.stringify(record));
  localStorage.setItem(panelSessionKey("demo", config.challengeOrigin), "panel_login");
  localStorage.setItem(panelEmailKey("demo", config.challengeOrigin), "buyer@example.test");
  const root = document.body.appendChild(document.createElement("div")).attachShadow({ mode: "open" });
  const target = root.appendChild(document.createElement("div"));
  const calls: { path: string; body: Record<string, unknown> | null; auth: string | null }[] = [];
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get("Authorization") });
    if (path.endsWith("/identify")) return Response.json({ ...record, token: "bvis_upgraded", identity: { email: "buyer@example.test", verified: true } });
    if (path.endsWith("/messages")) return Response.json({ message: { id: "mine" } }, { status: 202 });
    return Response.json({ thread: { id: "th", composer_locked: false }, messages: [], has_more: false });
  };
  const panel = mount({ protocol: PROTOCOL, root, target, config, locale: "pl", projectKey: "demo", apiOrigin: config.challengeOrigin, close() {}, clearBadge() {} })!;
  close = panel.close;
  panel.open();
  await next();
  assert.match(target.querySelector(".identity")!.textContent!, /Piszesz jako buyer@example.test/);
  assert.equal(calls.length, 1);
  const field = target.querySelector("textarea")!;
  field.value = "Hej";
  field.dispatchEvent(new window.Event("input", { bubbles: true }));
  target.querySelector<HTMLButtonElement>(".composer button")!.click();
  await next();
  assert.deepEqual(calls.find(({ path }) => path.endsWith("/identify"))?.body, { panelToken: "panel_login" });
  assert.equal(calls.find(({ path }) => path.endsWith("/messages"))?.auth, "Bearer bvis_upgraded");
  assert.ok(calls.filter(({ path }) => path.startsWith("/v1/")).every(({ body }) => !body?.panelToken));
  assert.equal(target.querySelector<HTMLElement>(".email-card")!.hidden, true);
  assert.equal(target.querySelector("iframe"), null);
  panel.close();
  localStorage.removeItem(panelSessionKey("demo", config.challengeOrigin));
  panel.open();
  assert.equal(localStorage.getItem("bitsnap-chat:demo"), null);
  assert.equal(target.querySelector(".identity")!.textContent, "");
});

test("localized consent and contrast for seller accents", () => {
  assert.match(DEFAULT_TEXTS.pl.necessaryDescription, /czat ze sklepem, jeśli jest włączony/);
  assert.match(DEFAULT_TEXTS.en.necessaryDescription, /shop chat when enabled/);
  assert.ok(contrastRatio(ensure("#23395d", "#252a33", 4.5), "#252a33") >= 4.5);
});

test("poll reconciles pending messages, and a late cap refusal suppresses resend", async (t) => {
  let close = () => {};
  let restoreClock = () => {};
  t.after(() => { close(); restoreClock(); });
  const win = setup(t);
  localStorage.setItem("bitsnap-chat:demo", JSON.stringify(record));
  const root = document.body.appendChild(document.createElement("div")).attachShadow({ mode: "open" });
  const target = root.appendChild(document.createElement("div"));
  const replies = [{ id: "reply", author_email: "shop", body: "Odpowiedź sklepu" }];
  const sent: string[] = [];
  let capped = false;
  let store = false;
  let readCount = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/messages")) {
      const body = JSON.parse(String(init?.body));
      sent.push(body.client_id);
      const message = { id: body.client_id, body: body.body, author_email: "visitor" };
      if (store) replies.push(message);
      return Response.json({ message: { ...message, status: "pending" } }, { status: 202 });
    }
    readCount++;
    return Response.json({
      thread: { id: "th", composer_locked: capped, limits_left: { consecutive: capped ? 0 : 3, hour: 20, thread: 90 } },
      messages: replies, has_more: false,
    });
  };
  const clock = Date.now;
  let advanced = 0;
  Date.now = () => clock() + advanced;
  const timers = new Map<number, () => void>();
  let timerId = 0;
  win.setTimeout = (run: () => void) => { timers.set(++timerId, run); return timerId; };
  win.clearTimeout = (id: number) => { timers.delete(id); };
  restoreClock = () => { Date.now = clock; };
  const panel = mount({ protocol: PROTOCOL, root, target, config, locale: "pl", projectKey: "demo", apiOrigin: config.challengeOrigin, close() {}, clearBadge() {} })!;
  close = panel.close;
  panel.open();
  await next();
  const tick = async (milliseconds: number) => {
    advanced += milliseconds;
    const entry = timers.entries().next().value!;
    timers.delete(entry[0]);
    entry[1]();
    await next();
  };
  const field = target.querySelector("textarea")!;
  const send = (body: string) => {
    field.value = body;
    field.dispatchEvent(new win.Event("input", { bubbles: true }));
    target.querySelector<HTMLButtonElement>(".composer button")!.click();
  };
  send("Pierwsza próba");
  await next();
  assert.match(target.querySelector("[role=log]")!.textContent!, /Wysyłanie/);
  await tick(10_000);
  assert.doesNotMatch(target.querySelector("[role=log]")!.textContent!, /Nie wysłano/);
  await tick(21_000);
  const retry = target.querySelector<HTMLButtonElement>("[role=log] button")!;
  assert.match(retry.textContent!, /Spróbuj ponownie/);
  store = true;
  retry.click();
  await next();
  assert.equal(sent[0], sent[1]);
  await tick(10_000);
  assert.match(target.querySelector("[role=log]")!.textContent!, /Wysłano/);
  store = false;
  send("Druga próba");
  await next();
  const bubble = [...target.querySelectorAll(".bubble")].find((node) => node.textContent === "Druga próba");
  assert.ok(bubble);
  capped = true;
  await tick(31_000);
  assert.equal(bubble.isConnected, true);
  assert.equal(field.disabled, true);
  assert.match(target.querySelector("footer [role=status]")!.textContent!, /Poczekaj na odpowiedź/);
  assert.match(target.querySelector("[role=log]")!.textContent!, /Nie wysłano/);
  assert.equal(target.querySelector("[role=log] button"), null);
  panel.close();
  assert.equal(timers.size, 0);
  assert.equal(readCount, 5);
});

test("the hosted /c/ markup opens the conversation with its page credential", async (t) => {
  const win = setup(t);
  const data = {
    mode: "page", ...record, locale: "en", projectKey: "demo", projectId: "18",
    chatUrl: config.chatUrl, shopName: "Hosted shop", greeting: "Welcome to chat",
    accent: "#a3462a", theme: "light", privacyUrl: null, contactEmail: null, limits: { messageMax: 700 },
  };
  document.body.innerHTML = `
    <div id="bitsnap-chat-page"></div>
    <script type="application/json" id="bitsnap-chat-page-config">${JSON.stringify(data)}</script>
    <script src="https://shop.test/embed/v1/bitsnap-chat-panel.js" data-mode="page" defer></script>`;
  let polls = 0;
  const paths: string[] = [];
  globalThis.fetch = async (url, init) => {
    const request = new URL(String(url));
    paths.push(request.pathname);
    assert.equal(request.origin, config.chatUrl);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer " + record.token);
    assert.equal(headers.get("X-Bitsnap-Project"), "18");
    if (request.pathname.endsWith("/messages")) {
      return Response.json({ message: { id: "m1", body: "Hello", status: "pending" } }, { status: 202 });
    }
    assert.equal(request.pathname, "/v1/visitor/thread");
    assert.equal(request.searchParams.has("peek"), false);
    polls++;
    return Response.json({ thread: null });
  };
  mountHostedPage();
  mountHostedPage();
  await next();
  const root = document.querySelector("#bitsnap-chat-page")!.shadowRoot!;
  assert.equal(root.querySelector("h2")?.textContent, data.shopName);
  assert.equal(root.querySelector(".bubble")?.textContent, data.greeting);
  assert.equal(root.querySelector<HTMLElement>(".close")?.hidden, true);
  const report = new URL(root.querySelector<HTMLAnchorElement>("[role=menuitem]")!.href);
  assert.equal(report.searchParams.get("url"), location.origin);
  assert.equal(report.searchParams.get("locale"), "en");
  assert.equal(polls, 1);
  assert.equal(localStorage.length, 0);
  // The visitor came from an e-mail link: after a sent message no e-mail card appears.
  const field = root.querySelector("textarea")!;
  field.value = "Hello";
  field.dispatchEvent(new win.Event("input", { bubbles: true }));
  root.querySelector<HTMLButtonElement>(".composer button")!.click();
  await next();
  assert.ok(paths.some((path) => path.endsWith("/messages")));
  assert.equal(root.querySelector("iframe"), null);
  assert.equal(root.querySelector<HTMLElement>(".email-card")!.hidden, true);
  assert.equal(root.querySelector<HTMLElement>(".add-email")?.hidden ?? true, true);
  assert.equal(localStorage.length, 0);
});

function mountWidgetPanel() {
  const root = document.body.appendChild(document.createElement("div")).attachShadow({ mode: "open" });
  const target = root.appendChild(document.createElement("div"));
  const panel = mount({
    protocol: PROTOCOL, root, target, config, projectKey: "demo", locale: "pl",
    apiOrigin: config.challengeOrigin, close() {}, clearBadge() {},
  })!;
  return { panel, target };
}

test("polling stops while closed or idle and resumes on activity", async (t) => {
  const win = setup(t);
  const now = Date.now;
  let time = now();
  Date.now = () => time;
  t.after(() => { Date.now = now; });
  const timers = new Map<number, { run: () => void; at: number }>();
  let sequence = 0;
  win.setTimeout = (run: () => void, delay = 0) => {
    timers.set(++sequence, { run, at: time + delay });
    return sequence;
  };
  win.clearTimeout = (id: number) => { timers.delete(id); };
  const tick = async (ms: number) => {
    time += ms;
    for (const [id, timer] of timers) {
      if (timer.at > time) continue;
      timers.delete(id);
      timer.run();
    }
    await next();
  };
  localStorage.setItem("bitsnap-chat:demo", JSON.stringify({ ...record, expiresAt: time / 1000 + 3600 }));
  let polls = 0;
  globalThis.fetch = async () => { polls++; return Response.json({ thread: null }); };
  const { panel, target } = mountWidgetPanel();
  assert.equal(polls, 0);
  panel.open();
  await next();
  await tick(10_000);
  assert.equal(polls, 2);
  await tick(29 * 60_000 + 50_000);
  await tick(10_000);
  assert.equal(polls, 2);
  target.querySelector("textarea")!.dispatchEvent(new win.Event("input", { bubbles: true }));
  await tick(0);
  assert.equal(polls, 3);
  panel.close();
  await tick(60_000);
  assert.equal(polls, 3);
  assert.equal(timers.size, 0);
});

for (const change of ["logout", "different email"] as const) {
  test(`opening forgets a stored verified visitor session after ${change}`, (t) => {
    setup(t);
    localStorage.setItem("bitsnap-chat:demo", JSON.stringify({ ...record, verified: true, email: "buyer@example.test" }));
    localStorage.setItem("bitsnap-chat:demo:seen", "old-message");
    if (change === "different email") {
      localStorage.setItem(panelSessionKey("demo", config.challengeOrigin), "new_login");
      localStorage.setItem(panelEmailKey("demo", config.challengeOrigin), "other@example.test");
    }
    let polls = 0;
    globalThis.fetch = async () => { polls++; return Response.json({ thread: null }); };
    const { panel } = mountWidgetPanel();
    panel.open();
    assert.equal(localStorage.getItem("bitsnap-chat:demo"), null);
    assert.equal(localStorage.getItem("bitsnap-chat:demo:seen"), null);
    assert.equal(polls, 0);
    panel.close();
  });
}

test("loader peeks only with a stored session and at most once per five minutes", async (t) => {
  setup(t);
  const script = document.createElement("script");
  script.src = "https://bitsnap.pl/embed/v1/bitsnap-chat.js";
  script.dataset.project = "demo";
  const now = Date.now;
  let time = now();
  Date.now = () => time;
  t.after(() => { Date.now = now; });
  let peeks = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/config")) return Response.json(config);
    assert.equal(new URL(String(url)).searchParams.get("peek"), "1");
    peeks++;
    return Response.json({ thread: null });
  };
  const enter = async () => {
    delete window.BitsnapChat;
    init(script);
    await next();
    assert.ok(document.querySelector("bitsnap-chat"));
    document.querySelector("bitsnap-chat")!.remove();
  };
  await enter();
  assert.equal(peeks, 0);
  localStorage.setItem("bitsnap-chat:demo", JSON.stringify({ ...record, expiresAt: time / 1000 + 3600 }));
  await enter();
  assert.equal(peeks, 1);
  time += 299_999;
  await enter();
  assert.equal(peeks, 1);
  time += 1;
  await enter();
  assert.equal(peeks, 2);
});

for (const via of ["on a storage event", "before sending"] as const) {
  test(`the panel reuses a cross-tab session ${via} and sends after one failed buyer upgrade`, async (t) => {
    const win = setup(t);
    localStorage.setItem(panelSessionKey("demo", config.challengeOrigin), "panel_login");
    const calls: { path: string; authorization: string | null }[] = [];
    globalThis.fetch = async (url, init) => {
      const path = new URL(String(url)).pathname;
      calls.push({ path, authorization: new Headers(init?.headers).get("Authorization") });
      if (path.endsWith("/identify")) return Response.json({ error: "origin_not_allowed" }, { status: 403 });
      if (path.endsWith("/messages")) return Response.json({ message: { id: crypto.randomUUID() } }, { status: 202 });
      return Response.json({ thread: null });
    };
    const { panel, target } = mountWidgetPanel();
    panel.open();
    localStorage.setItem("bitsnap-chat:demo", JSON.stringify(record));
    if (via === "on a storage event") {
      window.dispatchEvent(new win.StorageEvent("storage", { key: "bitsnap-chat:demo" }));
      assert.equal(calls[0]?.path, "/v1/visitor/thread");
    }
    for (const body of ["First", "Second"]) {
      const field = target.querySelector("textarea")!;
      field.value = body;
      field.dispatchEvent(new win.Event("input", { bubbles: true }));
      target.querySelector<HTMLButtonElement>(".composer button")!.click();
      await next();
    }
    assert.equal(calls.filter(({ path }) => path.endsWith("/identify")).length, 1);
    assert.deepEqual(calls.filter(({ path }) => path.endsWith("/messages")).map((call) => call.authorization),
      ["Bearer bvis_mock", "Bearer bvis_mock"]);
    assert.equal(target.querySelector("iframe"), null);
    panel.close();
  });
}

test("the abuse report omits tracking parameters and the menu dismisses on focus or pointer exit", (t) => {
  const win = setup(t);
  const { panel, target } = mountWidgetPanel();
  panel.open();
  const button = target.querySelector<HTMLButtonElement>(".menu-button")!;
  const menu = target.querySelector<HTMLElement>("[role=menu]")!;
  button.click();
  assert.equal(menu.hidden, false);
  const report = new URL(menu.querySelector("a")!.href);
  assert.equal(report.searchParams.get("url"), "https://shop.test/p");
  assert.equal(report.searchParams.get("locale"), "pl");
  target.querySelector("textarea")!.focus();
  assert.equal(menu.hidden, true);
  button.click();
  document.body.dispatchEvent(new win.Event("pointerdown", { bubbles: true, composed: true }));
  assert.equal(menu.hidden, true);
  assert.equal(button.getAttribute("aria-expanded"), "false");
  panel.close();
});
