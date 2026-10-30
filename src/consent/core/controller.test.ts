import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createConsent } from "./controller.ts";
import { fetchRemoteConfig } from "./config.ts";
import { cookieName, encodeState, parseCookie, readConsent } from "./cookie.ts";
import { clickButton, setupDom, shadowOf, visible } from "./testing.ts";
import type { BitsnapConsentApi, ConsentChangeDetail, ConsentConfig } from "./types.ts";

const config: Partial<ConsentConfig> = {
  version: 1,
  categories: { analytics: true, marketing: true, preferences: true },
  services: [
    { name: "Google Analytics", category: "analytics", cookies: ["_ga", "_ga_*"] },
    { name: "Meta Pixel", category: "marketing", cookies: ["_fbp"] },
  ],
  privacyPolicyUrl: "https://shop.example.test/privacy",
};

const instances: BitsnapConsentApi[] = [];
const originalFetch = globalThis.fetch;

function make(options: Parameters<typeof createConsent>[0] = {}) {
  const api = createConsent({ locale: "en", config, ...options });
  instances.push(api);
  return api;
}

afterEach(() => {
  instances.splice(0).forEach((api) => api.destroy());
  globalThis.fetch = originalFetch;
});

describe("consent banner", () => {
  it("shows both layers' content, equal buttons and the Powered by link", async () => {
    const dom = setupDom();
    const api = make();
    await api.ready;
    const root = shadowOf(dom.window.document)!;
    assert.ok(visible(root, ".banner"));
    assert.equal(root.querySelector(".banner")!.getAttribute("role"), "region");
    assert.equal(root.querySelector(".banner")!.getAttribute("aria-live"), "polite");
    const buttons = Array.from(root.querySelectorAll(".banner .btn"));
    assert.deepEqual(buttons.map((b) => b.textContent), ["Accept all", "Reject all"]);
    assert.equal(buttons[0].className, buttons[1].className);
    const link = root.querySelector<HTMLAnchorElement>(".banner .foot a")!;
    assert.equal(
      link.href,
      "https://bitsnap.pl/?utm_source=consent_banner&utm_medium=referral&utm_content=shop.example.test",
    );
    assert.equal(link.target, "_blank");
    assert.equal(link.rel, "noopener");
    assert.ok(root.querySelector(".banner .desc a")!.getAttribute("href") === "https://shop.example.test/privacy");
    // nothing is ticked, and the settings layer stays hidden
    assert.ok(!visible(root, ".overlay"));
    assert.equal(root.querySelectorAll("input:checked:not(:disabled)").length, 0);
  });

  it("accept all writes the cookie, fires the event and hides the banner", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    const events: ConsentChangeDetail[] = [];
    const api = make();
    api.on("change", (detail) => events.push(detail));
    let windowEvent: ConsentChangeDetail | undefined;
    dom.window.addEventListener("bitsnap:consent", (e) => (windowEvent = (e as CustomEvent).detail));
    await api.ready;

    clickButton(shadowOf(doc)!, "Accept all");

    const stored = readConsent(doc, "bitsnap_consent")!;
    assert.deepEqual(stored.c, { analytics: true, marketing: true, preferences: true });
    assert.equal(stored.bv, 1);
    assert.deepEqual(api.get(), stored);
    assert.ok(!visible(shadowOf(doc)!, ".banner"));
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "accept_all");
    assert.equal(windowEvent?.action, "accept_all");
    assert.match(doc.cookie, /bitsnap_consent=/);
  });

  it("reject all stores a refusal", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    const api = make();
    await api.ready;
    clickButton(shadowOf(doc)!, "Reject all");
    assert.deepEqual(readConsent(doc, "bitsnap_consent")!.c, { analytics: false, marketing: false, preferences: false });
  });

  it("settings: only enabled categories are listed, services are named, save stores the toggles", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    const api = make({ config: { ...config, categories: { analytics: true, marketing: true, preferences: false } } });
    await api.ready;
    const root = shadowOf(doc)!;
    clickButton(root, "Settings");
    assert.ok(visible(root, ".overlay"));
    assert.ok(!visible(root, ".banner"));
    assert.equal(root.querySelector(".dialog")!.getAttribute("aria-modal"), "true");

    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>(".dialog input"));
    assert.equal(inputs.length, 3); // necessary + analytics + marketing
    assert.ok(inputs[0].disabled && inputs[0].checked);
    assert.ok(inputs.slice(1).every((input) => !input.checked && !input.disabled));
    assert.match(root.querySelector(".dialog")!.textContent!, /Google Analytics/);
    assert.match(root.querySelector(".dialog")!.textContent!, /Meta Pixel/);
    assert.equal(root.querySelector(".dialog .foot a")!.textContent!.includes("bitsnap"), true);

    inputs[2].click(); // marketing
    clickButton(root, "Save choices");
    assert.deepEqual(readConsent(doc, "bitsnap_consent")!.c, { analytics: false, marketing: true, preferences: false });
  });

  it("ESC closes the settings and brings the banner back while undecided", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    const api = make();
    await api.ready;
    const root = shadowOf(doc)!;
    clickButton(root, "Settings");
    doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.ok(!visible(root, ".overlay"));
    assert.ok(visible(root, ".banner"));
  });

  it("traps Tab inside the settings dialog", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    const api = make();
    await api.ready;
    const root = shadowOf(doc)!;
    clickButton(root, "Settings");
    const items = Array.from(root.querySelectorAll<HTMLElement>(".dialog button,.dialog input:not(:disabled),.dialog a[href]"));
    items[items.length - 1].focus();
    const event = new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    doc.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(root.activeElement, items[0]);
  });

  it("reopens through [data-bitsnap-consent-open] and open()", async () => {
    const dom = setupDom(`<a href="#" data-bitsnap-consent-open id="o">Cookie settings</a>`);
    const doc = dom.window.document;
    const api = make();
    await api.ready;
    api.rejectAll();
    const root = shadowOf(doc)!;
    assert.ok(!visible(root, ".overlay"));
    doc.getElementById("o")!.click();
    assert.ok(visible(root, ".overlay"));
    api.close();
    assert.ok(!visible(root, ".overlay"));
    api.open();
    await api.ready;
    assert.ok(visible(root, ".overlay"));
  });

  it("follows prefers-color-scheme when the theme is auto", async () => {
    const dom = setupDom();
    let listener: (() => void) | undefined;
    const media = {
      matches: false,
      addEventListener: (_: string, fn: () => void) => (listener = fn),
      removeEventListener() {},
    };
    (dom.window as unknown as { matchMedia: () => unknown }).matchMedia = () => media;
    const api = make({ theme: "auto" });
    await api.ready;
    const root = shadowOf(dom.window.document)!.querySelector(".root")!;
    assert.equal(root.getAttribute("data-theme"), "light");
    media.matches = true;
    listener!();
    assert.equal(root.getAttribute("data-theme"), "dark");
  });

  it("applies the accent color through CSS variables", async () => {
    const dom = setupDom();
    const api = make({ config: { ...config, accentColor: "#ffeb3b" } });
    await api.ready;
    const root = shadowOf(dom.window.document)!.querySelector<HTMLElement>(".root")!;
    assert.equal(root.style.getPropertyValue("--accent"), "#ffeb3b");
    assert.equal(root.style.getPropertyValue("--on-accent"), "#111111");
  });

  it("falls back to the default dark accent when a custom one is too faint on dark", async () => {
    const dom = setupDom();
    const api = make({ theme: "dark", config: { ...config, accentColor: "#222244" } });
    await api.ready;
    const root = shadowOf(dom.window.document)!.querySelector<HTMLElement>(".root")!;
    assert.equal(root.style.getPropertyValue("--accent"), "", "the dark palette's own accent applies");

    const bright = setupDom();
    const other = make({ theme: "dark", config: { ...config, accentColor: "#ffeb3b" } });
    await other.ready;
    const brightRoot = shadowOf(bright.window.document)!.querySelector<HTMLElement>(".root")!;
    assert.equal(brightRoot.style.getPropertyValue("--accent"), "#ffeb3b");
  });

  it("does not move focus into the banner on load, but does for open() and reset()", async () => {
    const dom = setupDom(`<button id="page">page</button>`);
    const doc = dom.window.document;
    doc.getElementById("page")!.focus();
    const api = make();
    await api.ready;
    assert.equal(doc.activeElement?.id, "page", "load leaves focus alone");
    api.acceptAll();
    api.reset();
    const host = doc.getElementById("bitsnap-consent")!;
    assert.equal(doc.activeElement, host, "reset focuses the banner");
    api.open();
    assert.equal(doc.activeElement, host);
  });

  it("offers Reject all next to Accept all and Save in the settings, with the same styling", async () => {
    const dom = setupDom();
    const api = make();
    await api.ready;
    const root = shadowOf(dom.window.document)!;
    clickButton(root, "Settings");
    const buttons = Array.from(root.querySelectorAll(".dialog .d-foot .btn"));
    assert.deepEqual(buttons.map((b) => b.textContent), ["Save choices", "Accept all", "Reject all"]);
    assert.equal(new Set(buttons.map((b) => b.className)).size, 1);
    const dialogReject = buttons[2] as HTMLButtonElement;
    dialogReject.click();
    assert.deepEqual(api.get()?.c, { analytics: false, marketing: false, preferences: false });
  });
});

