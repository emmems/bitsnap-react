import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { setupReactPage } from "@/src/analytics/react-testing";
import { formatWait, resolveEmailCodeTexts } from "./texts.ts";
import { stripCodeSeparators } from "./OtpCodeField.tsx";
import { failureNotice } from "./useEmailCodeLogin.ts";
import type {
  EmailCodeAdapter,
  SendOutcome,
  VerifyOutcome,
} from "./useEmailCodeLogin.ts";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let useEmailCodeLogin: typeof import("./useEmailCodeLogin.ts").useEmailCodeLogin;
let EmailCodeLoginForm: typeof import("./EmailCodeLoginForm.tsx").EmailCodeLoginForm;
let pending: typeof import("./pending.ts");

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ useEmailCodeLogin } = await import("./useEmailCodeLogin.ts"));
  ({ EmailCodeLoginForm } = await import("./EmailCodeLoginForm.tsx"));
  pending = await import("./pending.ts");
});

const texts = resolveEmailCodeTexts("pl");
const KEY = "test-login";
const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;

let sendCalls: Array<{ email: string; resend: boolean }>;
let verifyCalls: Array<{ email: string; code: string; challengeId?: string }>;
let sendOutcome: SendOutcome | (() => never);
let verifyOutcome: VerifyOutcome<string> | (() => never);
let verified: string[];

const adapter: EmailCodeAdapter<string> = {
  async send(email, ctx) {
    sendCalls.push({ email, resend: ctx.resend });
    return typeof sendOutcome === "function" ? sendOutcome() : sendOutcome;
  },
  async verify(input) {
    verifyCalls.push(input);
    return typeof verifyOutcome === "function" ? verifyOutcome() : verifyOutcome;
  },
};

function Harness() {
  const login = useEmailCodeLogin<string>({
    adapter,
    texts,
    storageKey: KEY,
    onVerified: (value) => void verified.push(value),
  });
  return <EmailCodeLoginForm login={login} texts={texts} />;
}

beforeEach(() => {
  page.win.sessionStorage.clear();
  sendCalls = [];
  verifyCalls = [];
  verified = [];
  sendOutcome = { ok: true, retryIn: 60, challengeId: "ch-1" };
  verifyOutcome = { ok: true, value: "token" };
  console.error = () => {};
});

afterEach(async () => {
  console.error = originalError;
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
});

const settle = (ms = 30) =>
  React.act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));
const doc = () => page.win.document;
const emailInput = () => doc().querySelector<HTMLInputElement>('input[type="email"]')!;
const codeInput = () => doc().querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!;
const alertText = () => doc().querySelector('[role="alert"]')?.textContent ?? "";
const statusText = () => doc().querySelector('p[role="status"]:not(.sr-only)')?.textContent ?? "";
const buttons = () => Array.from(doc().querySelectorAll<HTMLButtonElement>("button"));
const buttonWith = (label: string | RegExp) =>
  buttons().find((button) =>
    typeof label === "string" ? button.textContent?.includes(label) : label.test(button.textContent ?? ""),
  );

async function mount() {
  const container = doc().createElement("div");
  doc().body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => root.render(<Harness />));
  await settle();
  return container;
}

async function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(page.win.HTMLInputElement.prototype, "value")!.set!;
  await React.act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new page.win.Event("input", { bubbles: true }));
  });
}

async function paste(input: HTMLInputElement, text: string) {
  await React.act(async () => {
    const event = new page.win.Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
    input.dispatchEvent(event);
  });
}

const submit = (form: HTMLFormElement) =>
  React.act(async () => void form.dispatchEvent(new page.win.Event("submit", { bubbles: true, cancelable: true })));

async function toCodeStep(address = "jane@example.com") {
  await type(emailInput(), address);
  await submit(doc().querySelector("form")!);
  await settle();
}

