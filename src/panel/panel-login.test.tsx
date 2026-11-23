import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import {
  create,
  fromBinary,
  toBinary,
  type DescMessage,
  type MessageInitShape,
} from "@bufbuild/protobuf";
import { resetTracker } from "@/src/analytics/core";
import { setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  FailureMessage,
  UserPanelLoginRequestSchema,
  UserPanelLoginResponseSchema,
  UserPanelLoginWithCodeRequestSchema,
  UserPanelLoginWithCodeResponseSchema,
} from "../gen/proto/public/v1/public_api_pb";
import { resetPanelOriginCache } from "../captcha/panel-origin.ts";
import { setPanelConfig } from "./config.ts";
import { panelFailureKind } from "./login-adapter.ts";
import { resolvePanelLoginTexts } from "./login-texts.ts";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let PanelProvider: typeof import("./PanelProvider.tsx").PanelProvider;
let PanelLogin: typeof import("./components/PanelLogin.tsx").PanelLogin;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ PanelProvider } = await import("./PanelProvider.tsx"));
  ({ PanelLogin } = await import("./components/PanelLogin.tsx"));
});

const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;
const originalWarn = console.warn;
const texts = resolvePanelLoginTexts("pl");

type Result = MessageInitShape<typeof UserPanelLoginResponseSchema>["result"];
type CodeResult = MessageInitShape<typeof UserPanelLoginWithCodeResponseSchema>["result"];

let loginResult: Result;
let codeResult: CodeResult;
let loginRequests: Array<ReturnType<typeof readLogin>>;
let codeRequests: Array<ReturnType<typeof readCode>>;
let throwOnCode = false;
/** What `GET /api/panel-origin` answers: a body, or "fail" for a network error. */
let panelOriginAnswer: unknown = { panelOrigin: "" };

const readLogin = (body: Uint8Array) => fromBinary(UserPanelLoginRequestSchema, body);
const readCode = (body: Uint8Array) => fromBinary(UserPanelLoginWithCodeRequestSchema, body);

function proto<T extends DescMessage>(schema: T, init: MessageInitShape<T>) {
  return new Response(toBinary(schema, create(schema, init)) as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/proto" },
  });
}

beforeEach(() => {
  resetTracker();
  setPanelConfig({ projectID: TEST_KEY, host: undefined });
  page.win.localStorage.clear();
  page.win.sessionStorage.clear();
  loginRequests = [];
  codeRequests = [];
  throwOnCode = false;
  panelOriginAnswer = { panelOrigin: "" };
  resetPanelOriginCache();
  loginResult = { case: "success", value: { retryIn: 60, challengeId: "challenge-7" } };
  codeResult = { case: "accessToken", value: "panel-token" };
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/panel-origin")) {
      if (panelOriginAnswer === "fail") throw new TypeError("Failed to fetch");
      if (panelOriginAnswer === "404" || panelOriginAnswer === "503") {
        return new Response("no", { status: Number(panelOriginAnswer) });
      }
      return new Response(JSON.stringify(panelOriginAnswer), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.endsWith("/UserPanelLogin")) {
      loginRequests.push(readLogin(init!.body as Uint8Array));
      return proto(UserPanelLoginResponseSchema, { result: loginResult });
    }
    if (url.endsWith("/UserPanelLoginWithCode")) {
      codeRequests.push(readCode(init!.body as Uint8Array));
      if (throwOnCode) throw new TypeError("Failed to fetch");
      return proto(UserPanelLoginWithCodeResponseSchema, { result: codeResult });
    }
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  console.error = () => {};
  console.warn = () => {};
});

afterEach(async () => {
  console.error = originalError;
  console.warn = originalWarn;
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
  resetTracker();
});

const settle = (ms = 40) =>
  React.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    // The hosted challenge reports this when the server kill switch is off.
    page.win.dispatchEvent(new page.win.MessageEvent("message", {
      origin: "https://bitsnap.pl",
      source: page.win.document.querySelector("iframe")?.contentWindow ?? null,
      data: { type: "bitsnap:turnstile", action: "panel_login", disabled: true },
    }));
  });
