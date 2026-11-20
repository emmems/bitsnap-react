import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  CART_SNAPSHOT_KEY,
  CART_SNAPSHOT_MAX_AGE_MS,
  CART_SNAPSHOT_MAX_BYTES,
  CART_SNAPSHOT_MAX_ENTRIES,
  isSnapshotPriceExpired,
  parseSnapshotFile,
  readSnapshot,
  resetCartSnapshotState,
  snapshotEntryKey,
  snapshotVersionSnapshot,
  subscribeToSnapshot,
  toLineDetails,
  writeSnapshot,
  type CartLineDetails,
  type CartSnapshotEnv,
  type SnapshotStorage,
} from "./cart-snapshot.ts";
import { setLocale } from "./locale.ts";

const NOW = 1_800_000_000_000;
const HOST = "https://bitsnap.pl";

function memoryStorage(options: { failSetItem?: boolean } = {}) {
  const values = new Map<string, string>();
  let failSetItem = options.failSetItem ?? false;
  const storage: SnapshotStorage & {
    values: Map<string, string>;
    fail: (on: boolean) => void;
  } = {
    values,
    fail: (on) => {
      failSetItem = on;
    },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failSetItem) {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
      values.set(key, value);
    },
    removeItem: (key) => void values.delete(key),
  };
  return storage;
}

function env(storage: SnapshotStorage | null, extra: Partial<CartSnapshotEnv> = {}): CartSnapshotEnv {
  return { projectID: "proj", host: HOST, storage, now: NOW, ...extra };
}

function pricing(overrides: Record<string, unknown> = {}) {
  return {
    regularPrice: 1000,
    effectivePrice: 1000,
    currency: "PLN",
    referencePrice: { windowDays: 30, asOf: 1, basis: "observed-history", historyAvailable: false },
    priceVersion: "v1",
    ...overrides,
  };
}

function details(id: string, overrides: Record<string, unknown> = {}): CartLineDetails {
  return {
    id,
    name: `Product ${id}`,
    price: 1000,
    currency: "PLN",
    image_url: "https://cdn.example.com/a.jpg",
    pricing: pricing(),
    ...overrides,
  } as CartLineDetails;
}

function rawEntry(id: string, overrides: Record<string, unknown> = {}) {
  return { at: NOW - 1000, details: details(id), ...overrides };
}

function rawFile(entries: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return { v: 1, projectID: "proj", host: HOST, entries, ...overrides };
}

function seed(storage: ReturnType<typeof memoryStorage>, file: unknown) {
  storage.values.set(CART_SNAPSHOT_KEY, typeof file === "string" ? file : JSON.stringify(file));
}

// The snapshot is browser-only: reads and writes are no-ops without a `window`.
const globals = globalThis as unknown as { window?: unknown; localStorage?: unknown };
let windowBeforeTest: unknown;

beforeEach(() => {
  windowBeforeTest = globals.window;
  globals.window = {};
  resetCartSnapshotState();
  setLocale(undefined);
});
afterEach(() => {
  resetCartSnapshotState();
  setLocale(undefined);
  globals.window = windowBeforeTest;
});

