import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { create, fromBinary, toBinary, type MessageInitShape } from "@bufbuild/protobuf";
import { EmptySchema } from "@bufbuild/protobuf/wkt";
import { setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  GetNotificationSettingsDetailsRequestSchema,
  GetNotificationSettingsDetailsResponseSchema,
  NotificationMethod,
  UpdateNotificationSettingsRequestSchema,
  type UpdateNotificationSettingsRequest,
} from "../gen/proto/public/v1/public_api_pb";
import { setLocale } from "../components/checkout/locale";
import { setPanelConfig } from "./config.ts";

const page = setupReactPage("https://shop.example.test/panel");

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let PanelProvider: typeof import("./PanelProvider.tsx").PanelProvider;
let NotificationSettings: typeof import("./notifications/NotificationSettings.tsx").NotificationSettings;
let PanelNotifications: typeof import("./components/PanelNotifications.tsx").default;
let PanelProfile: typeof import("./components/PanelProfile.tsx").default;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ PanelProvider } = await import("./PanelProvider.tsx"));
  ({ NotificationSettings } = await import("./notifications/NotificationSettings.tsx"));
  PanelNotifications = (await import("./components/PanelNotifications.tsx")).default;
  PanelProfile = (await import("./components/PanelProfile.tsx")).default;
});

const SESSION_KEY = `bitsnap-panel-session:${encodeURIComponent("https://bitsnap.pl")}:${encodeURIComponent(TEST_KEY)}`;
const { EMAIL, SMS, PUSH } = NotificationMethod;

type Details = MessageInitShape<typeof GetNotificationSettingsDetailsResponseSchema>;
let details: () => Details | Response;
const reads: Array<{ projectId: string; accessToken: string }> = [];
const saves: UpdateNotificationSettingsRequest[] = [];
let saveAnswer: () => Response | undefined;
const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;
const originalWarn = console.warn;

const settings = (over: Partial<Details> = {}): Details => ({
  projectId: TEST_KEY,
  name: "Sklep",
  availableMethods: [EMAIL, SMS, PUSH],
  enabledMethods: [EMAIL],
  groups: [],
  ...over,
});

beforeEach(() => {
  setLocale("pl");
  setPanelConfig({ projectID: TEST_KEY, host: undefined });
  page.win.localStorage.setItem(SESSION_KEY, "panel-token");
  reads.length = 0;
  saves.length = 0;
  details = () => settings();
  saveAnswer = () => undefined;
  globalThis.fetch = (async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    const body = new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer());
    if (url.endsWith("/public_api.v1.PublicApiService/GetNotificationSettingsDetails")) {
      const req = fromBinary(GetNotificationSettingsDetailsRequestSchema, body);
      reads.push({ projectId: req.projectId, accessToken: req.accessToken });
      const answer = details();
      if (answer instanceof Response) return answer;
      return new Response(
        toBinary(GetNotificationSettingsDetailsResponseSchema, create(GetNotificationSettingsDetailsResponseSchema, answer)) as BodyInit,
        { status: 200, headers: { "Content-Type": "application/proto" } },
      );
    }
    if (url.endsWith("/public_api.v1.PublicApiService/UpdateNotificationSettings")) {
      saves.push(fromBinary(UpdateNotificationSettingsRequestSchema, body));
      const answer = saveAnswer();
      if (answer) return answer;
      return new Response(toBinary(EmptySchema, create(EmptySchema)) as BodyInit, {
        status: 200,
        headers: { "Content-Type": "application/proto" },
      });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  console.error = () => {};
  console.warn = () => {};
});

afterEach(async () => {
  console.error = originalError;
  console.warn = originalWarn;
  setLocale(undefined);
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  page.win.localStorage.clear();
});

const settle = (ms = 60) => React.act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function mount(node?: React.ReactNode) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () =>
    root.render(<PanelProvider analytics={false}>{node ?? <NotificationSettings />}</PanelProvider>),
  );
  await settle();
  await settle();
  return container;
}

