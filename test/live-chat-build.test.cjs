const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const { gzipSync } = require("node:zlib");
const { version } = require("../package.json");

test("chat loader stays below 7 KB gzip and carries the package version", () => {
  const loader = readFileSync("dist/embed/bitsnap-chat.js");
  assert.ok(gzipSync(loader).length <= 7 * 1024);
  assert.ok(loader.includes(JSON.stringify(version)));
  assert.doesNotMatch(loader.toString(), /\bBITSNAP_REACT_EMBED_VERSION\b/);
  assert.ok(readFileSync("dist/embed/bitsnap-chat-panel.js").length > 0);
});
