import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import {
  create,
  fromBinary,
  toBinary,
  type DescMessage,
  type MessageInitShape,
} from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import { resetTracker } from "@/src/analytics/core";
import { setupReactPage, TEST_KEY } from "@/src/analytics/react-testing";
import {
  ListReturnOrdersResponseSchema,
  StartReturnSessionRequestSchema,
  StartReturnSessionResponseSchema,
  VerifyReturnSessionRequestSchema,
  VerifyReturnSessionResponseSchema,
} from "src/gen/proto/public/v1/returns_pb";
import { mapReturnsError } from "./errors.ts";
import { RETURNS_TEXT_TABLES } from "./texts.ts";

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let BitsnapReturns: typeof import("./BitsnapReturns.tsx").BitsnapReturns;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ BitsnapReturns } = await import("./BitsnapReturns.tsx"));
});

const roots: Array<{ unmount: () => void }> = [];
const originalError = console.error;
const text = RETURNS_TEXT_TABLES.pl;

let starts: Array<ReturnType<typeof readStart>>;
let verifies: Array<ReturnType<typeof readVerify>>;
let resendAfter: number;
let verifyReply: "ok" | "invalid" | "network" | "limited";

const readStart = (body: Uint8Array) => fromBinary(StartReturnSessionRequestSchema, body);
const readVerify = (body: Uint8Array) => fromBinary(VerifyReturnSessionRequestSchema, body);

