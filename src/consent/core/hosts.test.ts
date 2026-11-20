import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBitsnapHost, isSharedCookieHost, normalizeHost } from "./hosts.ts";

describe("bitsnap hosts", () => {
  const table: Array<[string, boolean, boolean]> = [
    // host, isBitsnapHost, isSharedCookieHost
    ["bitsnap.pl", true, false],
    ["www.bitsnap.pl", true, false],
    ["sklep.bitsnap.pl", true, true],
    ["nazwa.sklep.bitsnap.pl", true, true],
    ["bitsnap.site", true, true],
    ["nazwa.bitsnap.site", true, true],
    ["a.nazwa.bitsnap.site", true, true],
    // case
    ["NAZWA.Bitsnap.Site", true, true],
    ["NAZWA.SKLEP.BITSNAP.PL", true, true],
    // one trailing dot (a fully qualified name)
    ["bitsnap.pl.", true, false],
    ["nazwa.bitsnap.site.", true, true],
    ["bitsnap.site.", true, true],
    ["nazwa.sklep.bitsnap.pl.", true, true],
    ["Nazwa.Bitsnap.Site.", true, true],
    // not ours
    ["shop.example.com", false, false],
    ["shop.example.com.", false, false],
    ["localhost", false, false],
    ["", false, false],
    // IP hosts
    ["127.0.0.1", false, false],
    ["192.168.0.10", false, false],
    ["::1", false, false],
    ["[::1]", false, false],
    // look-alikes
    ["evilbitsnap.site", false, false],
    ["bitsnap.site.evil.com", false, false],
    ["notbitsnap.pl", false, false],
    ["bitsnap.pl.evil.com", false, false],
    ["bitsnap-site.example.com", false, false],
    ["xsklep.bitsnap.pl.evil.com", false, false],
  ];
  for (const [host, bitsnap, shared] of table) {
    it(`${JSON.stringify(host)}: bitsnap=${bitsnap}, shared cookie root=${shared}`, () => {
      assert.equal(isBitsnapHost(host), bitsnap);
      assert.equal(isSharedCookieHost(host), shared);
    });
  }

  it("normalizeHost lower-cases and strips exactly one trailing dot", () => {
    assert.equal(normalizeHost("Nazwa.Bitsnap.Site."), "nazwa.bitsnap.site");
    assert.equal(normalizeHost("nazwa.bitsnap.site"), "nazwa.bitsnap.site");
    assert.equal(normalizeHost("nazwa.bitsnap.site.."), "nazwa.bitsnap.site.");
  });
});
