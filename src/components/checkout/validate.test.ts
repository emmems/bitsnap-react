import assert from "node:assert/strict";
import { describe, it } from "node:test";
import zod from "zod";
import {
  InvalidInputError,
  parseAddToCartPayload,
  parseBuyProductArgs,
  parseCountryList,
  parseStoredCheckout,
} from "./validate.ts";

/*
 * The validators replace zod schemas (PLAN step 8 / part 2 step 8). The old
 * schemas live on here as oracles: for the same input, a validator must accept
 * or reject exactly like the schema did, and return the same value (unknown
 * keys dropped, defaults applied, missing keys left missing).
 */

const oracles = {
  buyProduct: zod.object({
    productID: zod.string(),
    email: zod.string().optional(),
    name: zod.string().optional(),
    country: zod.string().optional(),
    marketingAgreement: zod.boolean().optional(),
    locale: zod.string().optional(),
  }),
  addToCart: zod.object({
    id: zod.string(),
    isSubscription: zod.boolean().default(false),
    quantity: zod.number(),
    metadata: zod.record(zod.string(), zod.string().optional()).optional(),
    url: zod.string().optional(),
  }),
  countries: zod.array(zod.object({ name: zod.string(), code: zod.string() })),
  checkout: (() => {
    const googlePayConfig = zod.object({
      isAvailable: zod.boolean(),
      merchantId: zod.string(),
      merchantName: zod.string(),
      gateway: zod.string(),
      gatewayId: zod.string(),
      checkedAt: zod.number().optional().catch(undefined),
      checkedFor: zod.string().optional().catch(undefined),
    });
    const product = zod.object({
      id: zod.string(),
      productID: zod.string(),
      quantity: zod.number(),
      priceVersion: zod.string().optional(),
      amount: zod.number().int().nonnegative().optional(),
      metadata: zod.record(zod.string(), zod.string().optional()).optional(),
      url: zod.string().optional(),
    });
    return zod.object({
      country: zod.string().optional(),
      couponCode: zod.string().optional(),
      selectedDeliveryMethod: zod.string().optional(),
      postalCode: zod.string().optional(),
      email: zod.string().optional(),
      products: zod.array(product).optional(),
      googlePayConfig: googlePayConfig.optional(),
    });
  })(),
};

const validators = {
  buyProduct: parseBuyProductArgs,
  addToCart: parseAddToCartPayload,
  countries: parseCountryList,
  checkout: parseStoredCheckout,
};

type Name = keyof typeof oracles;

function outcome(run: () => unknown): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: run() };
  } catch {
    return { ok: false };
  }
}

/** The validator and the schema agree on `input`; returns whether it was accepted. */
function agree(name: Name, input: unknown, label = JSON.stringify(input)): boolean {
  const old = outcome(() => oracles[name].parse(input));
  const now = outcome(() => validators[name](input));
  assert.equal(now.ok, old.ok, `${name}: ${old.ok ? "zod accepted" : "zod rejected"} ${label}, the validator did not agree`);
  if (old.ok && now.ok) assert.deepStrictEqual(now.value, old.value, `${name}: different output for ${label}`);
  return old.ok;
}

// -------------------------------------------------------------------- inputs