describe("shared login helpers", () => {
  it("shows waits above a minute as minutes, never as raw seconds", () => {
    assert.equal(formatWait(1), "1 s");
    assert.equal(formatWait(45), "45 s");
    assert.equal(formatWait(60), "60 s");
    assert.equal(formatWait(61), "2 min");
    assert.equal(formatWait(90), "2 min");
    assert.equal(formatWait(600), "10 min");
    assert.equal(formatWait(0), "1 s");
  });

  it("strips spaces and dashes from a pasted code", () => {
    assert.equal(stripCodeSeparators("123 456"), "123456");
    assert.equal(stripCodeSeparators(" 123-456\n"), "123456");
  });

  it("has a message for every failure and keeps the time in rate limits", () => {
    for (const kind of [
      "invalidEmail",
      "emailNotFound",
      "wrongCode",
      "expired",
      "tooManyAttempts",
      "rateLimited",
      "alreadySent",
      "deliveryFailed",
      "deliveryUnavailable",
      "network",
      "unknown",
    ] as const) {
      assert.notEqual(failureNotice(texts, kind).text, "", kind);
    }
    assert.match(failureNotice(texts, "rateLimited", 150).text, /3 min/);
    assert.match(failureNotice(texts, "rateLimited", 20).text, /20 s/);
    assert.equal(failureNotice(texts, "alreadySent", 30).kind, "info");
  });
});

describe("e-mail step", () => {
  it("is an accessible e-mail field with one submit path", async () => {
    await mount();
    const input = emailInput();
    assert.equal(input.getAttribute("autocomplete"), "email");
    assert.equal(input.getAttribute("inputmode"), "email");
    assert.equal(doc().activeElement, input, "autofocus");
    assert.equal(doc().querySelectorAll("form").length, 1);
    const send = buttonWith(texts.sendCode)!;
    assert.equal(send.getAttribute("type"), "submit");
    assert.equal(send.onclick, null, "no onClick next to onSubmit");
  });

  it("sends once per submit, locks the form and shows a spinner meanwhile", async () => {
    let release: (outcome: SendOutcome) => void = () => {};
    sendOutcome = (() =>
      new Promise<SendOutcome>((resolve) => {
        release = resolve;
      })) as never;
    await mount();
    await type(emailInput(), "jane@example.com");
    const form = doc().querySelector("form")!;
    await submit(form);
    await submit(form);
    assert.equal(sendCalls.length, 1, "the second submit is ignored while sending");
    assert.equal(emailInput().disabled, true);
    const button = buttonWith(texts.sending)!;
    assert.ok(button.querySelector("svg"), "spinner inside the button");
    assert.equal(button.disabled, true);
    await React.act(async () => release({ ok: true, retryIn: 60 }));
    await settle();
    assert.equal(sendCalls.length, 1);
  });

  it("rejects an invalid address without calling the backend", async () => {
    await mount();
    await type(emailInput(), "not-an-email");
    await submit(doc().querySelector("form")!);
    assert.equal(sendCalls.length, 0);
    assert.equal(alertText(), texts.invalidEmail);
  });
});

