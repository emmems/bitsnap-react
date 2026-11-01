import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import {
  create,
  fromBinary,
  toBinary,
  type MessageInitShape,
} from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { resetTracker } from "@/src/analytics/core";
import { setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  VerifyUserEmailRequestSchema,
  VerifyUserEmailResponseSchema,
} from "@/src/gen/proto/dashboard/v1/notifications_pb";
import {
  createNotificationsAdapter,
  notificationsFailureKind,
  notificationsLoginTexts,
} from "./login-adapter.ts";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let LoginScreen: typeof import("./LoginScreen.tsx").default;
let DEFAULT_TEXTS: typeof import("./constants.tsx").DEFAULT_TEXTS;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  LoginScreen = (await import("./LoginScreen.tsx")).default;
  ({ DEFAULT_TEXTS } = await import("./constants.tsx"));
});

const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;
const originalWarn = console.warn;

type Reply = MessageInitShape<typeof VerifyUserEmailResponseSchema> | Response | "network";
let replies: Reply[];
let requests: Array<ReturnType<typeof readRequest>>;

const readRequest = (body: Uint8Array) => fromBinary(VerifyUserEmailRequestSchema, body);
const connectError = (code: string, status: number, message: string) =>
  new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  resetTracker();
  page.win.sessionStorage.clear();
  replies = [];
  requests = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    if (!String(input).endsWith("/VerifyUserEmail")) {
      return new Response(null, { status: 202 });
    }
    requests.push(readRequest(init!.body as Uint8Array));
    const reply = replies.shift() ?? { ok: true };
    if (reply === "network") throw new TypeError("Failed to fetch");
    if (reply instanceof Response) return reply;
    return new Response(toBinary(VerifyUserEmailResponseSchema, create(VerifyUserEmailResponseSchema, reply)) as BodyInit, {
      status: 200,
      headers: { "Content-Type": "application/proto" },
    });
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
const codeInput = () => doc().querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!;
const alertText = () => doc().querySelector('[role="alert"]')?.textContent ?? "";
const buttonWith = (label: string | RegExp) =>
  Array.from(doc().querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    typeof label === "string" ? button.textContent?.includes(label) : label.test(button.textContent ?? ""),
  );

const successes: Array<[string | undefined, string]> = [];
const errors: Error[] = [];