describe("snapshot round trip", () => {
  it("writes and reads an entry", () => {
    const storage = memoryStorage();
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1"), catalogProductID: "cat1" }], ["p1"], env(storage));
    const snapshot = readSnapshot("pl-PL", env(storage));
    assert.deepEqual(Object.keys(snapshot), ["p1"]);
    assert.equal(snapshot.p1!.details.name, "Product p1");
    assert.equal(snapshot.p1!.details.pricing?.priceVersion, "v1");
    assert.equal(snapshot.p1!.catalogProductID, "cat1");
    assert.equal(snapshot.p1!.at, NOW);
  });

  it("keeps entries of other locales apart", () => {
    const storage = memoryStorage();
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1", { name: "Nazwa" }) }], ["p1"], env(storage));
    writeSnapshot("en-US", [{ productID: "p1", details: details("p1", { name: "Name" }) }], ["p1"], env(storage));
    assert.equal(readSnapshot("pl-PL", env(storage)).p1!.details.name, "Nazwa");
    assert.equal(readSnapshot("en-US", env(storage)).p1!.details.name, "Name");
    assert.deepEqual(readSnapshot("de-DE", env(storage)), {});
  });

  it("copies the pay-what-you-want fields", () => {
    const storage = memoryStorage();
    writeSnapshot(
      "pl-PL",
      [{ productID: "p1", details: details("p1", { priceType: "pay_what_you_want", recurring: { billingPeriod: "monthly", trialDays: 7 } }) }],
      ["p1"],
      env(storage),
    );
    const read = readSnapshot("pl-PL", env(storage)).p1!.details;
    assert.equal(read.priceType, "pay_what_you_want");
    assert.deepEqual(read.recurring, { billingPeriod: "monthly", trialDays: 7 });
  });

  it("trims images to the first one", () => {
    const storage = memoryStorage();
    writeSnapshot(
      "pl-PL",
      [{ productID: "p1", details: details("p1", { images: ["https://a.example/1.jpg", "https://a.example/2.jpg"] }) }],
      ["p1"],
      env(storage),
    );
    assert.deepEqual(readSnapshot("pl-PL", env(storage)).p1!.details.images, ["https://a.example/1.jpg"]);
  });

  it("toLineDetails picks the known fields only", () => {
    const picked = toLineDetails({
      ...details("p1"),
      description: "<p>long</p>",
      metadata: { a: 1 },
      tax: 23,
    } as never);
    assert.deepEqual(Object.keys(picked).sort(), ["currency", "id", "image_url", "name", "price", "pricing"]);
  });

  it("does nothing without a project", () => {
    const storage = memoryStorage();
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1") }], ["p1"], env(storage, { projectID: undefined }));
    assert.equal(storage.values.size, 0);
    assert.deepEqual(readSnapshot("pl-PL", env(storage, { projectID: undefined })), {});
  });
});

describe("reading a bad file", () => {
  it("treats an unknown version as empty and rewrites it on the next write", () => {
    const storage = memoryStorage();
    seed(storage, rawFile({ "pl-PL|p1": rawEntry("p1") }, { v: 2 }));
    assert.deepEqual(readSnapshot("pl-PL", env(storage)), {});
    writeSnapshot("pl-PL", [{ productID: "p2", details: details("p2") }], ["p1", "p2"], env(storage));
    assert.deepEqual(Object.keys(readSnapshot("pl-PL", env(storage))), ["p2"]);
    assert.equal(JSON.parse(storage.values.get(CART_SNAPSHOT_KEY)!).v, 1);
  });

  it("ignores a file of another project or host", () => {
    const storage = memoryStorage();
    seed(storage, rawFile({ "pl-PL|p1": rawEntry("p1") }, { projectID: "other" }));
    assert.deepEqual(readSnapshot("pl-PL", env(storage)), {});
    seed(storage, rawFile({ "pl-PL|p1": rawEntry("p1") }, { host: "https://shop.example" }));
    assert.deepEqual(readSnapshot("pl-PL", env(storage)), {});
    assert.deepEqual(Object.keys(readSnapshot("pl-PL", env(storage, { host: "https://shop.example" }))), ["p1"]);
  });

  it("gives an empty snapshot for malformed JSON and wrong shapes", () => {
    const storage = memoryStorage();
    for (const raw of ["{nope", "null", "[]", '"text"', "5", JSON.stringify({ v: 1 }), JSON.stringify(rawFile([] as never))]) {
      seed(storage, raw);
      resetCartSnapshotState();
      assert.deepEqual(readSnapshot("pl-PL", env(storage)), {}, raw);
    }
  });

  it("drops an invalid entry and keeps the rest", () => {
    const storage = memoryStorage();
    seed(
      storage,
      rawFile({
        "pl-PL|ok": rawEntry("ok"),
        "pl-PL|bad": rawEntry("bad", { at: "yesterday" }),
        "nokey": rawEntry("nokey"),
        "|empty-locale": rawEntry("x"),
        "pl-PL|": rawEntry("x"),
      }),
    );
    assert.deepEqual(Object.keys(readSnapshot("pl-PL", env(storage))), ["ok"]);
  });
});

