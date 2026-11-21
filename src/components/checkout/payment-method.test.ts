import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectivePaymentMethod,
  manualPaymentTitleKey,
  MAX_LOGOS_PER_METHOD,
  parsePaymentMethodChoice,
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

  it("accepts http only on localhost, for a local backend", () => {
    const local = [
      logo("a", { src: "http://localhost:4321/logos/a.svg" }),
      logo("b", { src: "http://127.0.0.1/b.svg" }),
      logo("c", { src: "http://[::1]:5173/c.svg" }),
    ];
    assert.deepEqual(parse({ manual: local })?.logos, { manual: local });
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
        set src(value: string) {
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