async function mount() {
  const container = doc().createElement("div");
  doc().body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  successes.length = 0;
  errors.length = 0;
  await React.act(async () =>
    root.render(
      <LoginScreen
        slug={TEST_KEY}
        isOpen
        texts={DEFAULT_TEXTS}
        onSuccess={(userID, token) => void successes.push([userID, token])}
        onError={(error) => void errors.push(error)}
      />,
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

async function toCodeStep() {
  await type(emailInput(), "jane@example.com");
  await submit(doc().querySelector("form")!);
  await settle();
}

describe("notifications failure mapping", () => {
  it("maps the backend answers, not the raw message", () => {
    assert.equal(notificationsFailureKind(new ConnectError("Invalid code", Code.InvalidArgument)), "wrongCode");
    assert.equal(notificationsFailureKind(new ConnectError("Too many attempts", Code.ResourceExhausted)), "tooManyAttempts");
    assert.equal(notificationsFailureKind(new ConnectError("slow down", Code.ResourceExhausted)), "rateLimited");
    assert.equal(notificationsFailureKind(new ConnectError("down", Code.Unavailable)), "unknown");
    assert.equal(notificationsFailureKind(new TypeError("Failed to fetch")), "network");
    assert.equal(notificationsFailureKind(new Error("boom")), "unknown");
  });

  it("reads ok: false + retryIn as the per-IP limit (nothing was sent)", async () => {
    const adapter = createNotificationsAdapter(
      async () => ({ ok: false, retryIn: 42 }),
      "slug",
      DEFAULT_TEXTS,
    );
    assert.deepEqual(await adapter.send("a@b.co", { resend: false }), {
      ok: false,
      kind: "rateLimited",
      retryIn: 42,
    });
  });

  it("treats retryIn 0 (older backend) as no cooldown given", async () => {
    const adapter = createNotificationsAdapter(async () => ({ ok: true, retryIn: 0 }), "slug", DEFAULT_TEXTS);
    assert.deepEqual(await adapter.send("a@b.co", { resend: false }), { ok: true, retryIn: undefined });
  });

  it("maps the new login* texts onto the shared ones", () => {
    const mapped = notificationsLoginTexts({
      ...DEFAULT_TEXTS,
      loginVerifyingButton: "Sprawdzam",
      loginNoCodeButton: "Bez kodu",
      loginCodeIncompleteError: "Za krótki",
    });
    assert.equal(mapped.verifying, "Sprawdzam");
    assert.equal(mapped.noCode, "Bez kodu");
    assert.equal(mapped.codeIncomplete, "Za krótki");
  });

  it("keeps the legacy texts working", () => {
    const mapped = notificationsLoginTexts({
      ...DEFAULT_TEXTS,
      loginInvalidCodeError: "Zły kod",
      loginChangeEmailButton: "Cofnij",
      loginCodeSentMessage: "Kod poszedł na",
    });
    assert.equal(mapped.wrongCode, "Zły kod");
    assert.equal(mapped.changeEmail, "Cofnij");
    assert.equal(mapped.codeSentTo, "Kod poszedł na {email}.");
  });
});

describe("notifications LoginScreen", () => {
  it("sends the e-mail together with the code", async () => {
    replies = [{ ok: true }, { ok: true, accessToken: "tok", userId: "u1" }];
    await mount();
    await toCodeStep();
    assert.deepEqual([requests[0]!.email, requests[0]!.code], ["jane@example.com", undefined]);
    await type(codeInput(), "123456");
    await settle();
    assert.equal(requests.length, 2);
    assert.equal(requests[1]!.email, "jane@example.com");
    assert.equal(requests[1]!.code, "123456");
    assert.deepEqual(successes, [["u1", "tok"]]);
  });

  it("turns 'Invalid code' into the configured message and clears the field", async () => {
    replies = [{ ok: true }, connectError("invalid_argument", 400, "Invalid code")];
    await mount();
    await toCodeStep();
    await type(codeInput(), "111111");
    await settle();
    assert.equal(alertText(), DEFAULT_TEXTS.loginInvalidCodeError);
    assert.equal(codeInput().value, "");
    assert.equal(doc().activeElement, codeInput());
    assert.equal(errors.length, 1, "onError still gets a wrong code, as before");
  });

  it("explains 'Too many attempts' (ResourceExhausted) and offers a new code", async () => {
    replies = [{ ok: true }, connectError("resource_exhausted", 429, "Too many attempts")];
    await mount();
    await toCodeStep();
    await type(codeInput(), "111111");
    await settle();
    assert.equal(alertText(), DEFAULT_TEXTS.loginTooManyAttemptsError);
    assert.ok(buttonWith("Wyślij nowy kod"));
  });

  it("shows a per-IP limit in human time", async () => {
    replies = [connectError("resource_exhausted", 429, "Rate limit exceeded")];
    await mount();
    await toCodeStep();
    assert.match(alertText(), /Zbyt wiele prób\. Spróbuj ponownie za 60 s/);
    assert.ok(emailInput(), "stays on the e-mail step");
  });

  it("stays on the e-mail step with the wait when the per-IP limit stopped the send", async () => {
    replies = [{ ok: false, retryIn: 90 }];
    await mount();
    await toCodeStep();
    assert.ok(emailInput(), "nothing was sent: no code step");
    assert.equal(codeInput(), null);
    assert.match(alertText(), /Zbyt wiele prób\. Spróbuj ponownie za 2 min/);
  });

  it("continues to the code step when a resend was throttled (ok: true + retryIn)", async () => {
    replies = [{ ok: true, retryIn: 90 }];
    await mount();
    await toCodeStep();
    assert.ok(codeInput(), "a code was sent a moment ago: go and enter it");
    assert.match(buttonWith(/Wyślij ponownie/)!.textContent ?? "", /za (89|90) s/);
    assert.equal(buttonWith(/Wyślij ponownie/)!.disabled, true);
  });

  it("answers Unavailable with the generic copy, not the connection one", () => {
    assert.equal(notificationsFailureKind(new ConnectError("redis", Code.Unavailable)), "unknown");
  });

  it("makes the header back arrow and the change link do the same thing", async () => {
    replies = [{ ok: true }, { ok: true }];
    await mount();
    await toCodeStep();
    const arrow = () =>
      doc().querySelector<HTMLButtonElement>(`button[aria-label="${DEFAULT_TEXTS.loginChangeEmailButton}"]`)!;
    const link = () => buttonWith(DEFAULT_TEXTS.loginChangeEmailButton!)!;
    for (const control of [arrow, link]) {
      await React.act(async () => control().click());
      await settle();
      assert.equal(emailInput().value, "jane@example.com", "e-mail kept");
      assert.equal(codeInput(), null);
      await toCodeStep();
    }
  });

  it("tells the customer when the send does not get through", async () => {
    replies = ["network"];
    await mount();
    await toCodeStep();
    assert.equal(alertText(), DEFAULT_TEXTS.loginNetworkError);
    assert.equal(errors.length, 1);
  });

  it("restores the code step after a remount", async () => {
    replies = [{ ok: true }];
    await mount();
    await toCodeStep();
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    doc().body.innerHTML = "";
    await mount();
    assert.ok(codeInput(), "restored");
    assert.match(doc().body.textContent ?? "", /jane@example\.com/);
  });
});
