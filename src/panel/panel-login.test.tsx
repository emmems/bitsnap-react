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
  loginResult = { case: "success", value: { retryIn: 60, challengeId: "challenge-7" } };
  codeResult = { case: "accessToken", value: "panel-token" };
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
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
  React.act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));
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
    };
    for (const [value, kind] of Object.entries(expected)) {
      assert.equal(panelFailureKind(Number(value)), kind, FailureMessage[Number(value)]);
    }
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
});
