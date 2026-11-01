import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { setupPage, teardownPage } from "@/src/analytics/testing";
import {
  REVOLUT_SCRIPT_URL,
  createRevolutPayments,
  loadRevolutCheckout,
  resetRevolutLoader,
  type RevolutCheckoutNamespace,
} from "./revolut-sdk";
import {
  INPOST_SANDBOX_API_BASE_URL,
  initInpostWidget,
  inpostIziButtonAttributes,
  inpostLanguage,
  readInpostPublicConfig,
  resetInpostWidgetLoader,
  type InPostWidgetInitOptions,
  type InPostWidgetNamespace,
} from "./inpost-widget";

const page = setupPage("https://shop.example.test/cart");

beforeEach(() => {
  Object.assign(globalThis, { window: page.win, document: page.win.document });
  delete (page.win as unknown as Record<string, unknown>).RevolutCheckout;
  delete (page.win as unknown as Record<string, unknown>).InPostPayWidget;
  delete (page.win as unknown as Record<string, unknown>).__INPOST_PAY_WIDGET__;
  page.win.document.head.innerHTML = "";
  resetRevolutLoader();
  resetInpostWidgetLoader();
});

after(() => {
  resetRevolutLoader();
  resetInpostWidgetLoader();
  teardownPage();
});

describe("Revolut Checkout script loader", () => {
  it("uses the official sandbox and production script per mode", () => {
    assert.equal(REVOLUT_SCRIPT_URL.sandbox, "https://sandbox-merchant.revolut.com/embed.js");
    assert.equal(REVOLUT_SCRIPT_URL.prod, "https://merchant.revolut.com/embed.js");
  });

  it("loads the script lazily and resolves the SDK", async () => {
    const loading = loadRevolutCheckout("sandbox", { timeoutMs: 1000 });
    const script = page.win.document.getElementById(
      "revolut-checkout-sandbox",
    ) as HTMLScriptElement | null;
    assert.ok(script != null, "the sandbox embed script was not inserted");
    assert.equal(script!.src, REVOLUT_SCRIPT_URL.sandbox);
    assert.equal(script!.async, true);

    const namespace: RevolutCheckoutNamespace = {
      payments: async () => ({ revolutPay: { mount() {}, on() {}, destroy() {} } }),
    };
    (page.win as unknown as { RevolutCheckout: RevolutCheckoutNamespace }).RevolutCheckout =
      namespace;
    script!.dispatchEvent(new page.win.Event("load"));
    assert.equal(await loading, namespace);
  });

  it("shares one script per mode and one loaded SDK", async () => {
    const namespace: RevolutCheckoutNamespace = {
      payments: async () => ({ revolutPay: { mount() {}, on() {}, destroy() {} } }),
    };
    (page.win as unknown as { RevolutCheckout: RevolutCheckoutNamespace }).RevolutCheckout =
      namespace;
    const first = await loadRevolutCheckout("prod");
    const second = await loadRevolutCheckout("prod");
    assert.equal(first, namespace);
    assert.equal(second, namespace);
    assert.equal(page.win.document.querySelectorAll("script").length, 0);
  });

  it("rejects when the script cannot load", async () => {
    const loading = loadRevolutCheckout("prod", { timeoutMs: 1000 });
    const script = page.win.document.getElementById(
      "revolut-checkout",
    ) as HTMLScriptElement;
    script.dispatchEvent(new page.win.Event("error"));
    await assert.rejects(loading);
  });

  it("rejects on the server", async () => {
    const saved = globalThis.window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
    try {
      await assert.rejects(loadRevolutCheckout("prod"));
    } finally {
      globalThis.window = saved;
    }
  });

  it("initialises the payments module with the public key and mode", async () => {
    const calls: unknown[] = [];
    const namespace: RevolutCheckoutNamespace = {
      payments: async (options) => {
        calls.push(options);
        return { revolutPay: { mount() {}, on() {}, destroy() {} } };
      },
    };
    await createRevolutPayments(namespace, {
      publicKey: "pk_test",
      mode: "sandbox",
      locale: "pl",
    });
    assert.deepEqual(calls[0], {
      publicToken: "pk_test",
      mode: "sandbox",
      locale: "pl",
    });
  });
});

