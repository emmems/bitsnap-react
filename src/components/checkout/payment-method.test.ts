import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectivePaymentMethod,
  fetchPaymentMethodChoice,
  manualPaymentTitleKey,
  MAX_LOGOS_PER_METHOD,
  parsePaymentMethodChoice,
  paymentLogoOrigins,
  paymentLogoUrls,
  preloadPaymentLogos,
  withoutCod,
} from "./payment-method.ts";

describe("parsePaymentMethodChoice", () => {
  it("reads the choice and keeps the seller's order", () => {
    assert.deepEqual(
      parsePaymentMethodChoice({
        success: true,
        choice: { methods: ["manual", "online"], manualAccountTypes: ["bankTransfer", "blik"] },
      }),
      { methods: ["manual", "online"], manualAccountTypes: ["bankTransfer", "blik"] },
    );
  });

  it("is null when there is nothing to choose", () => {
    for (const body of [
      { success: true, choice: null },
      { success: true },
      { success: false, error: "x" },
      null,
      "text",
      { choice: { methods: ["online"] } },
      { choice: { methods: ["online", "online"] } },
      { choice: { methods: ["online", "cash"] } },
      { choice: { methods: "online,manual" } },
    ]) {
      assert.equal(parsePaymentMethodChoice(body), null, JSON.stringify(body));
    }
  });

  it("reads cash on delivery, also as the third method", () => {
    assert.deepEqual(
      parsePaymentMethodChoice({
        success: true,
        choice: { methods: ["online", "manual", "cod"], manualAccountTypes: ["blik"] },
      }),
      { methods: ["online", "manual", "cod"], manualAccountTypes: ["blik"] },
    );
    assert.deepEqual(
      parsePaymentMethodChoice({ choice: { methods: ["online", "cod"], manualAccountTypes: [] } }),
      { methods: ["online", "cod"], manualAccountTypes: [] },
    );
  });

  it("leaves out methods it does not know and keeps the rest in order", () => {
    assert.deepEqual(
      parsePaymentMethodChoice({
        choice: { methods: ["cod", "voucher", "online", "cod"], manualAccountTypes: [] },
      }),
      { methods: ["cod", "online"], manualAccountTypes: [] },
    );
    assert.equal(
      parsePaymentMethodChoice({ choice: { methods: ["cod", "voucher"] } }),
      null,
      "one known method is nothing to choose",
    );
  });

  it("drops unknown and repeated account types", () => {
    assert.deepEqual(
      parsePaymentMethodChoice({
        choice: { methods: ["online", "manual"], manualAccountTypes: ["blik", "cash", "blik"] },
      }),
      { methods: ["online", "manual"], manualAccountTypes: ["blik"] },
    );
  });
});