const switches = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
/** The switch whose <label> reads `text`. */
function switchFor(container: HTMLElement, text: string) {
  const label = [...container.querySelectorAll("label")].find((l) => l.textContent === text);
  assert.ok(label, `no label "${text}" in ${container.innerHTML}`);
  const control = page.win.document.getElementById(label!.htmlFor) as HTMLButtonElement | null;
  assert.ok(control, `label "${text}" points at nothing`);
  return control!;
}
const newsletterBlock = (container: HTMLElement) => container.querySelector("[data-bitsnap-newsletter-switch]");

describe("panel notification settings: the newsletter switch", () => {
  it("is hidden when the server sends no newsletter field (no confirmed subscription, or an older server)", async () => {
    const container = await mount();
    assert.deepEqual(reads, [{ projectId: TEST_KEY, accessToken: "panel-token" }]);
    assert.equal(newsletterBlock(container), null);
    assert.equal(switches(container).length, 3);
    assert.equal(switchFor(container, "E-mail").getAttribute("aria-checked"), "true");
    assert.equal(switchFor(container, "SMS").getAttribute("aria-checked"), "false");
    assert.doesNotMatch(container.textContent ?? "", /newsletter/i);
  });

  it("is on and usable while subscribed; switching it off sends newsletter: false with the channels unchanged", async () => {
    let subscribed = true;
    details = () => settings({ newsletterSubscribed: subscribed, newsletterSignupUrl: subscribed ? undefined : "https://sklep.acme.pl/" });
    const container = await mount();
    const toggle = switchFor(container, "Newsletter sklepu");
    assert.equal(toggle.getAttribute("aria-checked"), "true");
    assert.equal(toggle.disabled, false);
    assert.match(newsletterBlock(container)!.textContent ?? "", /Dostajesz newsletter tego sklepu/);
    // The e-mail switch tells that switching it off also unsubscribes.
    const email = switchFor(container, "E-mail");
    const note = page.win.document.getElementById(email.getAttribute("aria-describedby") ?? "");
    assert.match(note?.textContent ?? "", /wypisuje też z newslettera/);

    subscribed = false;
    await React.act(async () => toggle.click());
    await settle();
    await settle();
    assert.equal(saves.length, 1);
    assert.equal(saves[0].newsletterSubscribed, false);
    assert.deepEqual(saves[0].enabledMethods, [EMAIL]);
    assert.deepEqual(saves[0].modifications, []);
    assert.equal(saves[0].projectId, TEST_KEY);
    assert.equal(saves[0].accessToken, "panel-token");
    // The read after the save shows it withdrawn.
    assert.equal(reads.length, 2);
    const after = switchFor(container, "Newsletter sklepu");
    assert.equal(after.getAttribute("aria-checked"), "false");
    assert.equal(after.disabled, true);
    assert.match(container.textContent ?? "", /Zapisano zmiany/);
  });

  it("withdrawn: off, disabled, with a link to sign up again on the shop's site", async () => {
    details = () => settings({ newsletterSubscribed: false, newsletterSignupUrl: "https://sklep.acme.pl/" });
    const container = await mount();
    const toggle = switchFor(container, "Newsletter sklepu");
    assert.equal(toggle.getAttribute("aria-checked"), "false");
    assert.equal(toggle.disabled, true);
    const describedBy = page.win.document.getElementById(toggle.getAttribute("aria-describedby") ?? "");
    assert.match(describedBy?.textContent ?? "", /Nie dostajesz newslettera tego sklepu/);
    const link = newsletterBlock(container)!.querySelector("a");
    assert.equal(link?.textContent, "Zapisz się ponownie na stronie sklepu");
    assert.equal(link?.getAttribute("href"), "https://sklep.acme.pl/");
    assert.equal(link?.getAttribute("rel"), "noopener noreferrer");
    await React.act(async () => toggle.click());
    await settle();
    assert.equal(saves.length, 0, "a disabled switch never subscribes");
    // No e-mail note: there is nothing to unsubscribe from.
    assert.equal(switchFor(container, "E-mail").getAttribute("aria-describedby"), null);
  });

  it("withdrawn without a usable URL: the hint names the shop's form, no link", async () => {
    details = () => settings({ newsletterSubscribed: false, newsletterSignupUrl: "javascript:alert(1)" });
    const container = await mount();
    assert.equal(newsletterBlock(container)!.querySelector("a"), null);
    assert.match(newsletterBlock(container)!.textContent ?? "", /użyj formularza newslettera na stronie sklepu/);
  });

  it("speaks English with an English locale", async () => {
    setLocale("en");
    details = () => settings({ newsletterSubscribed: false, newsletterSignupUrl: "https://sklep.acme.pl/" });
    const container = await mount();
    assert.equal(switchFor(container, "Shop newsletter").disabled, true);
    assert.equal(newsletterBlock(container)!.querySelector("a")?.textContent, "Subscribe again on the shop's website");
    assert.ok(switchFor(container, "Phone notifications"));
  });
});

