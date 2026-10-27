import assert from "node:assert/strict";
import { describe, it } from "node:test";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { createHtmlSanitizer, sanitizeLessonHtml } from "./sanitize.ts";

const sanitize = createHtmlSanitizer(
  DOMPurify(new JSDOM("").window as unknown as Window & typeof globalThis) as never,
);

describe("lesson html sanitizer", () => {
  it("keeps the formatting of the editor", () => {
    const html =
      "<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em> text</p><ul><li>one</li></ul><pre><code>x</code></pre>";
    assert.equal(sanitize(html), html);
  });

  it("removes scripts, event handlers and javascript urls", () => {
    const out = sanitize(
      '<p onclick="steal()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="x" onerror="alert(1)">',
    );
    assert.ok(!/<script|onclick|onerror|javascript:/i.test(out), out);
    assert.match(out, /<p>hi<\/p>/);
  });

  it("removes embedded documents, forms and inline styles", () => {
    const out = sanitize(
      '<iframe src="https://evil.example"></iframe><form action="/x"><input name="a"><button>Go</button></form><object data="x"></object><p style="position:fixed;inset:0">overlay</p><style>body{display:none}</style>',
    );
    assert.ok(!/<iframe|<form|<input|<button|<object|<style|style=/i.test(out), out);
    assert.match(out, /<p>overlay<\/p>/);
  });

  it("opens links in a new tab without giving the page access to the opener", () => {
    const out = sanitize('<a href="https://example.com/a">link</a>');
    assert.match(out, /target="_blank"/);
    assert.match(out, /rel="noopener noreferrer nofollow"/);
  });

  it("does not add a target to anchors without an href", () => {
    assert.ok(!/target=/.test(sanitize('<a name="top">x</a>')));
  });

  it("lazy loads images and drops the referrer", () => {
    const out = sanitize('<img src="https://cdn.example/a.png" alt="a">');
    assert.match(out, /loading="lazy"/);
    assert.match(out, /referrerpolicy="no-referrer"/);
  });

  it("drops data attributes and returns an empty string for empty input", () => {
    assert.ok(!/data-/.test(sanitize('<p data-x="1">a</p>')));
    assert.equal(sanitize(""), "");
    assert.equal(sanitize(null), "");
    assert.equal(sanitize(undefined), "");
  });

  it("fails closed without a DOM", () => {
    const unsupported = createHtmlSanitizer({ isSupported: false });
    assert.equal(unsupported("<p>hi</p>"), "");
    assert.equal(createHtmlSanitizer({})("<p>hi</p>"), "");
    // The shared sanitizer needs `window`, which Node does not have.
    assert.equal(sanitizeLessonHtml("<p>hi</p>"), "");
  });
});
