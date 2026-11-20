import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COOKIE_MAX_AGE,
  cookieName,
  decodeState,
  deleteServiceCookies,
  domainCandidates,
  domainsToExpire,
  encodeState,
  parseCookie,
  serializeCookie,
} from "./cookie.ts";
import type { ConsentState } from "./types.ts";

const state: ConsentState = {
  id: "7c1f1d3e-0000-4000-8000-123456789abc",
  ts: 1761650000,
  bv: 3,
  c: { analytics: true, marketing: false, preferences: true },
};

describe("consent cookie", () => {
  it("round-trips through base64url JSON", () => {
    const value = encodeState(state);
    assert.match(value, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(decodeState(value), state);
    assert.deepEqual(JSON.parse(Buffer.from(value, "base64url").toString()), {
      v: 1,
      id: state.id,
      ts: state.ts,
      bv: 3,
      c: state.c,
    });
  });

  it("rejects values that are not a valid consent", () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    assert.equal(decodeState("%%%"), null);
    assert.equal(decodeState(encode({ v: 2, id: "a", ts: 1, bv: 1, c: state.c })), null);
    assert.equal(decodeState(encode({ v: 1, id: "a", ts: 1, bv: 1, c: { analytics: true } })), null);
    assert.equal(decodeState(encode({ v: 1, id: "", ts: 1, bv: 1, c: state.c })), null);
    assert.equal(decodeState(encode("nope")), null);
  });

  it("serializes with the required attributes", () => {
    const http = serializeCookie("bitsnap_consent", state, false);
    assert.ok(http.startsWith(`bitsnap_consent=${encodeState(state)}; `));
    assert.ok(http.includes(`Max-Age=${COOKIE_MAX_AGE}`));
    assert.equal(COOKIE_MAX_AGE, 31536000);
    assert.ok(http.includes("Path=/"));
    assert.ok(http.includes("SameSite=Lax"));
    assert.ok(!http.includes("Secure"));
    assert.ok(serializeCookie("bitsnap_consent", state, true).endsWith("; Secure"));
  });

  it("finds the cookie among others", () => {
    const header = `a=1; bitsnap_consent_other=x; bitsnap_consent=${encodeState(state)}; b=2`;
    assert.deepEqual(parseCookie(header, "bitsnap_consent"), state);
    assert.equal(parseCookie(header, "missing"), null);
    assert.equal(parseCookie("", "bitsnap_consent"), null);
  });

  it("names the cookie per project only with project scope", () => {
    assert.equal(cookieName(), "bitsnap_consent");
    assert.equal(cookieName("pk_live_123", "global"), "bitsnap_consent");
    assert.equal(cookieName("pk_live_123"), "bitsnap_consent");
    assert.equal(cookieName("pk_live_123", "project"), "bitsnap_consent_pk_live_123");
    assert.equal(cookieName("a b;c=d", "project"), "bitsnap_consent_a_b_c_d");
    assert.equal(cookieName(undefined, "project"), "bitsnap_consent");
  });

  it("lists the host and its parent domains", () => {
    assert.deepEqual(domainCandidates("a.b.example.com"), ["a.b.example.com", "b.example.com", "example.com"]);
    assert.deepEqual(domainCandidates("localhost"), []);
    assert.deepEqual(domainCandidates("127.0.0.1"), []);
  });

  it("per host: never a shared root or a host below one", () => {
    // Unchanged: bitsnap.pl itself, a custom domain, localhost.
    assert.deepEqual(domainCandidates("bitsnap.pl"), ["bitsnap.pl"]);
    assert.deepEqual(domainCandidates("shop.example.com"), ["shop.example.com", "example.com"]);
    assert.deepEqual(domainCandidates("localhost"), []);
    // Old shop address: no `sklep.bitsnap.pl`; the widest candidate (`bitsnap.pl`) is what was written before.
    assert.deepEqual(domainCandidates("nazwa.sklep.bitsnap.pl"), ["bitsnap.pl"]);
    // New shop address: host-only, no `Domain` at all.
    assert.deepEqual(domainCandidates("nazwa.bitsnap.site"), []);
    assert.deepEqual(domainCandidates("a.nazwa.bitsnap.site"), []);
    assert.deepEqual(domainCandidates("bitsnap.site"), []);
  });

  it("a trailing dot or capitals change nothing", () => {
    assert.deepEqual(domainCandidates("nazwa.bitsnap.site."), []);
    assert.deepEqual(domainCandidates("bitsnap.site."), []);
    assert.deepEqual(domainCandidates("nazwa.sklep.bitsnap.pl."), ["bitsnap.pl"]);
    assert.deepEqual(domainCandidates("NAZWA.Sklep.Bitsnap.PL"), ["bitsnap.pl"]);
    assert.deepEqual(domainCandidates("shop.example.com."), ["shop.example.com", "example.com"]);
    assert.deepEqual(domainCandidates("localhost."), []);
    assert.deepEqual(domainCandidates("127.0.0.1."), []);
    assert.deepEqual(domainCandidates("a..example.com"), []);
  });

  it("domainsToExpire: the full parent chain, shared roots included", () => {
    assert.deepEqual(domainsToExpire("nazwa.bitsnap.site"), ["nazwa.bitsnap.site", "bitsnap.site"]);
    assert.deepEqual(domainsToExpire("a.nazwa.bitsnap.site."), ["a.nazwa.bitsnap.site", "nazwa.bitsnap.site", "bitsnap.site"]);
    assert.deepEqual(domainsToExpire("nazwa.sklep.bitsnap.pl"), ["nazwa.sklep.bitsnap.pl", "sklep.bitsnap.pl", "bitsnap.pl"]);
    assert.deepEqual(domainsToExpire("nazwa.sklep.bitsnap.pl."), ["nazwa.sklep.bitsnap.pl", "sklep.bitsnap.pl", "bitsnap.pl"]);
    assert.deepEqual(domainsToExpire("shop.example.com"), ["shop.example.com", "example.com"]);
    assert.deepEqual(domainsToExpire("localhost"), []);
    assert.deepEqual(domainsToExpire("127.0.0.1"), []);
  });

  it("deleteServiceCookies expires on the whole chain, shared roots included", () => {
    const services = [{ id: "x", name: "X", category: "analytics", cookies: ["_x"] }] as never;
    const run = (hostname: string) => {
      const writes: string[] = [];
      const doc = {
        location: { hostname },
        get cookie() {
          return "_x=1";
        },
        set cookie(value: string) {
          writes.push(value);
        },
      } as unknown as Document;
      deleteServiceCookies(doc, services, ["analytics"]);
      return writes.map((w) => w.match(/Domain=(.+)$/)?.[1] ?? null);
    };
    // Every write is an expiry (Max-Age=0, empty value): nothing is ever set on a shared root.
    // Expiring `_x` on Domain=bitsnap.site also clears a copy another seller's script put there.
    assert.deepEqual(run("nazwa.bitsnap.site"), [
      null,
      "nazwa.bitsnap.site",
      ".nazwa.bitsnap.site",
      "bitsnap.site",
      ".bitsnap.site",
    ]);
    assert.deepEqual(run("nazwa.bitsnap.site."), run("nazwa.bitsnap.site"));
    // Unchanged from before the shared-root work: the same 7 writes.
    const oldSet = [
      null,
      "nazwa.sklep.bitsnap.pl",
      ".nazwa.sklep.bitsnap.pl",
      "sklep.bitsnap.pl",
      ".sklep.bitsnap.pl",
      "bitsnap.pl",
      ".bitsnap.pl",
    ];
    assert.deepEqual(run("nazwa.sklep.bitsnap.pl"), oldSet);
    assert.deepEqual(run("nazwa.sklep.bitsnap.pl."), oldSet);
    assert.deepEqual(run("shop.example.com"), [null, "shop.example.com", ".shop.example.com", "example.com", ".example.com"]);
    assert.deepEqual(run("localhost"), [null]);
    assert.deepEqual(run("127.0.0.1"), [null]);
  });
});
