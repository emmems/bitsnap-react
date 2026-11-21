import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import {
  clearPanelSession,
  getPanelEmail,
  getPanelSession,
  panelEmailKey,
  panelSessionKey,
  savePanelSession,
} from "./session-storage";

describe("panel session storage", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://bitsnap.pl/panel",
    });
    (globalThis as { window: unknown }).window = dom.window;
  });

  afterEach(() => {
    (globalThis as { window: unknown }).window = originalWindow;
  });

  it("keeps real project id keys byte-identical", () => {
    assert.equal(
      panelSessionKey("RY", "https://bitsnap.pl"),
      `bitsnap-panel-session:${encodeURIComponent("https://bitsnap.pl")}:RY`,
    );
    assert.equal(
      panelEmailKey("RY", "https://bitsnap.pl"),
      `bitsnap-panel-email:${encodeURIComponent("https://bitsnap.pl")}:RY`,
    );
    assert.equal(
      panelSessionKey("shop/1", "https://shop.example.test"),
      `bitsnap-panel-session:${encodeURIComponent("https://shop.example.test")}:${encodeURIComponent("shop/1")}`,
    );
  });

  it("maps an empty or undefined project id to the global * scope", () => {
    const host = encodeURIComponent("https://bitsnap.pl");
    assert.equal(panelSessionKey(""), `bitsnap-panel-session:${host}:*`);
    assert.equal(panelSessionKey(undefined), `bitsnap-panel-session:${host}:*`);
    assert.equal(panelEmailKey(""), `bitsnap-panel-email:${host}:*`);
    assert.equal(panelEmailKey(undefined), `bitsnap-panel-email:${host}:*`);

    savePanelSession("", "global-token", "buyer@example.test");
    assert.equal(getPanelSession(""), "global-token");
    assert.equal(getPanelSession(undefined), "global-token");
    assert.equal(getPanelEmail(""), "buyer@example.test");
    assert.equal(getPanelEmail(undefined), "buyer@example.test");
    assert.equal(
      window.localStorage.getItem(`bitsnap-panel-session:${host}:*`),
      "global-token",
    );

    clearPanelSession("");
    assert.equal(getPanelSession(""), undefined);
    assert.equal(getPanelEmail(""), null);
  });

  it("keeps the global * session separate from a shop session and the reverse", () => {
    savePanelSession("", "global-token", "global@example.test");
    assert.equal(getPanelSession("shop-a"), undefined);
    assert.equal(getPanelEmail("shop-a"), null);

    savePanelSession("shop-a", "shop-token", "shop@example.test");
    assert.equal(getPanelSession("shop-a"), "shop-token");
    assert.equal(getPanelEmail("shop-a"), "shop@example.test");
    assert.equal(getPanelSession(""), "global-token");
    assert.equal(getPanelEmail(""), "global@example.test");

    clearPanelSession("shop-a");
    assert.equal(getPanelSession("shop-a"), undefined);
    assert.equal(getPanelSession(""), "global-token");

    clearPanelSession("");
    assert.equal(getPanelSession(""), undefined);
  });
});