describe("InPost Pay widget", () => {
  it("reads the canonical public config and forces the matching environment", () => {
    const testConfig = readInpostPublicConfig(
      {
        merchantClientId: "mc-1",
        environment: "test",
        widgetApiBaseUrl: "https://inpostpay-widget-api.inpost.pl",
        widgetScriptUrl: "https://inpostpay-widget-v2.inpost.pl/inpostpay.widget.v2.js",
      },
      "test",
    );
    assert.equal(testConfig?.merchantClientId, "mc-1");
    assert.equal(testConfig?.apiBaseUrl, INPOST_SANDBOX_API_BASE_URL);
    assert.match(testConfig?.scriptUrl ?? "", /sandbox/);

    const prodConfig = readInpostPublicConfig(
      {
        merchantClientId: "mc-1",
        environment: "production",
        widgetApiBaseUrl: INPOST_SANDBOX_API_BASE_URL,
      },
      "production",
    );
    assert.equal(
      prodConfig?.apiBaseUrl,
      "https://inpostpay-widget-api.inpost.pl",
    );

    // Older backends sent `apiBaseUrl`; the alias still works.
    const alias = readInpostPublicConfig(
      {
        merchantClientId: "mc-1",
        environment: "test",
        apiBaseUrl: INPOST_SANDBOX_API_BASE_URL,
      },
      "test",
    );
    assert.equal(alias?.apiBaseUrl, INPOST_SANDBOX_API_BASE_URL);

    // The availability environment wins over a contradictory config, so a test
    // cart can never be pointed at production by a stale public config.
    const mismatch = readInpostPublicConfig(
      {
        merchantClientId: "mc-1",
        environment: "production",
        widgetApiBaseUrl: "https://inpostpay-widget-api.inpost.pl",
      },
      "test",
    );
    assert.equal(mismatch?.apiBaseUrl, INPOST_SANDBOX_API_BASE_URL);
  });

  it("maps the documented locale and element attributes", () => {
    assert.equal(inpostLanguage("pl-PL"), "pl");
    assert.equal(inpostLanguage("en-US"), "en");
    assert.deepEqual(
      inpostIziButtonAttributes({
        bindingPlace: "PRODUCT_CARD",
        productId: "variant-1",
        variation: "neutral",
      }),
      {
        binding_place: "PRODUCT_CARD",
        "data-product-id": "variant-1",
        variation: "neutral",
      },
    );
  });

  it("initialises once per project and refuses another mounted project's widget", () => {
    const initialised: InPostWidgetInitOptions[] = [];
    const refreshes: InPostWidgetInitOptions[] = [];
    const namespace: InPostWidgetNamespace = {
      init: (options) => {
        initialised.push(options);
        const instance = {
          refresh(options?: Partial<InPostWidgetInitOptions>) {
            refreshes.push(options as InPostWidgetInitOptions);
          },
          rerender() {},
        };
        (
          page.win as unknown as { __INPOST_PAY_WIDGET__?: unknown }
        ).__INPOST_PAY_WIDGET__ = instance;
        return instance;
      },
    };
    const options: InPostWidgetInitOptions = {
      merchantClientId: "merchant-1",
      basketBindingApiKey: undefined,
    };
    const first = initInpostWidget({
      namespace,
      options,
      owner: {
        projectID: "p1",
        host: "https://bitsnap.pl",
        merchantClientId: "merchant-1",
      },
    });
    assert.ok(first != null);
    assert.equal(initialised.length, 1);

    // The same project reuses the page-wide instance and refreshes its
    // callbacks for the new component.
    const again = initInpostWidget({
      namespace,
      options: { ...options, language: "en" },
      owner: {
        projectID: "p1",
        host: "https://bitsnap.pl",
        merchantClientId: "merchant-1",
      },
    });
    assert.equal(again, first);
    assert.equal(initialised.length, 1);
    assert.equal(refreshes.length, 1);
    assert.equal(refreshes[0].language, "en");

    // While an element of the first project is still on the page, another
    // project is refused instead of taking the singleton over.
    const mounted = page.win.document.createElement("inpost-izi-button");
    page.win.document.body.appendChild(mounted);
    const warnings: string[] = [];
    const other = initInpostWidget({
      namespace,
      options,
      owner: {
        projectID: "p2",
        host: "https://bitsnap.pl",
        merchantClientId: "merchant-2",
      },
      warn: (message) => warnings.push(message),
    });
    assert.equal(other, undefined);
    assert.equal(initialised.length, 1);
    assert.equal(warnings.length, 1);

    // After a full unmount no element is left, so a new project may own the
    // page-wide instance (no stale callbacks from the old shop).
    mounted.remove();
    const takeover = initInpostWidget({
      namespace,
      options,
      owner: {
        projectID: "p2",
        host: "https://bitsnap.pl",
        merchantClientId: "merchant-2",
      },
    });
    assert.ok(takeover != null);
    assert.equal(initialised.length, 2);
  });
});