const doc = () => page.win.document;
const emailInput = () => doc().querySelector<HTMLInputElement>('input[type="email"]')!;
const codeInput = () => doc().querySelector<HTMLInputElement>("#verify-code")!;
const alertText = () => doc().querySelector('[role="alert"]')?.textContent ?? "";
const buttonWith = (label: string) =>
  Array.from(doc().querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    button.textContent?.includes(label),
  );

async function mount(props: React.ComponentProps<typeof PanelLogin> = {}) {
  const container = doc().createElement("div");
  doc().body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () =>
    root.render(
      <PanelProvider analytics={false}>
        <PanelLogin {...props} />
      </PanelProvider>,
    ),
  );
  await settle();
}

async function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(page.win.HTMLInputElement.prototype, "value")!.set!;
  await React.act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new page.win.Event("input", { bubbles: true }));
  });
}

const submit = (form: HTMLFormElement) =>
  React.act(async () => void form.dispatchEvent(new page.win.Event("submit", { bubbles: true, cancelable: true })));

async function requestCode(address = "jane@example.com") {
  await type(emailInput(), address);
  await submit(doc().querySelector("form")!);
  await settle();
}

describe("panel failure mapping", () => {
  it("gives every FailureMessage its own kind", () => {
    const expected: Record<string, string> = {
      [FailureMessage.UNKNOWN]: "unknown",
      [FailureMessage.EMAIL_NOT_FOUND]: "emailNotFound",
      [FailureMessage.INCORRECT_EMAIL]: "invalidEmail",
      [FailureMessage.INCORRECT_CODE]: "wrongCode",
      [FailureMessage.GENERATE_ACCESS_TOKEN_FAILED]: "unknown",
      [FailureMessage.DELIVERY_METHOD_UNAVAILABLE]: "deliveryUnavailable",
      [FailureMessage.DELIVERY_FAILED]: "deliveryFailed",
      [FailureMessage.RATE_LIMITED]: "rateLimited",
      [FailureMessage.CODE_EXPIRED]: "expired",
      [FailureMessage.TOO_MANY_ATTEMPTS]: "tooManyAttempts",
      [FailureMessage.UNAUTHORIZED]: "wrongShop",
    };
    for (const [value, kind] of Object.entries(expected)) {
      assert.equal(panelFailureKind(Number(value)), kind, FailureMessage[Number(value)]);
    }
  });

  it("tells a refusal at send time from a refusal of a code", () => {
    assert.equal(panelFailureKind(FailureMessage.UNAUTHORIZED, "send"), "sendRefused");
    assert.equal(panelFailureKind(FailureMessage.UNAUTHORIZED, "verify"), "wrongShop");
    assert.equal(panelFailureKind(FailureMessage.RATE_LIMITED, "send"), "rateLimited");
  });
});