describe("hand-written validation (D3)", () => {
  const parse = (entry: unknown) => parseSnapshotFile(rawFile({ "pl-PL|p": entry }))!.entries["pl-PL|p"];

  it("accepts a good entry", () => {
    assert.ok(parse(rawEntry("p")));
  });

  it("rejects wrong types and non-finite numbers", () => {
    assert.equal(parse(rawEntry("p", { at: Number.NaN })), undefined);
    assert.equal(parse(rawEntry("p", { at: -1 })), undefined);
    assert.equal(parse(null), undefined);
    assert.equal(parse("x"), undefined);
    assert.equal(parse({ at: NOW }), undefined);
    for (const patch of [
      { id: 5 },
      { name: 5 },
      { name: "" },
      { price: "10" },
      { price: Number.POSITIVE_INFINITY },
      { price: Number.NaN },
      { price: -1 },
      { currency: 1 },
      { baseName: 1 },
      { isDeliverable: "yes" },
      { availableQuantity: Number.POSITIVE_INFINITY },
      { priceType: 4 },
      { recurring: { billingPeriod: 1 } },
      { recurring: "monthly" },
    ]) {
      assert.equal(parse(rawEntry("p", { details: details("p", patch) })), undefined, JSON.stringify(patch));
    }
  });

  it("rejects data: and over-long image URLs", () => {
    assert.equal(parse(rawEntry("p", { details: details("p", { image_url: "data:image/png;base64,AAAA" }) })), undefined);
    assert.equal(parse(rawEntry("p", { details: details("p", { image_url: "javascript:alert(1)" }) })), undefined);
    assert.equal(parse(rawEntry("p", { details: details("p", { image_url: `https://a.example/${"x".repeat(600)}` }) })), undefined);
    assert.equal(parse(rawEntry("p", { details: details("p", { images: ["data:image/png;base64,AAAA"] }) })), undefined);
    assert.equal(parse(rawEntry("p", { details: details("p", { images: "https://a.example/1.jpg" }) })), undefined);
    assert.ok(parse(rawEntry("p", { details: details("p", { image_url: null }) })));
  });

  it("does not copy unknown keys", () => {
    const entry = parse({
      at: NOW,
      evil: "x",
      details: { ...details("p"), description: "<script>", extra: 1, pricing: { ...pricing(), tricky: 1, referencePrice: { ...pricing().referencePrice, tricky: 1 } } },
    })!;
    assert.deepEqual(Object.keys(entry).sort(), ["at", "details"]);
    assert.ok(!("description" in entry.details));
    assert.ok(!("extra" in entry.details));
    assert.ok(!("tricky" in entry.details.pricing!));
    assert.ok(!("tricky" in entry.details.pricing!.referencePrice));
  });

  it("drops the entry on a bad pricing instead of repairing it", () => {
    for (const patch of [
      { regularPrice: "10" },
      { effectivePrice: Number.NaN },
      { currency: "" },
      { priceVersion: "" },
      { priceVersion: 3 },
      { referencePrice: null },
      { referencePrice: { historyAvailable: "no" } },
      { referencePrice: { historyAvailable: true, amount: "5" } },
      { nextPriceChangeAt: "soon" },
      { discount: { id: "d", type: "FIXED", value: 1, status: "PAUSED" } },
      { discount: { id: "d", type: "WEIRD", value: 1, status: "ACTIVE" } },
      { discount: "10%" },
    ]) {
      assert.equal(
        parse(rawEntry("p", { details: details("p", { pricing: pricing(patch) }) })),
        undefined,
        JSON.stringify(patch),
      );
    }
  });

  it("keeps a complete discount and reference price", () => {
    const entry = parse(
      rawEntry("p", {
        details: details("p", {
          pricing: pricing({
            effectivePrice: 800,
            discount: { id: "d", type: "PERCENTAGE", value: 20, status: "ACTIVE", startsAt: 1, endsAt: 2 },
            referencePrice: { windowDays: 30, asOf: 5, basis: "observed-history", historyAvailable: true, amount: 900 },
            nextPriceChangeAt: 1_900_000_000,
          }),
        }),
      }),
    )!;
    assert.equal(entry.details.pricing?.discount?.status, "ACTIVE");
    assert.equal(entry.details.pricing?.referencePrice.amount, 900);
    assert.equal(entry.details.pricing?.nextPriceChangeAt, 1_900_000_000);
  });

  it("has no zod import", () => {
    // Tests run from the package root (see the `test` script).
    for (const file of ["cart-snapshot.ts", "cart-view.ts"]) {
      const source = readFileSync(`src/components/checkout/${file}`, "utf8");
      assert.ok(!/from\s+["']zod/.test(source), file);
    }
  });
});

describe("limits, expiry, prune", () => {
  it("drops the oldest entries over the entry cap", () => {
    const storage = memoryStorage();
    const entries: Record<string, unknown> = {};
    const ids: string[] = [];
    for (let index = 0; index < CART_SNAPSHOT_MAX_ENTRIES + 5; index += 1) {
      const id = `p${index}`;
      ids.push(id);
      entries[`pl-PL|${id}`] = rawEntry(id, { at: NOW - 100_000 + index });
    }
    seed(storage, rawFile(entries));
    writeSnapshot("pl-PL", [{ productID: "new", details: details("new") }], [...ids, "new"], env(storage));
    const read = readSnapshot("pl-PL", env(storage));
    assert.equal(Object.keys(read).length, CART_SNAPSHOT_MAX_ENTRIES);
    assert.ok(read.new);
    assert.ok(!read.p0, "oldest dropped");
    assert.ok(read[`p${CART_SNAPSHOT_MAX_ENTRIES + 4}`], "newest kept");
  });

  it("drops the oldest entries over the size cap", () => {
    const storage = memoryStorage();
    const fat = (id: string) => details(id, { name: "n".repeat(200), baseName: "b".repeat(200), variantName: "v".repeat(200) });
    const ids = Array.from({ length: 90 }, (_, index) => `product-${index}`);
    const entries: Record<string, unknown> = {};
    ids.forEach((id, index) => {
      entries[`pl-PL|${id}`] = { at: NOW - 100_000 + index, details: fat(id) };
    });
    seed(storage, rawFile(entries));
    writeSnapshot("pl-PL", [{ productID: "fresh", details: fat("fresh") }], [...ids, "fresh"], env(storage));
    const raw = storage.values.get(CART_SNAPSHOT_KEY)!;
    assert.ok(raw.length <= CART_SNAPSHOT_MAX_BYTES, `${raw.length}`);
    const read = readSnapshot("pl-PL", env(storage));
    assert.ok(read.fresh, "newest kept");
    assert.ok(!read["product-0"], "oldest dropped");
  });

  it("drops entries older than 30 days on read and on write", () => {
    const storage = memoryStorage();
    seed(
      storage,
      rawFile({
        "pl-PL|old": rawEntry("old", { at: NOW - CART_SNAPSHOT_MAX_AGE_MS - 1 }),
        "pl-PL|edge": rawEntry("edge", { at: NOW - CART_SNAPSHOT_MAX_AGE_MS }),
      }),
    );
    assert.deepEqual(Object.keys(readSnapshot("pl-PL", env(storage))), ["edge"]);
    writeSnapshot("pl-PL", [], ["old", "edge"], env(storage));
    const stored = JSON.parse(storage.values.get(CART_SNAPSHOT_KEY)!);
    assert.deepEqual(Object.keys(stored.entries), ["pl-PL|edge"]);
  });

  it("prunes entries no line references, in every locale", () => {
    const storage = memoryStorage();
    seed(storage, rawFile({ "pl-PL|keep": rawEntry("keep"), "pl-PL|gone": rawEntry("gone"), "en-US|gone": rawEntry("gone") }));
    writeSnapshot("pl-PL", [{ productID: "new", details: details("new") }], ["keep", "new"], env(storage));
    assert.deepEqual(Object.keys(JSON.parse(storage.values.get(CART_SNAPSHOT_KEY)!).entries).sort(), ["pl-PL|keep", "pl-PL|new"]);
  });

  it("does not write an answer for an unreferenced product", () => {
    const storage = memoryStorage();
    writeSnapshot("pl-PL", [{ productID: "other", details: details("other") }], ["p1"], env(storage));
    assert.deepEqual(readSnapshot("pl-PL", env(storage)), {});
  });

  it("skips an answer that would not read back", () => {
    const storage = memoryStorage();
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1", { image_url: "data:x" }) }, { productID: "p2", details: details("p2") }], ["p1", "p2"], env(storage));
    assert.deepEqual(Object.keys(readSnapshot("pl-PL", env(storage))), ["p2"]);
  });

  it("treats a price as expired once nextPriceChangeAt (seconds) has passed", () => {
    const at = Math.floor(NOW / 1000);
    assert.equal(isSnapshotPriceExpired({ pricing: pricing({ nextPriceChangeAt: at - 1 }) as never }, NOW), true);
    assert.equal(isSnapshotPriceExpired({ pricing: pricing({ nextPriceChangeAt: at }) as never }, NOW), true);
    assert.equal(isSnapshotPriceExpired({ pricing: pricing({ nextPriceChangeAt: at + 60 }) as never }, NOW), false);
    assert.equal(isSnapshotPriceExpired({ pricing: pricing() as never }, NOW), false);
    assert.equal(isSnapshotPriceExpired({}, NOW), false);
  });
});

describe("locale spelling", () => {
  it("builds the key with the normalised locale", () => {
    assert.equal(snapshotEntryKey("en", "p"), "en-US|p");
    assert.equal(snapshotEntryKey("en-US", "p"), "en-US|p");
    assert.equal(snapshotEntryKey(" en ", "p"), "en-US|p");
    assert.equal(snapshotEntryKey("pl", "p"), "pl-PL|p");
    assert.equal(snapshotEntryKey("pl-PL", "p"), "pl-PL|p");
  });

  it("uses the active locale when none is given", () => {
    setLocale("en");
    assert.equal(snapshotEntryKey(undefined, "p"), "en-US|p");
  });

  it("reads under \"en\" what was written under \"en-US\" and the other way round", () => {
    const storage = memoryStorage();
    writeSnapshot("en-US", [{ productID: "a", details: details("a") }], ["a", "b"], env(storage));
    assert.ok(readSnapshot("en", env(storage)).a);
    assert.ok(readSnapshot(" en ", env(storage)).a);
    writeSnapshot("en", [{ productID: "b", details: details("b") }], ["a", "b"], env(storage));
    assert.deepEqual(Object.keys(readSnapshot("en-US", env(storage))).sort(), ["a", "b"]);
    writeSnapshot("pl", [{ productID: "a", details: details("a") }], ["a", "b"], env(storage));
    assert.ok(readSnapshot("pl-PL", env(storage)).a);
  });
});

describe("write semantics", () => {
  it("a server answer overwrites an existing entry", () => {
    const storage = memoryStorage();
    seed(storage, rawFile({ "pl-PL|p1": rawEntry("p1") }));
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1", { name: "Newer", pricing: pricing({ priceVersion: "v2" }) }) }], ["p1"], env(storage));
    const entry = readSnapshot("pl-PL", env(storage)).p1!;
    assert.equal(entry.details.name, "Newer");
    assert.equal(entry.details.pricing?.priceVersion, "v2");
    assert.equal(entry.at, NOW);
  });

  it("caps an `at` one year ahead on read and overwrites it on the next answer", () => {
    const storage = memoryStorage();
    const future = NOW + 365 * 24 * 60 * 60 * 1000;
    seed(storage, rawFile({ "pl-PL|p1": { at: future, details: details("p1", { name: "Tampered" }) } }));
    assert.equal(readSnapshot("pl-PL", env(storage)).p1!.at, NOW);
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1", { name: "Server" }) }], ["p1"], env(storage));
    const entry = readSnapshot("pl-PL", env(storage)).p1!;
    assert.equal(entry.details.name, "Server");
    assert.equal(JSON.parse(storage.values.get(CART_SNAPSHOT_KEY)!).entries["pl-PL|p1"].at, NOW);
  });
});

describe("quota", () => {
  it("removes the snapshot key, keeps entries in memory and does not throw", () => {
    const storage = memoryStorage();
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1") }], ["p1", "p2"], env(storage));
    assert.ok(storage.values.has(CART_SNAPSHOT_KEY));
    storage.fail(true);
    assert.doesNotThrow(() =>
      writeSnapshot("pl-PL", [{ productID: "p2", details: details("p2") }], ["p1", "p2"], env(storage)),
    );
    assert.equal(storage.values.has(CART_SNAPSHOT_KEY), false);
    assert.deepEqual(Object.keys(readSnapshot("pl-PL", env(storage))).sort(), ["p1", "p2"]);
  });

  it("goes back to the storage when it accepts writes again", () => {
    const storage = memoryStorage({ failSetItem: true });
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1") }], ["p1"], env(storage));
    assert.equal(storage.values.size, 0);
    assert.ok(readSnapshot("pl-PL", env(storage)).p1);
    storage.fail(false);
    writeSnapshot("pl-PL", [{ productID: "p2", details: details("p2") }], ["p1", "p2"], env(storage));
    assert.deepEqual(Object.keys(JSON.parse(storage.values.get(CART_SNAPSHOT_KEY)!).entries).sort(), ["pl-PL|p1", "pl-PL|p2"]);
  });

  it("works with no storage at all", () => {
    assert.doesNotThrow(() =>
      writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1") }], ["p1"], env(null)),
    );
    assert.ok(readSnapshot("pl-PL", env(null)).p1);
  });

  it("survives a storage whose getItem throws", () => {
    const broken: SnapshotStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    assert.deepEqual(readSnapshot("pl-PL", env(broken)), {});
    assert.doesNotThrow(() => writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1") }], ["p1"], env(broken)));
    assert.ok(readSnapshot("pl-PL", env(broken)).p1);
  });
});

describe("server render", () => {
  it("reads and writes nothing without a window and leaks nothing into the browser", () => {
    const storage = memoryStorage();
    seed(storage, rawFile({ "pl-PL|p1": rawEntry("p1") }));
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1") }], ["p1"], env(storage));
    const stored = storage.values.get(CART_SNAPSHOT_KEY);
    const versionBefore = snapshotVersionSnapshot();
    globals.window = undefined;
    try {
      assert.deepEqual(readSnapshot("pl-PL", env(storage)), {});
      writeSnapshot("pl-PL", [{ productID: "p2", details: details("p2") }], ["p1", "p2"], env(storage));
      writeSnapshot("pl-PL", [{ productID: "p3", details: details("p3") }], ["p3"], env(null));
      assert.deepEqual(readSnapshot("pl-PL", env(null)), {}, "no process-wide memory file");
    } finally {
      globals.window = {};
    }
    assert.equal(storage.values.get(CART_SNAPSHOT_KEY), stored, "storage untouched");
    assert.equal(snapshotVersionSnapshot(), versionBefore, "no notification");
    assert.deepEqual(readSnapshot("pl-PL", env(null)), {}, "nothing reached the memory fallback");
  });
});

describe("hostile and oversized input", () => {
  it("does not let a product id act on the prototype of the result", () => {
    const storage = memoryStorage();
    seed(
      storage,
      `{"v":1,"projectID":"proj","host":"${HOST}","entries":{"pl-PL|__proto__":${JSON.stringify(rawEntry("x"))},"pl-PL|constructor":${JSON.stringify(rawEntry("y"))},"pl-PL|prototype":${JSON.stringify(rawEntry("z"))},"pl-PL|ok":${JSON.stringify(rawEntry("ok"))}}}`,
    );
    const read = readSnapshot("pl-PL", env(storage));
    assert.deepEqual(Object.keys(read), ["ok"]);
    assert.equal(Object.getPrototypeOf(read), Object.prototype);
    assert.equal((read as Record<string, unknown>).details, undefined);
    assert.deepEqual(Object.keys(parseSnapshotFile(JSON.parse(storage.values.get(CART_SNAPSHOT_KEY)!))!.entries), ["pl-PL|ok"]);
  });

  it("does not write an answer for such an id", () => {
    const storage = memoryStorage();
    writeSnapshot(
      "pl-PL",
      ["__proto__", "constructor", "prototype", "ok"].map((id) => ({ productID: id, details: details(id) })),
      ["__proto__", "constructor", "prototype", "ok"],
      env(storage),
    );
    assert.deepEqual(Object.keys(JSON.parse(storage.values.get(CART_SNAPSHOT_KEY)!).entries), ["pl-PL|ok"]);
  });

  it("does not parse a raw string over twice the byte cap", () => {
    const storage = memoryStorage();
    const valid = JSON.stringify(rawFile({ "pl-PL|p1": rawEntry("p1") }));
    seed(storage, valid);
    assert.ok(readSnapshot("pl-PL", env(storage)).p1);
    seed(storage, valid + " ".repeat(2 * CART_SNAPSHOT_MAX_BYTES));
    let parses = 0;
    const originalParse = JSON.parse;
    JSON.parse = (text: string, reviver?: (key: string, value: unknown) => unknown) => {
      parses += 1;
      return originalParse(text, reviver);
    };
    try {
      assert.deepEqual(readSnapshot("pl-PL", env(storage)), {});
    } finally {
      JSON.parse = originalParse;
    }
    assert.equal(parses, 0);
  });

  it("copies a future-dated entry with `at` capped at now when it writes", () => {
    const storage = memoryStorage();
    const future = NOW + 365 * 24 * 60 * 60 * 1000;
    seed(storage, rawFile({ "pl-PL|p1": { at: future, details: details("p1") }, "pl-PL|p2": rawEntry("p2") }));
    writeSnapshot("pl-PL", [{ productID: "p3", details: details("p3") }], ["p1", "p2", "p3"], env(storage));
    const stored = JSON.parse(storage.values.get(CART_SNAPSHOT_KEY)!).entries;
    assert.equal(stored["pl-PL|p1"].at, NOW);
    assert.equal(stored["pl-PL|p2"].at, NOW - 1000);
  });

  it("accepts a long priceVersion (the server builds a JSON array) but not an absurd one", () => {
    const storage = memoryStorage();
    const long = "v".repeat(1000);
    writeSnapshot(
      "pl-PL",
      [
        { productID: "p1", details: details("p1", { pricing: pricing({ priceVersion: long }) }) },
        { productID: "p2", details: details("p2", { pricing: pricing({ priceVersion: `${long}x` }) }) },
      ],
      ["p1", "p2"],
      env(storage),
    );
    const read = readSnapshot("pl-PL", env(storage));
    assert.equal(read.p1!.details.pricing?.priceVersion, long);
    assert.ok(!read.p2);
  });

  it("cuts a long name instead of dropping the entry and its price version", () => {
    const storage = memoryStorage();
    writeSnapshot(
      "pl-PL",
      [{ productID: "p1", details: details("p1", { name: "n".repeat(500), baseName: "b".repeat(500), variantName: "v".repeat(500) }) }],
      ["p1"],
      env(storage),
    );
    const read = readSnapshot("pl-PL", env(storage)).p1!;
    assert.equal(read.details.name, "n".repeat(200));
    assert.equal(read.details.baseName, "b".repeat(200));
    assert.equal(read.details.variantName, "v".repeat(200));
    assert.equal(read.details.pricing?.priceVersion, "v1");
  });

  it("does not leave half a surrogate pair at the cut", () => {
    const storage = memoryStorage();
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1", { name: `${"a".repeat(199)}😀tail` }) }], ["p1"], env(storage));
    assert.equal(readSnapshot("pl-PL", env(storage)).p1!.details.name, "a".repeat(199));
  });
});

describe("stable store", () => {
  type Handler = (event: { key: string | null; storageArea?: unknown }) => void;
  let handlers: Handler[];
  let previousWindow: unknown;

  beforeEach(() => {
    handlers = [];
    previousWindow = globals.window;
    globals.window = {
      addEventListener: (_type: string, handler: Handler) => void handlers.push(handler),
      removeEventListener: (_type: string, handler: Handler) => {
        handlers = handlers.filter((entry) => entry !== handler);
      },
    };
  });
  afterEach(() => {
    globals.window = previousWindow;
  });

  it("returns the same version twice without a change", () => {
    assert.equal(snapshotVersionSnapshot(), snapshotVersionSnapshot());
  });

  it("a write bumps the version and calls the listeners", () => {
    const storage = memoryStorage();
    let calls = 0;
    const stop = subscribeToSnapshot(() => {
      calls += 1;
    });
    const before = snapshotVersionSnapshot();
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1") }], ["p1"], env(storage));
    assert.equal(snapshotVersionSnapshot(), before + 1);
    assert.equal(calls, 1);
    stop();
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1") }], ["p1"], env(storage));
    assert.equal(calls, 1);
  });

  it("bumps on a quota failure too", () => {
    const storage = memoryStorage({ failSetItem: true });
    const before = snapshotVersionSnapshot();
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1") }], ["p1"], env(storage));
    assert.equal(snapshotVersionSnapshot(), before + 1);
  });

  it("a storage event on the key bumps the version and drops the parse cache", () => {
    const storage = memoryStorage();
    seed(storage, rawFile({ "pl-PL|p1": rawEntry("p1", { details: details("p1", { name: "A" }) }) }));
    assert.equal(readSnapshot("pl-PL", env(storage)).p1!.details.name, "A");
    let calls = 0;
    const stop = subscribeToSnapshot(() => {
      calls += 1;
    });
    assert.equal(handlers.length, 1);
    // Another tab wrote the same key; the string differs, the parse is redone either way.
    seed(storage, rawFile({ "pl-PL|p1": rawEntry("p1", { details: details("p1", { name: "B" }) }) }));
    const before = snapshotVersionSnapshot();
    handlers[0]!({ key: "something-else" });
    assert.equal(snapshotVersionSnapshot(), before);
    handlers[0]!({ key: CART_SNAPSHOT_KEY });
    assert.equal(snapshotVersionSnapshot(), before + 1);
    assert.equal(calls, 1);
    assert.equal(readSnapshot("pl-PL", env(storage)).p1!.details.name, "B");
    handlers[0]!({ key: null });
    assert.equal(snapshotVersionSnapshot(), before + 2);
    stop();
    assert.equal(handlers.length, 0, "listener removed with the last subscriber");
  });

  it("ignores a storage event of another storage area", () => {
    const local = memoryStorage();
    globals.localStorage = local;
    try {
      const stop = subscribeToSnapshot(() => {});
      const before = snapshotVersionSnapshot();
      handlers[0]!({ key: CART_SNAPSHOT_KEY, storageArea: memoryStorage() });
      assert.equal(snapshotVersionSnapshot(), before, "sessionStorage");
      handlers[0]!({ key: CART_SNAPSHOT_KEY, storageArea: local });
      assert.equal(snapshotVersionSnapshot(), before + 1, "localStorage");
      stop();
    } finally {
      delete globals.localStorage;
    }
  });

  it("a storage event drops the in-memory fallback so the other tab's file wins", () => {
    const storage = memoryStorage({ failSetItem: true });
    writeSnapshot("pl-PL", [{ productID: "p1", details: details("p1") }], ["p1", "p2"], env(storage));
    assert.ok(readSnapshot("pl-PL", env(storage)).p1, "kept in memory");
    const stop = subscribeToSnapshot(() => {});
    storage.fail(false);
    seed(storage, rawFile({ "pl-PL|p2": rawEntry("p2") }));
    handlers[0]!({ key: CART_SNAPSHOT_KEY });
    assert.deepEqual(Object.keys(readSnapshot("pl-PL", env(storage))), ["p2"]);
    stop();
  });

  it("attaches one storage listener for several subscribers", () => {
    const stopA = subscribeToSnapshot(() => {});
    const stopB = subscribeToSnapshot(() => {});
    assert.equal(handlers.length, 1);
    stopA();
    assert.equal(handlers.length, 1);
    stopB();
    assert.equal(handlers.length, 0);
  });

  it("does not re-parse an unchanged raw string", () => {
    const storage = memoryStorage();
    seed(storage, rawFile({ "pl-PL|p1": rawEntry("p1") }));
    let reads = 0;
    const counting: SnapshotStorage = { ...storage, getItem: (key) => (reads++, storage.getItem(key)) };
    const originalParse = JSON.parse;
    let parses = 0;
    JSON.parse = (text: string, reviver?: (key: string, value: unknown) => unknown) => {
      parses += 1;
      return originalParse(text, reviver);
    };
    try {
      readSnapshot("pl-PL", env(counting));
      readSnapshot("pl-PL", env(counting));
      readSnapshot("pl-PL", env(counting));
    } finally {
      JSON.parse = originalParse;
    }
    assert.equal(reads, 3);
    assert.equal(parses, 1);
  });
});