describe("parsePaymentMethodChoice: logos", () => {
  const logo = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    src: `https://bitsnap.pl/logos/${id}.v1.svg`,
    alt: id.toUpperCase(),
    width: 40,
    height: 20,
    ...extra,
  });
  const parse = (logos: unknown) =>
    parsePaymentMethodChoice({
      success: true,
      choice: { methods: ["online", "manual", "cod"], manualAccountTypes: ["blik"], logos },
    });

  it("reads the logos per method, in the server's order, with chip only when true", () => {
    assert.deepEqual(
      parse({
        online: [logo("blik"), logo("visa", { chip: true }), logo("mc", { chip: false })],
        manual: [logo("transfer")],
        cod: [logo("courier", { chip: "yes" })],
      })?.logos,
      {
        online: [logo("blik"), logo("visa", { chip: true }), logo("mc")],
        manual: [logo("transfer")],
        cod: [logo("courier")],
      },
    );
  });

  it("has no logos key for an old server, an empty or a malformed field", () => {
    for (const logos of [undefined, null, {}, [], "x", { online: [] }, { online: "blik" }, { voucher: [logo("v")] }]) {
      const choice = parse(logos);
      assert.ok(choice, JSON.stringify(logos));
      assert.equal("logos" in choice, false, JSON.stringify(logos));
    }
  });

  it("drops bad entries and keeps the good ones", () => {
    const bad = [
      null,
      "https://bitsnap.pl/x.svg",
      logo("http", { src: "http://bitsnap.pl/x.svg" }),
      logo("data", { src: "data:image/svg+xml,<svg/>" }),
      logo("js", { src: "javascript:alert(1)" }),
      logo("relative", { src: "/logos/x.svg" }),
      logo("long", { src: `https://bitsnap.pl/${"a".repeat(2100)}` }),
      logo("zero", { width: 0 }),
      logo("negative", { height: -20 }),
      logo("nan", { width: Number.NaN }),
      logo("inf", { height: Number.POSITIVE_INFINITY }),
      logo("string", { width: "40" }),
      logo("noalt", { alt: undefined }),
      { ...logo("x"), id: 7 },
      { ...logo("x"), id: "" },
    ];
    assert.deepEqual(parse({ online: [...bad, logo("blik")] })?.logos, { online: [logo("blik")] });
    assert.equal("logos" in parse({ online: bad })!, false);
  });

  it("keeps logos only on the API origin or Bitsnap's default host", () => {
    const origins = paymentLogoOrigins("https://api.shop.example/api/integrations/p/public-commerce/payment-methods");
    assert.deepEqual(origins, ["https://api.shop.example", "https://bitsnap.pl"]);
    const parseOn = (logos: unknown, logoOrigins: string[]) =>
      parsePaymentMethodChoice(
        { choice: { methods: ["online", "manual"], manualAccountTypes: [], logos } },
        logoOrigins,
      )?.logos;
    const api = logo("api", { src: "https://api.shop.example/logos/api.svg" });
    const bitsnap = logo("bitsnap");
    const dropped = [
      logo("other", { src: "https://tracker.example/pixel.gif" }),
      logo("sub", { src: "https://cdn.bitsnap.pl/x.svg" }),
      logo("port", { src: "https://bitsnap.pl:8443/x.svg" }),
      logo("ip", { src: "https://192.168.1.1/x.svg" }),
      logo("loop", { src: "https://127.0.0.1/x.svg" }),
      logo("localhttp", { src: "http://localhost:4321/x.svg" }),
      logo("creds", { src: "https://user:pass@bitsnap.pl/x.svg" }),
      logo("user", { src: "https://user@api.shop.example/x.svg" }),
    ];
    assert.deepEqual(parseOn({ online: [...dropped, api, bitsnap] }, origins), { online: [api, bitsnap] });
    // Without an endpoint only the default host is allowed (also the parser's default).
    assert.deepEqual(parseOn({ online: [api, bitsnap] }, paymentLogoOrigins()), { online: [bitsnap] });
    assert.deepEqual(parse({ online: [api, bitsnap] })?.logos, { online: [bitsnap] });
    assert.deepEqual(paymentLogoOrigins("/relative"), ["https://bitsnap.pl"]);
  });

  it("accepts http only from an http localhost API's own origin", () => {
    const parseOn = (logos: unknown, endpoint: string) =>
      parsePaymentMethodChoice(
        { choice: { methods: ["online", "manual"], manualAccountTypes: [], logos } },
        paymentLogoOrigins(endpoint),
      )?.logos;
    for (const origin of ["http://localhost:4321", "http://127.0.0.1", "http://[::1]:5173"]) {
      const local = logo("a", { src: `${origin}/logos/a.svg` });
      assert.deepEqual(parseOn({ manual: [local] }, `${origin}/api/payment-methods`), { manual: [local] }, origin);
      // The same logo is dropped when the API is https, and from another local port.
      assert.equal(parseOn({ manual: [local] }, "https://bitsnap.pl/api/payment-methods"), undefined, origin);
      assert.equal(parseOn({ manual: [local] }, `${origin}9/api/payment-methods`), undefined, origin);
    }
    // http on a non-local API origin is still refused.
    const plain = logo("p", { src: "http://shop.example/p.svg" });
    assert.equal(parseOn({ manual: [plain] }, "http://shop.example/api/payment-methods"), undefined);
  });

  it("checks logos against the endpoint the answer came from", async () => {
    const originalFetch = globalThis.fetch;
    const local = logo("local", { src: "http://localhost:4321/logos/local.svg" });
    const other = logo("other", { src: "https://elsewhere.example/x.svg" });
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          choice: { methods: ["online", "manual"], manualAccountTypes: [], logos: { online: [local, other, logo("blik")] } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    try {
      const init = { headers: {}, body: "{}" };
      const fromLocal = await fetchPaymentMethodChoice("http://localhost:4321/api/payment-methods", init);
      assert.deepEqual(fromLocal?.logos, { online: [local, logo("blik")] });
      const fromBitsnap = await fetchPaymentMethodChoice("https://bitsnap.pl/api/payment-methods", init);
      assert.deepEqual(fromBitsnap?.logos, { online: [logo("blik")] });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps at most six per method and drops repeated ids", () => {
    const many = ["a", "a", "b", "c", "d", "e", "f", "g"].map((id) => logo(id));
    const online = parse({ online: many })!.logos!.online!;
    assert.equal(MAX_LOGOS_PER_METHOD, 6);
    assert.deepEqual(online.map((item) => item.id), ["a", "b", "c", "d", "e", "f"]);
  });

  it("keeps logos of a known method the answer does not list, and withoutCod keeps the logos", () => {
    const choice = parsePaymentMethodChoice({
      choice: { methods: ["online", "cod"], manualAccountTypes: [], logos: { manual: [logo("t")], cod: [logo("c")] } },
    })!;
    assert.deepEqual(Object.keys(choice.logos!), ["manual", "cod"]);
    assert.deepEqual(withoutCod({ ...choice, methods: ["online", "manual", "cod"] })?.logos, choice.logos);
  });

  it("lists every logo URL once and preloads each URL once, only where Image exists", () => {
    const shared = logo("blik");
    const choice = parse({ online: [shared, logo("visa")], manual: [shared] })!;
    assert.deepEqual(paymentLogoUrls(choice), [shared.src, logo("visa").src]);
    assert.deepEqual(paymentLogoUrls(null), []);

    const globals = globalThis as { Image?: unknown };
    const original = globals.Image;
    const loaded: string[] = [];
    try {
      delete globals.Image;
      preloadPaymentLogos(choice);
      globals.Image = class {
        decoding = "";
        referrerPolicy = "";
        set src(value: string) {
          // Set before src, so the first request already has it.
          assert.equal(this.referrerPolicy, "no-referrer");
          loaded.push(value);
        }
      };
      preloadPaymentLogos(choice);
      preloadPaymentLogos(choice);
      preloadPaymentLogos(parse({ cod: [logo("visa"), logo("cash")] }));
      preloadPaymentLogos(null);
    } finally {
      globals.Image = original;
    }
    assert.deepEqual(loaded, [shared.src, logo("visa").src, logo("cash").src]);
  });
});