describe("stored consent", () => {
  const stored = (bv: number, marketing = true) =>
    `bitsnap_consent=${encodeState({ id: "abc", ts: 1, bv, c: { analytics: false, marketing, preferences: false } })}; Path=/`;

  it("skips the banner and applies the stored choice", async () => {
    const dom = setupDom(`<script type="text/plain" data-bitsnap-consent="marketing" id="px">1</script>`);
    const doc = dom.window.document;
    doc.cookie = stored(1);
    const api = make();
    const state = await api.ready;
    assert.equal(shadowOf(doc), null);
    assert.equal(state?.id, "abc");
    assert.equal(api.get()?.c.marketing, true);
    assert.equal(doc.getElementById("px")!.hasAttribute("type"), false);
  });

  it("asks again when the banner version is newer", async () => {
    const dom = setupDom(`<script type="text/plain" data-bitsnap-consent="marketing" id="px">1</script>`);
    const doc = dom.window.document;
    doc.cookie = stored(1);
    const api = make({ config: { ...config, version: 2 } });
    await api.ready;
    assert.equal(api.get(), null);
    assert.ok(visible(shadowOf(doc)!, ".banner"));
    assert.equal(doc.getElementById("px")!.getAttribute("type"), "text/plain");
    clickButton(shadowOf(doc)!, "Reject all");
    const next = readConsent(doc, "bitsnap_consent")!;
    assert.equal(next.bv, 2);
    assert.equal(next.id, "abc"); // the consent id carries over
  });

  it("asks again when the stored version differs in either direction", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    doc.cookie = stored(5); // a newer banner than the current config
    const api = make({ config: { ...config, version: 2 } });
    await api.ready;
    assert.equal(api.get(), null);
    assert.ok(visible(shadowOf(doc)!, ".banner"));
  });

  it("keeps honouring a refusal made on an older banner version until the visitor chooses again", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    doc.cookie = stored(1); // analytics: false
    const api = make({ config: { ...config, version: 2 } });
    assert.equal(api.denied("analytics"), false, "nothing is known before ready");
    await api.ready;
    assert.equal(api.get(), null, "the old choice is not a valid state any more");
    assert.equal(api.denied("analytics"), true);
    clickButton(shadowOf(doc)!, "Accept all");
    assert.equal(api.denied("analytics"), false, "a new answer replaces it");
  });

  it("does not treat a missing or accepted category as denied", async () => {
    const dom = setupDom();
    dom.window.document.cookie = `bitsnap_consent=${encodeState({ id: "abc", ts: 1, bv: 1, c: { analytics: true, marketing: false, preferences: false } })}; Path=/`;
    const api = make({ config: { ...config, version: 2 } });
    await api.ready;
    assert.equal(api.denied("analytics"), false);
    assert.equal(api.denied("marketing"), true, "the old choice refused marketing");
    setupDom();
    const fresh = make();
    await fresh.ready;
    assert.equal(fresh.denied("analytics"), false, "no choice at all");
  });

  it("keeps Consent Mode denied until the stored choice is validated, then applies only offered categories", async () => {
    const dom = setupDom();
    const win = dom.window as unknown as { dataLayer: unknown[] };
    win.dataLayer = [];
    dom.window.document.cookie = stored(1, true);
    const api = make({ gcm: "on", config: { ...config, categories: { analytics: true, marketing: false, preferences: false } } });
    const before = win.dataLayer.map((entry) => Array.from(entry as ArrayLike<unknown>));
    assert.deepEqual(before.map((entry) => entry[1]), ["default"], "no update before the config is known");
    await api.ready;
    const updates = win.dataLayer
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((entry) => entry[1] === "update");
    assert.equal(updates.length, 1);
    assert.equal((updates[0][2] as Record<string, string>).ad_storage, "denied", "marketing is not on offer");
  });

  it("keeps a stored choice when the project config cannot be loaded", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    doc.cookie = stored(9);
    globalThis.fetch = (async () => new Response("", { status: 500 })) as typeof fetch;
    const api = make({ projectKey: "Ab12Cd" });
    await api.ready;
    assert.equal(api.get()?.bv, 9);
    assert.equal(shadowOf(doc), null);
  });

  describe("banner switched off in the project", () => {
    const off = () =>
      (globalThis.fetch = (async (url: string) =>
        String(url).includes("/api/consent/config")
          ? new Response(JSON.stringify({ enabled: false, config }))
          : new Response("ok")) as typeof fetch);

    it("shows no banner without a stored choice, but the API keeps working", async () => {
      const dom = setupDom();
      const doc = dom.window.document;
      off();
      const api = make({ projectKey: "Ab12Cd" });
      await api.ready;
      assert.equal(shadowOf(doc), null);
      api.open();
      await api.ready;
      assert.ok(visible(shadowOf(doc)!, ".overlay"), "open() still shows the settings");
      api.accept({ analytics: true });
      assert.equal(api.get()?.c.analytics, true);
      assert.equal(readConsent(doc, "bitsnap_consent")?.c.analytics, true);
    });

    it("still applies a stored choice, whatever its version", async () => {
      const dom = setupDom(`<script type="text/plain" data-bitsnap-consent="marketing" id="px">1</script>`);
      const doc = dom.window.document;
      doc.cookie = stored(1);
      off();
      const api = make({ projectKey: "Ab12Cd", config: { version: 3 } });
      await api.ready;
      assert.equal(api.get()?.c.marketing, true);
      assert.equal(doc.getElementById("px")!.hasAttribute("type"), false);
      assert.equal(shadowOf(doc), null);
    });
  });

  it("holds accept/acceptAll made before ready until the merged config is known", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    globalThis.fetch = (async (url: string) =>
      String(url).includes("/api/consent/config")
        ? new Response(
            JSON.stringify({ enabled: true, config: { version: 6, categories: { analytics: true, marketing: false, preferences: false } } }),
          )
        : new Response("ok")) as typeof fetch;
    const api = createConsent({ projectKey: "Ab12Cd", locale: "en" });
    instances.push(api);
    api.acceptAll();
    assert.equal(api.get(), null, "nothing is stored before the config is known");
    assert.equal(doc.cookie, "");
    await api.ready;
    await Promise.resolve();
    const state = api.get()!;
    assert.equal(state.bv, 6);
    assert.deepEqual(state.c, { analytics: true, marketing: false, preferences: false });
    assert.ok(!visible(shadowOf(doc)!, ".banner"));
  });

  it("only counts categories the current config offers as withdrawn", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    const events: ConsentChangeDetail[] = [];
    // marketing was granted on an older banner, which no longer offers it
    doc.cookie = `bitsnap_consent=${encodeState({ id: "abc", ts: 1, bv: 1, c: { analytics: false, marketing: true, preferences: false } })}; Path=/`;
    const api = make({ config: { ...config, version: 1, categories: { analytics: true, marketing: false, preferences: false } } });
    api.on("change", (d) => events.push(d));
    await api.ready;
    api.accept({ analytics: true });
    assert.equal(events[0].action, "custom", "no withdraw for a category that is not offered");
  });

  it("ignores a broken cookie", async () => {
    const dom = setupDom();
    dom.window.document.cookie = "bitsnap_consent=garbage; Path=/";
    const api = make();
    await api.ready;
    assert.ok(visible(shadowOf(dom.window.document)!, ".banner"));
  });

  it("activates scripts only for the consented category after a choice", async () => {
    const dom = setupDom(`
      <script type="text/plain" data-bitsnap-consent="marketing" id="m">1</script>
      <script type="text/plain" data-bitsnap-consent="analytics" id="a">1</script>`);
    const doc = dom.window.document;
    const api = make();
    await api.ready;
    api.accept({ marketing: true });
    assert.equal(doc.getElementById("m")!.hasAttribute("type"), false);
    assert.equal(doc.getElementById("a")!.getAttribute("type"), "text/plain");
  });

  it("withdrawing reports the action, deletes declared cookies and can reload", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    const events: ConsentChangeDetail[] = [];
    const api = make();
    api.on("change", (d) => events.push(d));
    await api.ready;
    api.acceptAll();
    doc.cookie = "_ga=1; Path=/";
    doc.cookie = "_ga_ABC123=2; Path=/";
    doc.cookie = "_fbp=3; Path=/";
    api.accept({ marketing: true });
    assert.equal(events[1].action, "withdraw");
    assert.ok(!/_ga=/.test(doc.cookie) && !/_ga_ABC123/.test(doc.cookie));
    assert.match(doc.cookie, /_fbp=3/);
  });

  it("applies a choice made before ready ahead of everyone waiting on ready", async () => {
    setupDom();
    const api = make();
    let seen: ReturnType<typeof api.get> | undefined;
    // Registered first, like a tracker that attached before the merchant's own code ran.
    const early = api.ready.then(() => {
      seen = api.get();
    });
    api.rejectAll();
    assert.equal(api.get(), null, "waits for the merged config");
    await early;
    assert.equal(seen?.c.analytics, false, "the rejection was committed before ready resolved");
    assert.equal(seen?.bv, 1);
    assert.deepEqual((await api.ready)?.c, { analytics: false, marketing: false, preferences: false });
  });

  it("reset clears the cookie and asks again", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    const events: ConsentChangeDetail[] = [];
    const api = make();
    api.on("change", (d) => events.push(d));
    await api.ready;
    api.acceptAll();
    api.reset();
    assert.equal(api.get(), null);
    assert.equal(readConsent(doc, "bitsnap_consent"), null);
    assert.equal(events.at(-1)!.action, "reset");
    assert.ok(visible(shadowOf(doc)!, ".banner"));
  });

  it("scopes the cookie to the project", async () => {
    const dom = setupDom();
    const doc = dom.window.document;
    globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;
    const api = make({ projectKey: "pk_Ab12Cd", scope: "project" });
    await api.ready;
    api.rejectAll();
    // The contract names the cookie with the bare key, without `pk_`.
    assert.ok(parseCookie(doc.cookie, "bitsnap_consent_Ab12Cd"));
    assert.ok(parseCookie(doc.cookie, cookieName("Ab12Cd", "project")));
    assert.equal(parseCookie(doc.cookie, "bitsnap_consent"), null);
    assert.ok(!doc.cookie.includes("pk_"));
  });
});