describe("code step", () => {
  it("moves on with the e-mail shown, a hint, validity copy and the code field focused", async () => {
    await mount();
    await toCodeStep();
    assert.deepEqual(sendCalls, [{ email: "jane@example.com", resend: false }]);
    assert.match(doc().body.textContent ?? "", /Wysłaliśmy kod na jane@example\.com\./);
    assert.match(doc().body.textContent ?? "", /Nie widzisz e-maila\? Sprawdź folder spam\./);
    assert.match(doc().body.textContent ?? "", /Kod jest ważny 10 minut\./);
    const input = codeInput();
    assert.equal(input.getAttribute("inputmode"), "numeric");
    assert.equal(input.getAttribute("maxlength"), "6");
    assert.equal(doc().activeElement, input, "focus moved to the code");
    assert.match(
      doc().querySelector(".sr-only")?.textContent ?? "",
      /Krok 2 z 2/,
      "the step change is announced",
    );
  });

  it("submits by itself on the sixth digit, once, with the e-mail and challenge", async () => {
    await mount();
    await toCodeStep();
    await type(codeInput(), "12345");
    await settle();
    assert.equal(verifyCalls.length, 0, "five digits do not submit");
    await type(codeInput(), "123456");
    await settle();
    assert.deepEqual(verifyCalls, [
      { email: "jane@example.com", code: "123456", challengeId: "ch-1" },
    ]);
    assert.deepEqual(verified, ["token"]);
    assert.equal(pending.readPendingLogin(KEY), undefined, "cleared on success");
  });

  it("also has a visible submit button that asks for all six digits", async () => {
    await mount();
    await toCodeStep();
    await type(codeInput(), "123");
    await React.act(async () => buttonWith(texts.verify)!.click());
    await settle();
    assert.equal(verifyCalls.length, 0);
    assert.equal(alertText(), texts.codeIncomplete);
  });

  it("strips spaces and dashes from a pasted code and submits it", async () => {
    await mount();
    await toCodeStep();
    await paste(codeInput(), "123 456");
    await settle();
    assert.equal(verifyCalls.length, 1);
    assert.equal(verifyCalls[0]!.code, "123456");
    await React.act(async () => {});
  });

  it("clears a wrong code, says so, and keeps the focus on the field", async () => {
    verifyOutcome = { ok: false, kind: "wrongCode" };
    await mount();
    await toCodeStep();
    await type(codeInput(), "111111");
    await settle();
    assert.equal(alertText(), texts.wrongCode);
    assert.equal(codeInput().value, "");
    assert.equal(doc().activeElement, codeInput());
    assert.equal(codeInput().disabled, false);
  });

  it("offers a new code when the code expired and locks the field until then", async () => {
    verifyOutcome = { ok: false, kind: "expired" };
    await mount();
    await toCodeStep();
    await type(codeInput(), "111111");
    await settle();
    assert.equal(alertText(), texts.expired);
    assert.equal(codeInput().disabled, true);
    const resend = buttonWith(texts.resendNew)!;
    assert.equal(resend.disabled, false, "a new code can be requested at once");
    assert.equal(pending.readPendingLogin(KEY), undefined, "the dead step is not restored");

    sendOutcome = { ok: true, retryIn: 60, challengeId: "ch-2" };
    await React.act(async () => resend.click());
    await settle();
    assert.equal(sendCalls.at(-1)?.resend, true);
    assert.equal(statusText(), texts.resent);
    assert.equal(codeInput().disabled, false);
    await type(codeInput(), "222222");
    await settle();
    assert.equal(verifyCalls.at(-1)?.challengeId, "ch-2");
  });

  it("explains too many attempts and offers a new code or another address", async () => {
    verifyOutcome = { ok: false, kind: "tooManyAttempts" };
    await mount();
    await toCodeStep();
    await type(codeInput(), "111111");
    await settle();
    assert.equal(alertText(), texts.tooManyAttempts);
    assert.ok(buttonWith(texts.resendNew), "new code");
    assert.ok(buttonWith(texts.changeEmail), "change e-mail");
  });

  it("shows a rate limit in human time", async () => {
    verifyOutcome = { ok: false, kind: "rateLimited", retryIn: 300 };
    await mount();
    await toCodeStep();
    await type(codeInput(), "111111");
    await settle();
    assert.match(alertText(), /5 min/);
    assert.doesNotMatch(alertText(), /300/);
  });

  it("never leaves the customer without a message when the request throws", async () => {
    verifyOutcome = (() => {
      throw new TypeError("Failed to fetch");
    }) as never;
    await mount();
    await toCodeStep();
    await type(codeInput(), "111111");
    await settle();
    assert.equal(alertText(), texts.network);
    assert.equal(codeInput().value, "111111", "the code is kept for a retry");

    sendOutcome = (() => {
      throw new TypeError("Failed to fetch");
    }) as never;
    await React.act(async () => buttonWith(/Wyślij ponownie/)?.click());
  });

  it("shows a failed send as a message", async () => {
    sendOutcome = { ok: false, kind: "deliveryFailed" };
    await mount();
    await toCodeStep();
    assert.equal(alertText(), texts.deliveryFailed);
    assert.ok(emailInput(), "still on the e-mail step");
    assert.equal(emailInput().disabled, false);
  });

  it("enables resend after the countdown, then confirms the new code", async () => {
    sendOutcome = { ok: true, retryIn: 1, challengeId: "ch-1" };
    await mount();
    await toCodeStep();
    const resend = () => buttonWith(/Wyślij ponownie/)!;
    assert.match(resend().textContent ?? "", /Wyślij ponownie za [01] s/);
    assert.equal(resend().disabled, true);
    await settle(1300);
    assert.equal(resend().textContent, texts.resend);
    assert.equal(resend().disabled, false);

    sendOutcome = { ok: true, retryIn: 60, challengeId: "ch-2" };
    await React.act(async () => resend().click());
    await settle();
    assert.equal(sendCalls.at(-1)?.resend, true);
    assert.equal(statusText(), texts.resent);
    assert.match(resend().textContent ?? "", /Wyślij ponownie za (59|60) s/);
    assert.equal(resend().disabled, true);
  });

  it("goes back with Zmień and keeps the typed address", async () => {
    await mount();
    await toCodeStep();
    await React.act(async () => buttonWith(texts.changeEmail)!.click());
    await settle();
    assert.equal(emailInput().value, "jane@example.com");
    assert.equal(doc().activeElement, emailInput());
    assert.equal(pending.readPendingLogin(KEY), undefined, "cleared on change");
  });

  it("asks for the e-mail too when the customer already has a code", async () => {
    await mount();
    await React.act(async () => buttonWith(texts.haveCode)!.click());
    await settle();
    assert.ok(emailInput(), "the e-mail field is there");
    assert.ok(codeInput(), "next to the code field");
    await type(codeInput(), "123456");
    await settle();
    assert.equal(verifyCalls.length, 0, "no e-mail, no request");
    assert.equal(alertText(), texts.invalidEmail);
    await type(emailInput(), "jane@example.com");
    await React.act(async () => buttonWith(texts.verify)!.click());
    await settle();
    assert.deepEqual(verifyCalls, [
      { email: "jane@example.com", code: "123456", challengeId: undefined },
    ]);
  });
});