const validCases: Record<Name, unknown[]> = {
  buyProduct: [
    { productID: "p1" },
    { productID: "p1", email: "a@b.pl", name: "Ala", country: "PL", marketingAgreement: true, locale: "pl" },
    { productID: "p1", email: undefined, marketingAgreement: false },
    { productID: "p1", unknown: 1, nested: { a: 1 } },
    { productID: "" },
  ],
  addToCart: [
    { id: "v1", quantity: 1 },
    { id: "v1", quantity: 3, isSubscription: true },
    { id: "v1", quantity: 0 },
    { id: "v1", quantity: -2 },
    { id: "v1", quantity: 1.5 },
    { id: "v1", quantity: 1, isSubscription: undefined },
    { id: "v1", quantity: 1, metadata: { a: "b", c: undefined }, url: "https://x.test/p" },
    { id: "v1", quantity: 1, metadata: {} },
    { id: "v1", quantity: 1, extra: true },
  ],
  countries: [[], [{ name: "Polska", code: "PL" }], [{ name: "A", code: "A", flag: "x" }, { name: "", code: "" }]],
  checkout: [
    {},
    { products: [] },
    { country: "PL", couponCode: "C", selectedDeliveryMethod: "d", postalCode: "00-001", email: "a@b.pl" },
    { products: [{ id: "l1", productID: "p1", quantity: 2 }], legacy: 1 },
    {
      products: [
        {
          id: "l1",
          productID: "p1",
          quantity: 2,
          priceVersion: "v",
          amount: 500,
          metadata: { k: "v" },
          url: "https://x.test",
          stale: true,
        },
      ],
    },
    { googlePayConfig: { isAvailable: true, merchantId: "m", merchantName: "n", gateway: "g", gatewayId: "gid" } },
    {
      googlePayConfig: {
        isAvailable: false,
        merchantId: "m",
        merchantName: "n",
        gateway: "g",
        gatewayId: "gid",
        checkedAt: 1_700_000_000_000,
        checkedFor: "key",
        old: 1,
      },
    },
    // A bad stamp is dropped, not fatal.
    {
      googlePayConfig: {
        isAvailable: false,
        merchantId: "m",
        merchantName: "n",
        gateway: "g",
        gatewayId: "gid",
        checkedAt: "yesterday",
        checkedFor: 7,
      },
    },
    { googlePayConfig: { isAvailable: false, merchantId: "m", merchantName: "n", gateway: "g", gatewayId: "gid", checkedAt: null } },
  ],
};

/** One case of every way a value can be wrong, for every validator. */
const invalidCases: Record<Name, unknown[]> = {
  buyProduct: [undefined, null, "x", 1, true, [], [{ productID: "p" }], {}, { productID: 1 }, { productID: null }, { productID: "p", email: 1 }, { productID: "p", email: null }, { productID: "p", marketingAgreement: "yes" }, { productID: "p", locale: [] }],
  addToCart: [undefined, null, "x", 0, [], {}, { id: "v" }, { quantity: 1 }, { id: 1, quantity: 1 }, { id: "v", quantity: "1" }, { id: "v", quantity: NaN }, { id: "v", quantity: Infinity }, { id: "v", quantity: -Infinity }, { id: "v", quantity: null }, { id: "v", quantity: 1, isSubscription: "true" }, { id: "v", quantity: 1, isSubscription: null }, { id: "v", quantity: 1, metadata: [] }, { id: "v", quantity: 1, metadata: null }, { id: "v", quantity: 1, metadata: "x" }, { id: "v", quantity: 1, metadata: { a: 1 } }, { id: "v", quantity: 1, metadata: { a: null } }, { id: "v", quantity: 1, metadata: { a: { b: "c" } } }, { id: "v", quantity: 1, url: 5 }, { id: "v", quantity: 1, url: null }],
  countries: [undefined, null, {}, "PL", [null], [{}], [{ name: "A" }], [{ code: "A" }], [{ name: 1, code: "A" }], [{ name: "A", code: null }], [[]], [{ name: "A", code: "A" }, 1]],
  checkout: [undefined, null, [], "x", 1, { country: 1 }, { country: null }, { email: false }, { products: {} }, { products: null }, { products: [null] }, { products: [{}] }, { products: [{ id: "l", productID: "p" }] }, { products: [{ id: "l", productID: "p", quantity: "1" }] }, { products: [{ id: "l", productID: "p", quantity: NaN }] }, { products: [{ id: "l", productID: "p", quantity: Infinity }] }, { products: [{ id: 1, productID: "p", quantity: 1 }] }, { products: [{ id: "l", productID: "p", quantity: 1, amount: -1 }] }, { products: [{ id: "l", productID: "p", quantity: 1, amount: 1.5 }] }, { products: [{ id: "l", productID: "p", quantity: 1, amount: 2 ** 53 }] }, { products: [{ id: "l", productID: "p", quantity: 1, amount: "5" }] }, { products: [{ id: "l", productID: "p", quantity: 1, amount: null }] }, { products: [{ id: "l", productID: "p", quantity: 1, metadata: { a: 1 } }] }, { products: [{ id: "l", productID: "p", quantity: 1, metadata: [] }] }, { products: [{ id: "l", productID: "p", quantity: 1, url: 1 }] }, { googlePayConfig: null }, { googlePayConfig: {} }, { googlePayConfig: { isAvailable: "true", merchantId: "m", merchantName: "n", gateway: "g", gatewayId: "x" } }, { googlePayConfig: { isAvailable: true, merchantId: "m", merchantName: "n", gateway: "g" } }],
};