describe("Consent Mode", () => {
  it("sets the default before anything else and updates on a choice", async () => {
    const dom = setupDom();
    const win = dom.window as unknown as { dataLayer: unknown[] };
    win.dataLayer = [];
    const api = make();
    const layer = win.dataLayer.map((entry) => Array.from(entry as ArrayLike<unknown>));
    assert.equal(layer.length, 1); // synchronous, before the config is ready
    assert.deepEqual(layer[0].slice(0, 2), ["consent", "default"]);
    await api.ready;
    api.accept({ analytics: true });
    const last = Array.from(win.dataLayer.at(-1) as ArrayLike<unknown>);
    assert.deepEqual(last.slice(0, 2), ["consent", "update"]);
    assert.equal((last[2] as Record<string, string>).analytics_storage, "granted");
    assert.equal((last[2] as Record<string, string>).ad_storage, "denied");
  });

  it("stays out of pages without gtag unless data-gcm=on", async () => {
    const dom = setupDom();
    make();
    assert.equal((dom.window as unknown as { dataLayer?: unknown }).dataLayer, undefined);
    make({ gcm: "on" });
    assert.equal((dom.window as unknown as { dataLayer: unknown[] }).dataLayer.length, 1);
  });
});

describe("storage and network", () => {
  it("never writes to localStorage or sessionStorage", async () => {
    const dom = setupDom();
    const writes: string[] = [];
    const proto = dom.window.Storage.prototype;
    for (const method of ["setItem", "removeItem", "clear"] as const) {
      const original = proto[method];
      proto[method] = function (this: Storage, ...args: never[]) {
        writes.push(method);
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      } as never;
    }
    const api = make();
    await api.ready;
    clickButton(shadowOf(dom.window.document)!, "Settings");
    api.acceptAll();
    api.accept({ analytics: true });
    api.reset();
    api.rejectAll();
    assert.deepEqual(writes, []);
    assert.equal(dom.window.localStorage.length, 0);
    assert.equal(dom.window.sessionStorage.length, 0);
  });

  it("loads the project config and logs every choice", async () => {
    const dom = setupDom();
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("/api/consent/config")) {
        return new Response(
          JSON.stringify({ enabled: true, config: { ...config, version: 7, texts: { en: { title: "Hello cookies" } } } }),
        );
      }
      return new Response("ok");
    }) as typeof fetch;
    const api = createConsent({ projectKey: "pk_Ab12Cd", locale: "en", apiHost: "https://api.example.test", collectHost: "https://collect.example.test" });
    instances.push(api);
    await api.ready;
    assert.equal(calls[0].url, "https://api.example.test/api/consent/config?key=Ab12Cd");
    assert.match(shadowOf(dom.window.document)!.textContent!, /Hello cookies/);

    clickButton(shadowOf(dom.window.document)!, "Accept all");
    const post = calls.find((call) => call.url.endsWith("/consent") && JSON.parse(call.init!.body as string).action === "accept_all")!;
    assert.equal(post.url, "https://collect.example.test/consent");
    assert.equal(post.init!.method, "POST");
    assert.equal(post.init!.keepalive, true);
    const body = JSON.parse(post.init!.body as string);
    assert.deepEqual(Object.keys(body).sort(), ["action", "bv", "c", "consent_id", "host", "k", "ts"]);
    assert.equal(body.k, "Ab12Cd", "the log carries the bare key");
    assert.equal(body.action, "accept_all");
    assert.equal(body.bv, 7);
    assert.equal(body.host, "shop.example.test");
    assert.equal(body.consent_id, api.get()!.id);
  });

  it("does not log without a project key, and swallows network errors", async () => {
    setupDom();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new Error("offline");
    }) as typeof fetch;
    const local = make();
    await local.ready;
    local.acceptAll();
    assert.equal(calls, 0);

    const remote = make({ projectKey: "pk_x" });
    await remote.ready; // config fetch fails -> defaults
    assert.doesNotThrow(() => remote.rejectAll());
  });

  it("gives up on a slow config after the timeout", async () => {
    globalThis.fetch = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch;
    const started = Date.now();
    assert.equal(await fetchRemoteConfig("https://api.example.test", "pk", 30), null);
    assert.ok(Date.now() - started < 1000);
  });

  it("uses the data-categories fallback only without a remote config", async () => {
    const dom = setupDom();
    globalThis.fetch = (async () => new Response("", { status: 500 })) as typeof fetch;
    const api = createConsent({ projectKey: "pk", locale: "en", categories: { analytics: true, marketing: false, preferences: false } });
    instances.push(api);
    await api.ready;
    clickButton(shadowOf(dom.window.document)!, "Settings");
    assert.equal(shadowOf(dom.window.document)!.querySelectorAll(".dialog input").length, 2);
  });

  it("does nothing for a malformed project key: no config request, no log", async () => {
    setupDom();
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return new Response("{}");
    }) as typeof fetch;
    const api = make({ projectKey: "not a key!", scope: "project" });
    await api.ready;
    api.rejectAll();
    assert.deepEqual(calls, []);
  });

  it("reads the wrapped { enabled, config } answer", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ enabled: false, config: { version: 4 } }))) as typeof fetch;
    assert.deepEqual(await fetchRemoteConfig("https://api.example.test", "Ab12Cd"), {
      enabled: false,
      config: { version: 4 },
    });
    globalThis.fetch = (async () => new Response(JSON.stringify({ config: { version: 2 } }))) as typeof fetch;
    assert.deepEqual(await fetchRemoteConfig("https://api.example.test", "Ab12Cd"), {
      enabled: true,
      config: { version: 2 },
    });
    globalThis.fetch = (async () => new Response("{}")) as typeof fetch;
    assert.equal(await fetchRemoteConfig("https://api.example.test", "Ab12Cd"), null);
  });

  describe("dashboard preview", () => {
    function noNetwork() {
      const calls: string[] = [];
      globalThis.fetch = (async (url: string) => {
        calls.push(String(url));
        return new Response("{}", { status: 200 });
      }) as typeof fetch;
      return calls;
    }

    it("shows the banner at once and never reads the cookie", async () => {
      const dom = setupDom();
      const doc = dom.window.document;
      // A stored choice from the dashboard origin must not hide the preview.
      writeStored(doc);
      const calls = noNetwork();
      const api = make({ projectKey: "pk_x", preview: true });
      await api.ready;
      assert.ok(visible(shadowOf(doc)!, ".banner"));
      assert.equal(api.get(), null);
      assert.deepEqual(calls, [], "no config request");
    });

    it("buttons only hide the banner: no cookie, no event, no log, no dataLayer", async () => {
      const dom = setupDom();
      const doc = dom.window.document;
      const calls = noNetwork();
      const win = dom.window as unknown as { dataLayer?: unknown[]; gtag?: unknown };
      win.dataLayer = [];
      const events: ConsentChangeDetail[] = [];
      let windowEvents = 0;
      dom.window.addEventListener("bitsnap:consent", () => windowEvents++);
      const api = make({ projectKey: "pk_x", preview: true, gcm: "on" });
      api.on("change", (detail) => events.push(detail));
      await api.ready;

      const root = shadowOf(doc)!;
      clickButton(root, "Accept all");
      assert.ok(!visible(root, ".banner"));
      assert.equal(doc.cookie, "");
      assert.equal(api.get(), null);
      assert.deepEqual(events, []);
      assert.equal(windowEvents, 0);
      assert.deepEqual(calls, []);
      assert.deepEqual(win.dataLayer, []);

      api.reset();
      assert.ok(visible(root, ".banner"), "reset shows the banner again");
      clickButton(root, "Reject all");
      clickButton(root, "Settings");
      clickButton(root, "Save choices");
      assert.equal(doc.cookie, "");
      assert.deepEqual(calls, []);
    });

    it("overrides the title and description for the current locale only", async () => {
      const dom = setupDom();
      const api = make({
        preview: true,
        locale: "en",
        title: "  Hello  ",
        description: "Custom text",
        config: { texts: { en: { title: "Remote", description: "Remote" } } },
      });
      await api.ready;
      const root = shadowOf(dom.window.document)!;
      assert.equal(root.querySelector(".banner h2, .banner .title")?.textContent, "Hello");
      assert.match(root.querySelector(".banner")!.textContent!, /Custom text/);
      assert.match(root.querySelector(".banner")!.textContent!, /Accept all/);
    });

    it("renders the texts as text, not HTML", async () => {
      const dom = setupDom();
      const api = make({ preview: true, title: "<img src=x onerror=alert(1)>" });
      await api.ready;
      const root = shadowOf(dom.window.document)!;
      assert.equal(root.querySelector(".banner img"), null);
    });

    it("ignores empty overrides", async () => {
      const dom = setupDom();
      const api = make({ preview: true, locale: "en", title: "  ", description: "" });
      await api.ready;
      assert.match(shadowOf(dom.window.document)!.querySelector(".banner")!.textContent!, /We value your privacy/);
    });
  });
});