describe("pending step", () => {
  it("returns to the code step after a remount, with the countdown running", async () => {
    await mount();
    await toCodeStep();
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    doc().body.innerHTML = "";

    await mount();
    assert.match(doc().body.textContent ?? "", /jane@example\.com/);
    assert.ok(codeInput(), "on the code step");
    assert.equal(doc().activeElement, codeInput());
    assert.match(buttonWith(/Wyślij ponownie/)!.textContent ?? "", /za (59|60) s/);
    await type(codeInput(), "123456");
    await settle();
    assert.equal(verifyCalls[0]?.challengeId, "ch-1", "the challenge survived");
  });

  it("does not restore an expired step", async () => {
    pending.savePendingLogin(KEY, {
      email: "old@example.com",
      challengeId: "old",
      resendAt: Date.now() - 1000,
      sentAt: Date.now() - pending.CODE_VALID_MS - 1000,
    });
    await mount();
    assert.ok(emailInput(), "back on the e-mail step");
    assert.equal(emailInput().value, "");
    assert.equal(pending.readPendingLogin(KEY), undefined);
  });

  it("enables resend at once when the cooldown ended while away", async () => {
    pending.savePendingLogin(KEY, {
      email: "jane@example.com",
      challengeId: "ch-9",
      resendAt: Date.now() - 5000,
      sentAt: Date.now() - 60000,
    });
    await mount();
    assert.equal(buttonWith(texts.resend)?.disabled, false);
  });

  it("keeps pending steps apart per key", () => {
    const a = pending.pendingLoginKey("panel", "p1", "https://a.test");
    const b = pending.pendingLoginKey("panel", "p2", "https://a.test");
    const c = pending.pendingLoginKey("returns", "p1", "https://a.test");
    assert.equal(new Set([a, b, c]).size, 3);
  });
});
