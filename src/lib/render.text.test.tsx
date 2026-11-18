import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  detectRichTextFormat,
  htmlToPlainText,
  lexicalJsonToText,
  renderText,
} from "./render.text";

const html = (text: string) => renderToStaticMarkup(renderText(text));

describe("renderText", () => {
  it("escapes seller markup instead of rendering it", () => {
    const out = html('Hi <img src=x onerror="alert(1)"> there');
    assert.equal(out, "<p>Hi &lt;img src=x onerror=&quot;alert(1)&quot;&gt; there</p>");
  });

  it("escapes plain text that is not HTML", () => {
    const out = html('Price < 5 & "quoted" <b');
    assert.equal(out, "<p>Price &lt; 5 &amp; &quot;quoted&quot; &lt;b</p>");
  });

  it("renders https links as quoted anchors with rel", () => {
    const out = html("See https://example.com/a?b=1&c=2. Thanks");
    assert.equal(
      out,
      '<p>See <a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer" class="break-all underline">https://example.com/a?b=1&amp;c=2</a>. Thanks</p>',
    );
  });

  it("cannot break out of the href", () => {
    const out = html('Go https://evil.example/x"onmouseover="alert(1) now');
    assert.doesNotMatch(out, /onmouseover="/);
    assert.match(out, /href="https:\/\/evil\.example\/x"/);
  });

  it("does not link other schemes", () => {
    const out = html("javascript:alert(1) http://plain.example data:text/html,x");
    assert.doesNotMatch(out, /<a /);
  });

  it("reduces HTML descriptions to text", () => {
    assert.equal(
      html('<p class="x">One &amp; <b>two</b></p><p>https://a.example</p><script>alert(1)</script>'),
      '<p>One &amp; two\n<a href="https://a.example/" target="_blank" rel="noopener noreferrer" class="break-all underline">https://a.example</a></p>',
    );
  });

  it("reduces Lexical JSON to text", () => {
    const state = JSON.stringify({
      root: {
        type: "root",
        children: [
          { type: "paragraph", children: [{ type: "text", text: "Hello " }, { type: "text", text: "world" }] },
          { type: "paragraph", children: [{ type: "text", text: "Line 2" }] },
        ],
      },
    });
    assert.equal(html(state), "<p>Hello world\nLine 2</p>");
  });
});

describe("rich text helpers", () => {
  it("detects the format by the first character", () => {
    assert.equal(detectRichTextFormat('  {"root":{}}'), "lexical");
    assert.equal(detectRichTextFormat("<p>x</p>"), "html");
    assert.equal(detectRichTextFormat("Just text"), "text");
  });

  it("returns undefined for broken JSON", () => {
    assert.equal(lexicalJsonToText("{not json"), undefined);
  });

  it("decodes entities and line breaks", () => {
    assert.equal(htmlToPlainText("a<br>b&nbsp;&#x41;&#66;&unknown;"), "a\nb AB&unknown;");
  });
});