function writeStored(doc: Document) {
  doc.cookie = `bitsnap_consent=${encodeState({ id: "abcdefgh12345678", ts: 1, bv: 1, c: { analytics: true, marketing: false, preferences: false } })}; Path=/`;
}

describe("banner impression", () => {
  const collect = "https://collect.example.test";
  let calls: { url: string; body: Record<string, unknown> }[];

  function mockFetch(version = 7) {
    calls = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/consent/config")) {
        return new Response(JSON.stringify({ enabled: true, config: { ...config, version } }));
      }
      calls.push({ url: String(url), body: JSON.parse(init!.body as string) });
      return new Response("ok");
    }) as typeof fetch;
  }
  const project = { config: undefined, projectKey: "pk_Ab12Cd", apiHost: "https://api.example.test", collectHost: collect };
  const shown = () => calls.filter((call) => call.body.action === "shown");
  const stored = (bv: number) =>
    `bitsnap_consent=${encodeState({ id: "abc", ts: 1, bv, c: { analytics: false, marketing: true, preferences: false } })}; Path=/`;

  it("reports the banner opening on its own, once, with no id and no choice", async () => {
    setupDom();
    mockFetch();
    await make(project).ready;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${collect}/consent`);
    const body = calls[0].body;
    assert.deepEqual(Object.keys(body).sort(), ["action", "bv", "host", "k", "ts"]);
    assert.equal(body.k, "Ab12Cd");
    assert.equal(body.action, "shown");
    assert.equal(body.bv, 7);
    assert.equal(body.host, "shop.example.test");
    assert.ok(Math.abs((body.ts as number) - Date.now() / 1000) < 5, "unix seconds");
  });

  it("reports it again as an impression when the stored choice is for an older banner version", async () => {
    const dom = setupDom();
    dom.window.document.cookie = stored(1);
    mockFetch(2);
    await make(project).ready;
    assert.equal(shown().length, 1);
    assert.equal(shown()[0].body.bv, 2);
  });

  it("does not report a banner that a choice made before ready closed at once", async () => {
    setupDom();
    mockFetch();
    const api = make(project);
    api.acceptAll();
    await api.ready;
    assert.equal(shown().length, 0);
    assert.equal(calls.filter((call) => call.body.action === "accept_all").length, 1);
  });

  it("lets a keyless controller not take the impression of a keyed one", async () => {
    setupDom();
    mockFetch();
    await make({ ...project, projectKey: undefined }).ready;
    await make(project).ready;
    assert.equal(shown().length, 1);
  });

  it("does not report when the config fails to load and a choice is stored", async () => {
    const dom = setupDom();
    dom.window.document.cookie = stored(7);
    calls = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/consent/config")) return new Response("nope", { status: 404 });
      calls.push({ url: String(url), body: JSON.parse(init!.body as string) });
      return new Response("ok");
    }) as typeof fetch;
    await make(project).ready;
    assert.equal(shown().length, 0);
  });

  it("counts an open() made before ready only when the banner would open anyway", async () => {
    const dom = setupDom();
    dom.window.document.cookie = stored(7);
    mockFetch();
    const withChoice = make(project);
    withChoice.open();
    await withChoice.ready;
    assert.equal(shown().length, 0, "a valid choice: the open is manual");

    setupDom();
    mockFetch();
    const fresh = make(project);
    fresh.open();
    await fresh.ready;
    assert.equal(shown().length, 1, "no choice: the banner opens on its own, once");
  });

  it("does not report when a valid choice is stored", async () => {
    const dom = setupDom();
    dom.window.document.cookie = stored(7);
    mockFetch();
    const api = make(project);
    await api.ready;
    assert.equal(shadowOf(dom.window.document), null);
    assert.deepEqual(calls, []);
  });

  it("does not report a manual open, a footer link or a reset", async () => {
    const dom = setupDom(`<a href="#" data-bitsnap-consent-open id="o">Cookie settings</a>`);
    dom.window.document.cookie = stored(7);
    mockFetch();
    const api = make(project);
    await api.ready;
    api.open();
    (dom.window.document.getElementById("o") as HTMLElement).click();
    api.reset();
    assert.deepEqual(shown(), []);
  });

  it("does not report without a project key", async () => {
    setupDom();
    mockFetch();
    await make({ collectHost: collect }).ready;
    assert.deepEqual(calls, []);
  });

  it("does not report a preview, or a banner the project switched off", async () => {
    setupDom();
    mockFetch();
    await make({ ...project, preview: true }).ready;
    assert.deepEqual(calls, []);

    setupDom();
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/consent/config")) return new Response(JSON.stringify({ enabled: false, config: { version: 3 } }));
      calls.push({ url: String(url), body: JSON.parse(init!.body as string) });
      return new Response("ok");
    }) as typeof fetch;
    await make(project).ready;
    assert.deepEqual(calls, []);
  });

  it("sends one per page load however many controllers run, and the choice still logs", async () => {
    const dom = setupDom();
    mockFetch();
    const first = make(project);
    first.destroy(); // like a React StrictMode double effect
    const second = make(project);
    const third = make(project);
    await Promise.all([first.ready, second.ready, third.ready]);
    assert.equal(shown().length, 1);
    clickButton(shadowOf(dom.window.document)!, "Accept all");
    assert.equal(calls.filter((call) => call.body.action === "accept_all").length, 1);
    assert.equal(shown().length, 1);
  });
});