describe("effectivePaymentMethod", () => {
  const choice = { methods: ["manual", "online"] as const, manualAccountTypes: [] };
  it("defaults to the first method and keeps an offered pick", () => {
    assert.equal(effectivePaymentMethod({ ...choice, methods: [...choice.methods] }, undefined), "manual");
    assert.equal(effectivePaymentMethod({ ...choice, methods: [...choice.methods] }, "online"), "online");
  });
  it("falls back to the first method when cash on delivery is no longer offered", () => {
    assert.equal(effectivePaymentMethod({ methods: ["online", "manual", "cod"], manualAccountTypes: [] }, "cod"), "cod");
    assert.equal(effectivePaymentMethod({ methods: ["online", "manual"], manualAccountTypes: [] }, "cod"), "online");
  });
});

describe("withoutCod", () => {
  it("drops cash on delivery and keeps the rest", () => {
    assert.deepEqual(
      withoutCod({ methods: ["online", "manual", "cod"], manualAccountTypes: ["blik"] }),
      { methods: ["online", "manual"], manualAccountTypes: ["blik"] },
    );
  });

  it("is null when fewer than two methods are left", () => {
    assert.equal(withoutCod({ methods: ["online", "cod"], manualAccountTypes: [] }), null);
    assert.equal(withoutCod(null), null);
  });
});

describe("manualPaymentTitleKey", () => {
  it("names the account types", () => {
    assert.equal(manualPaymentTitleKey(["bankTransfer"]), "paymentMethodManualTransfer");
    assert.equal(manualPaymentTitleKey(["blik"]), "paymentMethodManualBlik");
    assert.equal(manualPaymentTitleKey(["bankTransfer", "blik"]), "paymentMethodManualBoth");
    assert.equal(manualPaymentTitleKey([]), "paymentMethodManualBoth");
  });
});