// -------------------------------------------------------------------- parity

describe("validators behave like the zod schemas they replaced", () => {
  for (const name of Object.keys(oracles) as Name[]) {
    it(`${name}: accepts and returns what zod accepted and returned`, () => {
      for (const input of validCases[name]) {
        assert.equal(agree(name, input), true, `a valid case was rejected: ${JSON.stringify(input)}`);
      }
    });

    it(`${name}: rejects what zod rejected`, () => {
      for (const input of invalidCases[name]) {
        assert.equal(agree(name, input), false, `an invalid case was accepted: ${String(JSON.stringify(input))}`);
      }
    });
  }

  it("drops a JSON `__proto__` key in metadata, like zod, and never touches the prototype", () => {
    const input = JSON.parse('{"id":"v","quantity":1,"metadata":{"__proto__":"x","a":"b"}}');
    agree("addToCart", input);
    const parsed = parseAddToCartPayload(input);
    assert.equal(Object.getPrototypeOf(parsed.metadata), Object.prototype);
    assert.equal(({} as Record<string, unknown>).a, undefined);
  });

  it("treats class instances, null-prototype objects and symbol keys like zod", () => {
    class Box {
      productID = "p";
    }
    agree("buyProduct", new Box(), "class instance");
    agree("buyProduct", Object.assign(Object.create(null), { productID: "p" }), "null prototype");
    agree("addToCart", { id: "v", quantity: 1, metadata: Object.assign(Object.create(null), { a: "b" }) }, "null-prototype metadata");
    agree("addToCart", { id: "v", quantity: 1, metadata: new Box() }, "class instance as metadata");
    agree("addToCart", { id: "v", quantity: 1, metadata: { [Symbol("k")]: "v" } }, "symbol key in metadata");
    agree("addToCart", { id: "v", quantity: 1, metadata: new Map([["a", "b"]]) }, "map as metadata");
  });

  it("agrees on seeded random mutations of valid values", () => {
    let seed = 20_261_121;
    const random = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return seed / 4_294_967_296;
    };
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
    const pool: unknown[] = [
      undefined, null, "", "x", 0, 1, -1, 1.5, 2 ** 53, NaN, Infinity, true, false, [], [1], {}, { a: "b" }, { a: 1 },
      [{ name: "A", code: "B" }], { __proto__: null },
    ];

    /** Every path (as keys) to a value inside `value`, arrays and objects included. */
    const paths = (value: unknown, prefix: (string | number)[] = []): (string | number)[][] => {
      if (typeof value !== "object" || value === null) return [prefix];
      const own = Array.isArray(value) ? value.map((_, index) => index) : Object.keys(value);
      return [prefix, ...own.flatMap((key) => paths((value as Record<string | number, unknown>)[key], [...prefix, key]))];
    };
    const mutate = (base: unknown): unknown => {
      const copy = structuredClone(base) as Record<string | number, unknown>;
      for (let round = 0; round < 1 + Math.floor(random() * 2); round++) {
        const target = pick(paths(copy).filter((path) => path.length > 0));
        let holder: Record<string | number, unknown> = copy;
        for (const key of target.slice(0, -1)) holder = holder[key] as Record<string | number, unknown>;
        const last = target[target.length - 1];
        if (random() < 0.15) delete holder[last];
        else if (random() < 0.15) holder[`extra${round}`] = pick(pool);
        else holder[last] = pick(pool);
      }
      return copy;
    };

    const bases: Record<Name, unknown> = {
      buyProduct: { productID: "p1", email: "a@b.pl", name: "n", country: "PL", marketingAgreement: true, locale: "pl" },
      addToCart: { id: "v1", quantity: 2, isSubscription: false, metadata: { a: "b" }, url: "https://x.test" },
      countries: [{ name: "Polska", code: "PL" }, { name: "Niemcy", code: "DE" }],
      checkout: {
        country: "PL",
        couponCode: "C",
        selectedDeliveryMethod: "d",
        postalCode: "00-001",
        email: "a@b.pl",
        products: [
          { id: "l1", productID: "p1", quantity: 2, priceVersion: "v", amount: 500, metadata: { k: "v" }, url: "https://x.test" },
          { id: "l2", productID: "p2", quantity: 1 },
        ],
        googlePayConfig: {
          isAvailable: true,
          merchantId: "m",
          merchantName: "n",
          gateway: "g",
          gatewayId: "gid",
          checkedAt: 1_700_000_000_000,
          checkedFor: "k",
        },
      },
    };

    let accepted = 0;
    let rejected = 0;
    for (const name of Object.keys(bases) as Name[]) {
      for (let i = 0; i < 1500; i++) {
        const input = mutate(bases[name]);
        if (agree(name, input, `${name} mutation #${i}: ${String(JSON.stringify(input))}`)) accepted++;
        else rejected++;
      }
    }
    // The generator must reach both outcomes, or it proves nothing.
    assert.ok(accepted > 1000 && rejected > 1000, `accepted ${accepted}, rejected ${rejected}`);
  });
});