describe("PanelLogin", () => {
  it("sends the e-mail, then the code with the e-mail and the challenge of that attempt", async () => {
    await mount();
    await requestCode();
    assert.equal(loginRequests.length, 1);
    assert.equal(loginRequests[0]!.email, "jane@example.com");

    await type(codeInput(), "012345");
    await settle();
    assert.equal(codeRequests.length, 1, "auto-submitted on the sixth digit");
    assert.equal(codeRequests[0]!.code, 12345);
    assert.equal(codeRequests[0]!.email, "jane@example.com");
    assert.equal(codeRequests[0]!.challengeId, "challenge-7");
  });

  it("stores the session as before once the code is accepted", async () => {
    await mount();
    await requestCode();
    await type(codeInput(), "123456");
    await settle(200);
    const keys = Array.from({ length: page.win.localStorage.length }, (_, i) => page.win.localStorage.key(i)!);
    const sessionKey = keys.find((key) => key.startsWith("bitsnap-panel-session:"))!;
    assert.equal(page.win.localStorage.getItem(sessionKey), "panel-token");
    const emailKey = keys.find((key) => key.startsWith("bitsnap-panel-email:"))!;
    assert.equal(page.win.localStorage.getItem(emailKey), "jane@example.com");
    assert.equal(
      Array.from({ length: page.win.sessionStorage.length }, (_, i) => page.win.sessionStorage.key(i)!).filter(
        (key) => key.startsWith("bitsnap-login-pending:"),
      ).length,
      0,
      "the pending step is gone",
    );
  });

  it("maps each failure of the code request to its own message", async () => {
    const cases: Array<[FailureMessage, RegExp]> = [
      [FailureMessage.INCORRECT_CODE, /Nieprawidłowy kod/],
      [FailureMessage.CODE_EXPIRED, /Kod wygasł/],
      [FailureMessage.TOO_MANY_ATTEMPTS, /Zbyt wiele błędnych prób/],
      [FailureMessage.RATE_LIMITED, /Zbyt wiele prób\. Spróbuj ponownie za 60\ss/],
      [FailureMessage.EMAIL_NOT_FOUND, /Nie znaleźliśmy konta z tym adresem e-mail\./],
    ];
    for (const [failure, expected] of cases) {
      codeResult = { case: "failure", value: failure };
      await mount();
      await requestCode();
      await type(codeInput(), "123456");
      await settle();
      assert.match(alertText(), expected, FailureMessage[failure]);
      assert.doesNotMatch(alertText(), /Nieprawidłowy adres email/);
      await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
      doc().body.innerHTML = "";
      page.win.sessionStorage.clear();
    }
  });

  it("maps each failure of the send request to its own message", async () => {
    const cases: Array<[FailureMessage, string]> = [
      [FailureMessage.EMAIL_NOT_FOUND, "Nie znaleźliśmy konta z tym adresem e-mail."],
      [FailureMessage.DELIVERY_FAILED, texts.deliveryFailed],
      [FailureMessage.DELIVERY_METHOD_UNAVAILABLE, texts.deliveryUnavailable],
      [FailureMessage.INCORRECT_EMAIL, texts.invalidEmail],
    ];
    for (const [failure, expected] of cases) {
      loginResult = { case: "failure", value: failure };
      await mount();
      await requestCode("nobody@example.com");
      assert.equal(alertText(), expected, FailureMessage[failure]);
      await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
      doc().body.innerHTML = "";
    }
  });

  it("sends the shop's project id with the code request and with the code", async () => {
    await mount();
    await requestCode();
    assert.equal(loginRequests[0]!.projectId, TEST_KEY);
    await type(codeInput(), "012345");
    await settle();
    assert.equal(codeRequests.length, 1);
    assert.equal(codeRequests[0]!.projectId, TEST_KEY);
  });

  it("sends no project id from the all-shops panel", async () => {
    setPanelConfig({ projectID: "", host: undefined });
    await mount();
    await requestCode();
    await type(codeInput(), "012345");
    await settle();
    assert.equal(loginRequests.length, 1);
    assert.equal(loginRequests[0]!.projectId, undefined);
    assert.equal(codeRequests.length, 1);
    assert.equal(codeRequests[0]!.projectId, undefined);
  });

  it("says the code is for another shop when the server refuses it, and offers a new code", async () => {
    codeResult = { case: "failure", value: FailureMessage.UNAUTHORIZED };
    await mount();
    await requestCode();
    await type(codeInput(), "123456");
    await settle();
    assert.equal(
      alertText(),
      "Ten kod logowania jest do innego sklepu. Poproś o nowy kod na tej stronie.",
    );
    assert.equal(alertText(), texts.wrongShop);
    assert.notEqual(alertText(), texts.generic);
    assert.ok(buttonWith(texts.resendNew), "a new code can be requested");
    assert.equal(codeInput().disabled, true);
  });

  it("says sign-in is unavailable when the code request itself is refused, with no new-code offer", async () => {
    loginResult = { case: "failure", value: FailureMessage.UNAUTHORIZED };
    await mount();
    await requestCode();
    assert.equal(
      alertText(),
      "Logowanie na tej stronie jest teraz niedostępne. Skontaktuj się ze sklepem.",
    );
    assert.equal(alertText(), texts.sendRefused);
    assert.notEqual(alertText(), texts.wrongShop);
    assert.equal(buttonWith(texts.resendNew), undefined);
    assert.ok(emailInput(), "still on the e-mail step");
    assert.equal(codeRequests.length, 0);
  });

  it("says both in English with an English locale", async () => {
    loginResult = { case: "failure", value: FailureMessage.UNAUTHORIZED };
    await mount({ locale: "en" });
    await requestCode();
    assert.equal(
      alertText(),
      "Signing in on this page is not available right now. Please contact the shop.",
    );
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    doc().body.innerHTML = "";
    page.win.sessionStorage.clear();

    loginResult = { case: "success", value: { retryIn: 60, challengeId: "challenge-7" } };
    codeResult = { case: "failure", value: FailureMessage.UNAUTHORIZED };
    await mount({ locale: "en" });
    await requestCode();
    await type(codeInput(), "123456");
    await settle();
    assert.equal(
      alertText(),
      "This sign-in code is for another shop. Request a new code on this page.",
    );
  });

  it("tells the customer when the request does not get through", async () => {
    throwOnCode = true;
    await mount();
    await requestCode();
    await type(codeInput(), "123456");
    await settle();
    assert.equal(alertText(), texts.network);
  });

  it("asks for the e-mail with 'Mam już kod' so the request is bound to it", async () => {
    await mount();
    await React.act(async () => buttonWith("Mam już kod")!.click());
    await settle();
    assert.ok(emailInput(), "e-mail field next to the code");
    await type(emailInput(), "jane@example.com");
    await type(codeInput(), "123456");
    await settle();
    assert.equal(codeRequests.length, 1);
    assert.equal(codeRequests[0]!.email, "jane@example.com");
    assert.equal(codeRequests[0]!.challengeId, undefined);
  });

  it("returns to the code step after a reload", async () => {
    await mount();
    await requestCode();
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    doc().body.innerHTML = "";

    await mount();
    assert.ok(codeInput(), "back on the code step");
    assert.match(doc().body.textContent ?? "", /jane@example\.com/);
    await type(codeInput(), "123456");
    await settle();
    assert.equal(codeRequests[0]?.challengeId, "challenge-7");
  });

  it("speaks English with an English locale and accepts text overrides", async () => {
    await mount({ locale: "en-US", texts: { title: "Welcome back" } });
    assert.match(doc().body.textContent ?? "", /Welcome back/);
    assert.match(doc().body.textContent ?? "", /Send code/);
    assert.doesNotMatch(doc().body.textContent ?? "", /Wyślij kod/);
  });

  it("does not use a fixed minimum width", async () => {
    await mount();
    assert.equal(doc().querySelector(".min-w-sm"), null);
  });
  it("shows a theme logo in the card, with alt text in the page language", async () => {
    await mount({ logoUrl: "https://cdn.test/panel.png" });
    const logo = doc().querySelector<HTMLImageElement>("main img");
    assert.equal(logo?.getAttribute("src"), "https://cdn.test/panel.png");
    assert.equal(logo?.alt, "Logo sklepu");
    await mount({ logoUrl: "https://cdn.test/panel.png", locale: "en" });
    const logos = doc().querySelectorAll<HTMLImageElement>("main img");
    assert.equal(logos[logos.length - 1]?.alt, "Shop logo");
  });

  it("names the Bitsnap logo 'Bitsnap' when the shop has no logo", async () => {
    await mount();
    await settle();
    assert.equal(doc().querySelector('[role="img"][aria-label="Bitsnap"]') != null, true);
    assert.equal(doc().querySelector("main img"), null);
  });

  it("saves the session under * when projectID is empty (global panel)", async () => {
    setPanelConfig({ projectID: "", host: undefined });
    await mount();
    await requestCode();
    await type(codeInput(), "123456");
    await settle(200);
    const host = encodeURIComponent("https://bitsnap.pl");
    assert.equal(
      page.win.localStorage.getItem(`bitsnap-panel-session:${host}:*`),
      "panel-token",
    );
    assert.equal(
      page.win.localStorage.getItem(`bitsnap-panel-email:${host}:*`),
      "jane@example.com",
    );
  });

  it("redirects an already-signed-in empty-project visit from /panel/login to /panel/", async () => {
    setPanelConfig({ projectID: "", host: undefined });
    const host = encodeURIComponent("https://bitsnap.pl");
    page.win.localStorage.setItem(`bitsnap-panel-session:${host}:*`, "global-token");

    const navigated: string[] = [];
    const fakeLocation = {
      href: "https://bitsnap.pl/panel/login",
      origin: "https://bitsnap.pl",
      search: "",
    };
    Object.defineProperty(fakeLocation, "href", {
      get: () => "https://bitsnap.pl/panel/login",
      set: (value: string) => {
        navigated.push(value);
      },
      configurable: true,
    });
    const savedWindow = globalThis.window;
    (globalThis as { window: unknown }).window = new Proxy(page.win, {
      get(target, prop) {
        if (prop === "location") return fakeLocation;
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      await mount();
      assert.deepEqual(navigated, ["https://bitsnap.pl/panel/"]);
    } finally {
      (globalThis as { window: unknown }).window = savedWindow;
    }
  });

  it("does not read the global * session on a shop login page", async () => {
    setPanelConfig({ projectID: TEST_KEY, host: undefined });
    const host = encodeURIComponent("https://bitsnap.pl");
    page.win.localStorage.setItem(`bitsnap-panel-session:${host}:*`, "global-token");

    const navigated: string[] = [];
    const fakeLocation = {
      origin: "https://bitsnap.pl",
      search: "",
      get href() {
        return "https://bitsnap.pl/panel/demo/login";
      },
      set href(value: string) {
        navigated.push(value);
      },
    };
    const savedWindow = globalThis.window;
    (globalThis as { window: unknown }).window = new Proxy(page.win, {
      get(target, prop) {
        if (prop === "location") return fakeLocation;
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      await mount();
      assert.deepEqual(navigated, []);
    } finally {
      (globalThis as { window: unknown }).window = savedWindow;
    }
  });

  it("does not read a shop session on the global (empty projectID) login page", async () => {
    setPanelConfig({ projectID: "", host: undefined });
    const host = encodeURIComponent("https://bitsnap.pl");
    page.win.localStorage.setItem(
      `bitsnap-panel-session:${host}:${encodeURIComponent(TEST_KEY)}`,
      "shop-token",
    );

    const navigated: string[] = [];
    const fakeLocation = {
      origin: "https://bitsnap.pl",
      search: "",
      get href() {
        return "https://bitsnap.pl/panel/login";
      },
      set href(value: string) {
        navigated.push(value);
      },
    };
    const savedWindow = globalThis.window;
    (globalThis as { window: unknown }).window = new Proxy(page.win, {
      get(target, prop) {
        if (prop === "location") return fakeLocation;
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      await mount();
      assert.deepEqual(navigated, []);
    } finally {
      (globalThis as { window: unknown }).window = savedWindow;
    }
  });
});

describe("PanelLogin: where the security check is framed from", () => {
  const PANEL = "https://konto.bitsnap.pl";
  const API = "https://bitsnap.pl";
  const frame = () => doc().querySelector("iframe");
  const frameFrom = (origin: string, message: Record<string, unknown> = { disabled: true }) =>
    React.act(async () => {
      page.win.dispatchEvent(new page.win.MessageEvent("message", {
        origin,
        source: frame()?.contentWindow ?? null,
        data: { type: "bitsnap:turnstile", action: "panel_login", ...message },
      }));
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
  async function askForCode() {
    await type(emailInput(), "jane@example.com");
    await submit(doc().querySelector("form")!);
    await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
  }

  it("frames the panel origin and takes the widget's message from that origin only", async () => {
    panelOriginAnswer = { panelOrigin: PANEL };
    await mount();
    await askForCode();
    assert.ok(frame()?.getAttribute("src")?.startsWith(`${PANEL}/challenge?action=panel_login&`), frame()?.getAttribute("src") ?? "no iframe");
    await frameFrom(API);
    await frameFrom("https://evil.example");
    await frameFrom("*");
    assert.equal(loginRequests.length, 0, "a message from the API origin or any other origin is ignored");
    await frameFrom(PANEL);
    assert.equal(loginRequests.length, 1, "the panel origin's message goes through");
  });

  it("frames the API origin as before while the server has no panel origin", async () => {
    await mount();
    await askForCode();
    assert.ok(frame()?.getAttribute("src")?.startsWith(`${API}/challenge?action=panel_login&`));
    await frameFrom(PANEL);
    assert.equal(loginRequests.length, 0);
    await frameFrom(API);
    assert.equal(loginRequests.length, 1);
  });

  it("falls back to the API origin when the panel origin cannot be read", async () => {
    panelOriginAnswer = "fail";
    await mount();
    await askForCode();
    assert.ok(frame()?.getAttribute("src")?.startsWith(`${API}/challenge?action=panel_login&`));
    await frameFrom(API);
    assert.equal(loginRequests.length, 1);
  });

  it("ignores an answer that is not an exact http(s) origin", async () => {
    panelOriginAnswer = { panelOrigin: "javascript:alert(1)" };
    await mount();
    await askForCode();
    assert.ok(frame()?.getAttribute("src")?.startsWith(`${API}/challenge?action=panel_login&`));
  });

  it("frames the API origin when an older server answers 404, and when it answers 503", async () => {
    for (const answer of ["404", "503"]) {
      panelOriginAnswer = answer;
      resetPanelOriginCache();
      await mount();
      await askForCode();
      assert.ok(frame()?.getAttribute("src")?.startsWith(`${API}/challenge?action=panel_login&`), answer);
      await frameFrom(API);
      assert.equal(loginRequests.length, 1, answer);
      loginRequests = [];
      await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
      doc().body.innerHTML = "";
      page.win.localStorage.clear();
      page.win.sessionStorage.clear();
    }
  });

  for (const answer of ["fail", "404", "503"]) {
    it(`keeps the same challenge frame across re-renders long after a failed origin request (${answer})`, async () => {
      panelOriginAnswer = answer;
      await mount();
      await askForCode();
      const first = frame();
      assert.ok(first, "the challenge is open");
      const src = first.getAttribute("src");
      assert.ok(src?.startsWith(`${API}/challenge?action=panel_login&`));
      const realNow = Date.now;
      let offset = 0;
      Date.now = () => realNow() + offset;
      try {
        for (const later of [31_000, 120_000, 600_000]) {
          offset = later;
          await type(emailInput(), `jane${later}@example.com`);
          await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
          assert.equal(frame(), first, `the same iframe element after ${later} ms`);
          assert.equal(frame()?.getAttribute("src"), src);
        }
      } finally { Date.now = realNow; }
      await frameFrom(API);
      assert.equal(loginRequests.length, 1, "the challenge still completes");
    });
  }

  it("fixes the origin of a mounted challenge: a later server answer does not move the frame", async () => {
    await mount();
    await askForCode();
    const first = frame();
    const src = first?.getAttribute("src");
    assert.ok(src?.startsWith(`${API}/challenge?action=panel_login&`));
    // Even if the page-wide answer were replaced, this mount keeps its origin.
    panelOriginAnswer = { panelOrigin: PANEL };
    resetPanelOriginCache();
    await type(emailInput(), "other@example.com");
    await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
    assert.equal(frame(), first);
    assert.equal(frame()?.getAttribute("src"), src);
  });
});
