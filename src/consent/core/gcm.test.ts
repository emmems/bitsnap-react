import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GCM_DEFAULT, createConsentMode, shouldUseConsentMode, toConsentModeUpdate } from "./gcm.ts";

describe("Google Consent Mode v2", () => {
  it("maps categories to consent types", () => {
    assert.deepEqual(toConsentModeUpdate({ analytics: true, marketing: false, preferences: false }), {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      functionality_storage: "denied",
      personalization_storage: "denied",
    });
    assert.deepEqual(toConsentModeUpdate({ analytics: false, marketing: true, preferences: true }), {
      analytics_storage: "denied",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      functionality_storage: "granted",
      personalization_storage: "granted",
    });
  });

  it("denies everything by default, except security storage", () => {
    assert.equal(GCM_DEFAULT.security_storage, "granted");
    assert.equal(GCM_DEFAULT.wait_for_update, 500);
    for (const key of ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage", "functionality_storage", "personalization_storage"] as const) {
      assert.equal(GCM_DEFAULT[key], "denied");
    }
  });

  it("stays off unless gtag, dataLayer or data-gcm=on exist", () => {
    const win = {} as Window;
    assert.equal(shouldUseConsentMode(win, "auto"), false);
    assert.equal(shouldUseConsentMode(win, "on"), true);
    assert.equal(shouldUseConsentMode({ dataLayer: [] } as unknown as Window, "auto"), true);
    assert.equal(shouldUseConsentMode({ dataLayer: [] } as unknown as Window, "off"), false);
    assert.equal(createConsentMode(win, "auto"), null);
  });

  it("queues arguments objects through a gtag shim", () => {
    const win = {} as Window & { dataLayer?: unknown[]; gtag?: unknown };
    const mode = createConsentMode(win, "on")!;
    mode.setDefault();
    mode.update({ analytics: true, marketing: false, preferences: false });
    const layer = win.dataLayer!;
    assert.equal(layer.length, 2);
    // gtag.js only understands `arguments` objects, not arrays
    assert.equal(Array.isArray(layer[0]), false);
    assert.deepEqual(Array.from(layer[0] as ArrayLike<unknown>), ["consent", "default", { ...GCM_DEFAULT }]);
    assert.equal((Array.from(layer[1] as ArrayLike<unknown>)[2] as Record<string, string>).analytics_storage, "granted");
  });

  it("reuses an existing gtag", () => {
    const calls: unknown[][] = [];
    const win = { gtag: (...args: unknown[]) => calls.push(args) } as unknown as Window;
    createConsentMode(win, "auto")!.setDefault();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].slice(0, 2), ["consent", "default"]);
  });
});
