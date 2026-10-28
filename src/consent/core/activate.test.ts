import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activateScripts } from "./activate.ts";
import { setupDom } from "./testing.ts";

const none = { analytics: false, marketing: false, preferences: false };

describe("script activation", () => {
  it("turns consented placeholders into real scripts", async () => {
    const dom = setupDom(`
      <script type="text/plain" data-bitsnap-consent="marketing" data-src="https://cdn.example/pixel.js" id="px" data-id="42" defer></script>
      <script type="text/plain" data-bitsnap-consent="marketing" id="inline">window.fired = 1</script>
      <script type="text/plain" data-bitsnap-consent="analytics" data-src="https://cdn.example/ga.js" id="ga"></script>`);
    const doc = dom.window.document;
    assert.equal(activateScripts(doc, { ...none, marketing: true }), 2);

    const px = doc.getElementById("px") as HTMLScriptElement;
    assert.equal(px.getAttribute("src"), "https://cdn.example/pixel.js");
    assert.equal(px.hasAttribute("type"), false);
    assert.equal(px.hasAttribute("data-src"), false);
    assert.equal(px.getAttribute("data-id"), "42");
    assert.equal(px.hasAttribute("defer"), true);
    assert.equal(px.async, false);

    // the inline script after an external one waits for it (see below)
    assert.equal(doc.getElementById("inline")!.getAttribute("type"), "text/plain");
    px.dispatchEvent(new dom.window.Event("load"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const inline = doc.getElementById("inline") as HTMLScriptElement;
    assert.equal(inline.hasAttribute("type"), false);
    assert.equal(inline.text, "window.fired = 1");

    // another category stays a placeholder
    const ga = doc.getElementById("ga") as HTMLScriptElement;
    assert.equal(ga.getAttribute("type"), "text/plain");
    assert.equal(ga.hasAttribute("src"), false);
  });

  it("activates each placeholder once", () => {
    const dom = setupDom(`<script type="text/plain" data-bitsnap-consent="analytics">1</script>`);
    assert.equal(activateScripts(dom.window.document, { ...none, analytics: true }), 1);
    assert.equal(activateScripts(dom.window.document, { ...none, analytics: true }), 0);
  });

  it("loads consented iframes and keeps the others empty", () => {
    const dom = setupDom(`
      <iframe id="yt" data-bitsnap-consent="marketing" data-src="https://www.youtube.com/embed/x"></iframe>
      <iframe id="map" data-bitsnap-consent="preferences" data-src="https://maps.example/embed"></iframe>`);
    const doc = dom.window.document;
    assert.equal(activateScripts(doc, { ...none, marketing: true }), 1);
    assert.equal(doc.getElementById("yt")!.getAttribute("src"), "https://www.youtube.com/embed/x");
    assert.equal(doc.getElementById("map")!.hasAttribute("src"), false);
  });

  it("ignores unknown categories", () => {
    const dom = setupDom(`<script type="text/plain" data-bitsnap-consent="constructor">1</script>`);
    assert.equal(activateScripts(dom.window.document, { analytics: true, marketing: true, preferences: true }), 0);
  });

  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("runs an inline placeholder only after the external script before it has loaded", async () => {
    const dom = setupDom(`
      <script type="text/plain" data-bitsnap-consent="marketing" data-src="https://cdn.example/lib.js" id="lib"></script>
      <script type="text/plain" data-bitsnap-consent="marketing" id="init">Lib.init()</script>`);
    const doc = dom.window.document;
    assert.equal(activateScripts(doc, { ...none, marketing: true }), 2);
    const lib = doc.getElementById("lib") as HTMLScriptElement;
    assert.equal(lib.getAttribute("src"), "https://cdn.example/lib.js");
    assert.equal(doc.getElementById("init")!.getAttribute("type"), "text/plain", "still waiting for lib.js");

    // A later choice must not queue the waiting placeholder a second time.
    assert.equal(activateScripts(doc, { ...none, marketing: true }), 0);

    lib.dispatchEvent(new dom.window.Event("load"));
    await tick();
    const init = doc.getElementById("init") as HTMLScriptElement;
    assert.equal(init.hasAttribute("type"), false);
    assert.equal(init.hasAttribute("data-bitsnap-queued"), false);
    assert.equal(init.text, "Lib.init()");
    const order = Array.from(doc.querySelectorAll("script")).map((el) => el.id);
    assert.deepEqual(order, ["lib", "init"]);
  });

  it("goes on after an external script fails, and keeps everything after it in order", async () => {
    const dom = setupDom(`
      <script type="text/plain" data-bitsnap-consent="marketing" data-src="https://cdn.example/a.js" id="a"></script>
      <script type="text/plain" data-bitsnap-consent="marketing" id="inline">1</script>
      <script type="text/plain" data-bitsnap-consent="marketing" data-src="https://cdn.example/b.js" id="b"></script>
      <script type="text/plain" data-bitsnap-consent="marketing" id="last">2</script>`);
    const doc = dom.window.document;
    activateScripts(doc, { ...none, marketing: true });
    const live = (id: string) => !doc.getElementById(id)!.hasAttribute("type");
    assert.equal(live("a"), true);
    assert.equal(live("inline"), false);
    assert.equal(live("b"), false, "queued behind the inline script");

    doc.getElementById("a")!.dispatchEvent(new dom.window.Event("error"));
    await tick();
    assert.equal(live("inline"), true);
    assert.equal(live("b"), true);
    assert.equal(live("last"), false, "waits for b.js");

    doc.getElementById("b")!.dispatchEvent(new dom.window.Event("load"));
    await tick();
    assert.equal(live("last"), true);
  });

  it("keeps consecutive external scripts in order without waiting, and an inline one first runs at once", () => {
    const dom = setupDom(`
      <script type="text/plain" data-bitsnap-consent="marketing" id="first">1</script>
      <script type="text/plain" data-bitsnap-consent="marketing" data-src="https://cdn.example/a.js" id="a"></script>
      <script type="text/plain" data-bitsnap-consent="marketing" data-src="https://cdn.example/b.js" id="b"></script>`);
    const doc = dom.window.document;
    activateScripts(doc, { ...none, marketing: true });
    for (const id of ["first", "a", "b"]) assert.equal(doc.getElementById(id)!.hasAttribute("type"), false, id);
    assert.equal((doc.getElementById("a") as HTMLScriptElement).async, false);
    assert.equal((doc.getElementById("b") as HTMLScriptElement).async, false);
  });

  it("restores type=module from data-type and leaves nomodule alone", async () => {
    const dom = setupDom(`
      <script type="text/plain" data-bitsnap-consent="marketing" data-type="module" data-src="https://cdn.example/m.js" id="m"></script>
      <script type="text/plain" data-bitsnap-consent="marketing" data-type="text/javascript" id="classic">1</script>
      <script type="text/plain" data-bitsnap-consent="marketing" nomodule id="nm">1</script>`);
    const doc = dom.window.document;
    activateScripts(doc, { ...none, marketing: true });
    const m = doc.getElementById("m")!;
    assert.equal(m.getAttribute("type"), "module");
    assert.equal(m.hasAttribute("data-type"), false);
    m.dispatchEvent(new dom.window.Event("load")); // the inline ones after it wait for it
    await tick();
    const classic = doc.getElementById("classic")!;
    assert.equal(classic.hasAttribute("type"), false);
    assert.equal(classic.hasAttribute("data-type"), false);
    const nm = doc.getElementById("nm")!;
    assert.equal(nm.hasAttribute("type"), false);
    assert.equal(nm.hasAttribute("nomodule"), true);
  });
});