// ------------------------------------------------------------------ messages

describe("validator errors", () => {
  const message = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      assert.ok(error instanceof InvalidInputError, "an InvalidInputError");
      assert.equal(error.name, "InvalidInputError");
      assert.ok(error instanceof Error);
      return error.message;
    }
    return assert.fail("did not throw");
  };

  it("names the field that is wrong", () => {
    assert.equal(message(() => parseBuyProductArgs({})), "buyProduct.productID: expected a string");
    assert.equal(message(() => parseBuyProductArgs({ productID: "p", marketingAgreement: 1 })), "buyProduct.marketingAgreement: expected a boolean");
    assert.equal(message(() => parseBuyProductArgs(null)), "buyProduct: expected an object");
    assert.equal(message(() => parseAddToCartPayload({ id: "v", quantity: "2" })), "addToCart.quantity: expected a number");
    assert.equal(message(() => parseAddToCartPayload({ id: "v", quantity: 1, metadata: { size: 3 } })), "addToCart.metadata.size: expected a string");
    assert.equal(message(() => parseCountryList([{ name: "A", code: "A" }, { name: "B" }])), "countries[1].code: expected a string");
    assert.equal(message(() => parseCountryList({})), "countries: expected an array");
    assert.equal(
      message(() => parseStoredCheckout({ products: [{ id: "l", productID: "p", quantity: 1, amount: 1.5 }] })),
      "checkout.products[0].amount: expected a non-negative integer",
    );
    assert.equal(message(() => parseStoredCheckout({ googlePayConfig: { isAvailable: true } })), "checkout.googlePayConfig.merchantId: expected a string");
  });

  it("does not echo the rejected value", () => {
    assert.ok(!message(() => parseBuyProductArgs({ productID: "secret@example.test", email: 5 })).includes("secret"));
  });
});
