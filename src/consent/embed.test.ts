import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { init, readScriptOptions } from "./embed.ts";
import { setupDom, shadowOf } from "./core/testing.ts";

afterEach(() => {
  (globalThis as { window?: Window }).window?.BitsnapConsent?.destroy();
});

describe("consent embed", () => {
  it("reads the data attributes of the script tag", () => {
    const dom = setupDom(
      `<script id="s" src="x" data-project="pk_1" data-theme="dark" data-locale="pl" data-position="bottom-left" data-privacy-url="/p" data-scope="project" data-api-host="https://a.test" data-collect-host="https://c.test" data-gcm="on" data-categories="analytics, marketing" data-reload-on-withdraw="true" data-accent="#123456"></script>`,
    );
    const options = readScriptOptions(dom.window.document.getElementById("s"));
    assert.deepEqual(options, {
      projectKey: "pk_1",
      apiHost: "https://a.test",
      collectHost: "https://c.test",
      privacyPolicyUrl: "/p",
      reloadOnWithdraw: true,
      theme: "dark",
      locale: "pl",
      position: "bottom-left",
      scope: "project",
      gcm: "on",
      categories: { analytics: true, marketing: true, preferences: false },
      config: { accentColor: "#123456" },
    });
  });

  it("reads the dashboard preview attributes", () => {
    const dom = setupDom(
      `<script id="s" data-preview="on" data-title=" Own title " data-description="Own description"></script><script id="t" data-preview="off" data-title=" "></script>`,
    );
    const options = readScriptOptions(dom.window.document.getElementById("s"));
    assert.equal(options.preview, true);
    assert.equal(options.title, "Own title");
    assert.equal(options.description, "Own description");
    const off = readScriptOptions(dom.window.document.getElementById("t"));
    assert.equal(off.preview, undefined);
    assert.equal(off.title, undefined);
  });

  it("ignores invalid values", () => {
    const dom = setupDom(`<script id="s" data-theme="neon" data-position="top"></script>`);
    const options = readScriptOptions(dom.window.document.getElementById("s"));
    assert.equal(options.theme, undefined);
    assert.equal(options.position, undefined);
  });

  it("starts once even when the script is included twice", async () => {
    const dom = setupDom(`<script id="s"></script>`);
    const script = dom.window.document.getElementById("s");
    const first = init(script);
    const second = init(script);
    assert.ok(first);
    assert.strictEqual(first, second);
    assert.strictEqual(dom.window.BitsnapConsent, first);
    await first!.ready;
    assert.equal(dom.window.document.querySelectorAll("#bitsnap-consent").length, 1);
    assert.ok(shadowOf(dom.window.document));
  });
});