function proto<T extends DescMessage>(schema: T, init: MessageInitShape<T>) {
  return new Response(toBinary(schema, create(schema, init)) as BodyInit, {
    status: 200,
    headers: { "Content-Type": "application/proto" },
  });
}
const connectError = (code: string, status: number, message: string) =>
  new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  resetTracker();
  page.win.sessionStorage.clear();
  starts = [];
  verifies = [];
  resendAfter = 60;
  verifyReply = "ok";
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/StartReturnSession")) {
      starts.push(readStart(init!.body as Uint8Array));
      return proto(StartReturnSessionResponseSchema, {
        challengeId: `challenge-${starts.length}`,
        resendAfterSeconds: resendAfter,
      });
    }
    if (url.endsWith("/VerifyReturnSession")) {
      verifies.push(readVerify(init!.body as Uint8Array));
      if (verifyReply === "invalid") return connectError("invalid_argument", 400, "INVALID_OR_EXPIRED_CODE");
      if (verifyReply === "limited") return connectError("resource_exhausted", 429, "slow down");
      if (verifyReply === "network") throw new TypeError("Failed to fetch");
      return proto(VerifyReturnSessionResponseSchema, {
        sessionToken: "returns-session",
        expiresAt: { seconds: BigInt(Math.floor(Date.now() / 1000) + 3600) },
      });
    }
    if (url.endsWith("/ListReturnOrders")) {
      return proto(ListReturnOrdersResponseSchema, { orders: [], total: 0 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  console.error = () => {};
});

afterEach(async () => {
  console.error = originalError;
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

async function mount(props: Partial<React.ComponentProps<typeof BitsnapReturns>> = {}) {
  const container = doc().createElement("div");
  doc().body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () =>
    root.render(<BitsnapReturns projectID={TEST_KEY} analytics={false} {...props} />),
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

async function paste(input: HTMLInputElement, pasted: string) {
  await React.act(async () => {
    const event = new page.win.Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => pasted } });
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

describe("returns error mapping for the login", () => {
  it("tells a throttled request and a missing connection from a generic failure", () => {
    assert.equal(mapReturnsError(new ConnectError("slow down", Code.ResourceExhausted)), "errorRateLimited");
    assert.equal(mapReturnsError(new TypeError("Failed to fetch")), "errorNetwork");
    assert.equal(mapReturnsError(new ConnectError("down", Code.Unavailable)), "errorNetwork");
    assert.equal(mapReturnsError(new Error("boom")), "errorGeneric");
  });
});

describe("Returns code step", () => {
  it("sends the widget's language with the start request", async () => {
    await mount({ locale: "en-GB" });
    await toCodeStep();
    assert.equal(starts[0]!.locale, "en");
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    doc().body.innerHTML = "";
    page.win.sessionStorage.clear();

    await mount({ locale: "pl-PL" });
    await toCodeStep();
    assert.equal(starts[1]!.locale, "pl");
  });

  it("shows one six digit one-time-code field, focused, with the hints", async () => {
    await mount();
    await toCodeStep();
    const input = codeInput();
    assert.equal(doc().querySelectorAll('input[autocomplete="one-time-code"]').length, 1);
    assert.equal(input.getAttribute("inputmode"), "numeric");
    assert.equal(input.getAttribute("maxlength"), "6");
    assert.equal(doc().activeElement, input);
    assert.ok(doc().body.textContent?.includes(text.codeValidity));
    assert.ok(doc().body.textContent?.includes(text.codeSpamHint));
  });

  it("verifies by itself on the sixth digit", async () => {
    await mount();
    await toCodeStep();
    await type(codeInput(), "12345");
    await settle();
    assert.equal(verifies.length, 0);
    await type(codeInput(), "123456");
    await settle();
    assert.equal(verifies.length, 1);
    assert.equal(verifies[0]!.challengeId, "challenge-1");
    assert.equal(verifies[0]!.code, "123456");
    assert.equal(
      Array.from({ length: page.win.sessionStorage.length }, (_, i) => page.win.sessionStorage.key(i)!).filter(
        (key) => key.startsWith("bitsnap-login-pending:"),
      ).length,
      0,
      "the pending step is cleared once signed in",
    );
  });

  it("accepts a pasted code with spaces", async () => {
    await mount();
    await toCodeStep();
    await paste(codeInput(), "123 456");
    await settle();
    assert.equal(verifies[0]?.code, "123456");
  });

  it("clears a wrong code, shows the message and keeps the focus", async () => {
    verifyReply = "invalid";
    await mount();
    await toCodeStep();
    await type(codeInput(), "111111");
    await settle();
    assert.equal(alertText(), text.errorInvalidCode);
    assert.equal(codeInput().value, "");
    assert.equal(doc().activeElement, codeInput());
  });

  it("says when the connection fails and when the server throttles", async () => {
    verifyReply = "network";
    await mount();
    await toCodeStep();
    await type(codeInput(), "111111");
    await settle();
    assert.equal(alertText(), text.errorNetwork);

    verifyReply = "limited";
    await type(codeInput(), "222222");
    await settle();
    assert.equal(alertText(), text.errorRateLimited);
  });

  it("counts down to the resend button, then confirms the new code", async () => {
    resendAfter = 1;
    await mount();
    await toCodeStep();
    const resend = () => buttonWith(/Wyślij (kod )?ponownie/)!;
    assert.match(resend().textContent ?? "", /Wyślij ponownie za [01] s/);
    assert.equal(resend().disabled, true);
    await settle(1300);
    assert.equal(resend().textContent, text.resend);
    assert.equal(resend().disabled, false);

    resendAfter = 60;
    await React.act(async () => resend().click());
    await settle();
    assert.equal(starts.length, 2);
    assert.equal(doc().querySelector('p[role="status"]')?.textContent, text.resendSent);
    assert.equal(resend().disabled, true);
  });

  it("returns to the code step after a reload and goes back with the typed address", async () => {
    await mount();
    await toCodeStep();
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    doc().body.innerHTML = "";

    await mount();
    assert.ok(codeInput(), "restored to the code step");
    assert.match(doc().body.textContent ?? "", /jane@example\.com/);
    await type(codeInput(), "123456");
    await settle();
    assert.equal(verifies[0]?.challengeId, "challenge-1");

    // Back to the e-mail step keeps the address and drops the pending code.
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    doc().body.innerHTML = "";
    page.win.sessionStorage.clear();
    await mount();
    await toCodeStep("back@example.com");
    await React.act(async () => buttonWith(text.back)!.click());
    await settle();
    assert.equal(emailInput().value, "back@example.com");
    await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
    doc().body.innerHTML = "";
    await mount();
    assert.ok(emailInput(), "the abandoned code is not restored");
  });

  it("accepts text overrides for the new keys", async () => {
    await mount({ texts: { codeSpamHint: "Zajrzyj do spamu." } });
    await toCodeStep();
    assert.match(doc().body.textContent ?? "", /Zajrzyj do spamu\./);
  });
});