describe("panel notification settings: the channels", () => {
  it("switching e-mail off saves the remaining channels without a newsletter field", async () => {
    details = () => settings({ enabledMethods: [EMAIL, SMS], newsletterSubscribed: true });
    const container = await mount();
    await React.act(async () => switchFor(container, "E-mail").click());
    await settle();
    assert.equal(saves.length, 1);
    assert.deepEqual(saves[0].enabledMethods, [SMS]);
    assert.equal(saves[0].newsletterSubscribed, undefined, "the server decides the newsletter from the e-mail switch");
  });

  it("switching a channel on adds it", async () => {
    const container = await mount();
    await React.act(async () => switchFor(container, "Powiadomienia na telefon").click());
    await settle();
    assert.deepEqual([...saves[0].enabledMethods].sort(), [EMAIL, PUSH].sort());
  });

  it("shows only the channels the shop offers", async () => {
    details = () => settings({ availableMethods: [EMAIL] });
    const container = await mount();
    assert.equal(switches(container).length, 1);
  });

  it("a failed save puts the switch back and says so", async () => {
    saveAnswer = () =>
      new Response(JSON.stringify({ code: "internal", message: "boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    const container = await mount();
    await React.act(async () => switchFor(container, "SMS").click());
    await settle();
    await settle();
    assert.equal(switchFor(container, "SMS").getAttribute("aria-checked"), "false");
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Nie udało się zapisać zmian/);
  });
});

describe("panel notification settings: nothing to show", () => {
  it("renders nothing without a panel session (and does not ask)", async () => {
    page.win.localStorage.clear();
    const container = await mount();
    assert.equal(reads.length, 0);
    assert.equal(container.innerHTML, '<div class="bitsnap-react"></div>');
  });

  it("renders nothing when the shop has no notification settings (NotFound) or the server is older", async () => {
    details = () =>
      new Response(JSON.stringify({ code: "not_found", message: "PROJECT_NOT_FOUND" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    const container = await mount();
    assert.equal(reads.length, 1, "no retries");
    assert.equal(switches(container).length, 0);
    assert.equal(container.innerHTML, '<div class="bitsnap-react"></div>');
  });

  it("the notifications screen falls back to the 'unavailable' text", async () => {
    details = () => new Response(null, { status: 404 });
    const container = await mount(<PanelNotifications />);
    assert.match(container.textContent ?? "", /Ustawienia powiadomień nie są obecnie dostępne/);
    assert.equal(switches(container).length, 0);
  });

  it("the account screen shows the settings under 'Powiadomienia'", async () => {
    details = () => settings({ newsletterSubscribed: true });
    const container = await mount(<PanelProfile email="anna@example.com" logout={() => {}} />);
    assert.match(container.querySelector("[data-bitsnap-notification-settings] h4")?.textContent ?? "", /Powiadomienia/);
    assert.ok(switchFor(container, "Newsletter sklepu"));
  });
});
