import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  AUTO_LOAD_MAX_BYTES,
  defaultDecoderPath,
  formatModelSize,
  needsClickToLoad,
} from "./constants.ts";
import { VIEWER3D_COPY_EN, VIEWER3D_COPY_PL, viewer3DCopy } from "./copy.ts";
import { formatDimensions, modelFactRows } from "./facts.ts";
import {
  GESTURE_HINT_STORAGE_KEY,
  hasSeenGestureHint,
  markGestureHintSeen,
} from "./gesture-hint.ts";
import {
  buildProduct3DURL,
  clearProduct3DCache,
  fetchProduct3D,
  pickProduct,
  pickVariant,
  resolveModel,
  type Product3DProduct,
} from "./model.ts";
import { cartItemIdFor, isCartable } from "./Product3DViewer.tsx";
import {
  initialShellState,
  isViewerMounted,
  shellReducer,
  type ShellEvent,
  type ShellState,
} from "./shell.machine.ts";

const nbsp = (text: string) => text.replace(/[  ]/g, " ");
const MB = 1024 * 1024;
const SMALL = { key: "https://f/a.glb", size: 4 * MB };
const BIG = { key: "https://f/b.glb", size: 24 * MB };
const run = (state: ShellState, ...events: ShellEvent[]) => events.reduce(shellReducer, state);

describe("viewer3d shell state machine", () => {
  it("auto-loads a model up to 10 MB once it is visible", () => {
    const state = initialShellState(SMALL);
    assert.equal(state.status, "poster");
    assert.equal(isViewerMounted(state.status), false);
    const visible = run(state, { type: "VISIBLE" });
    assert.equal(visible.status, "loading");
    assert.equal(isViewerMounted(visible.status), true);
  });

  it("treats exactly 10 MB as small and one byte more as big", () => {
    assert.equal(initialShellState({ key: "x", size: AUTO_LOAD_MAX_BYTES }).status, "poster");
    assert.equal(initialShellState({ key: "x", size: AUTO_LOAD_MAX_BYTES + 1 }).status, "awaiting-click");
  });

  it("does not load a big model on visibility, only on request", () => {
    const state = run(initialShellState(BIG), { type: "VISIBLE" });
    assert.equal(state.status, "awaiting-click");
    assert.equal(isViewerMounted(state.status), false);
    assert.equal(run(state, { type: "REQUEST" }).status, "loading");
  });

  it("tracks progress and becomes ready on the first frame", () => {
    const loading = run(initialShellState(SMALL), { type: "VISIBLE" });
    const half = run(loading, { type: "PROGRESS", key: SMALL.key, loaded: 50, total: 100 });
    assert.equal(half.progress, 0.5);
    const ready = run(half, { type: "LOADED", key: SMALL.key });
    assert.equal(ready.status, "ready");
    assert.equal(ready.progress, 1);
  });

  it("keeps the poster on error and retries with a new attempt", () => {
    const failed = run(initialShellState(SMALL), { type: "VISIBLE" }, { type: "FAILED", key: SMALL.key });
    assert.equal(failed.status, "error");
    assert.equal(isViewerMounted(failed.status), false);
    const retried = run(failed, { type: "RETRY" });
    assert.deepEqual([retried.status, retried.attempt, retried.progress], ["loading", 1, 0]);
  });

  it("ignores results of a model that is no longer shown", () => {
    const loading = run(initialShellState(SMALL), { type: "VISIBLE" });
    const switched = run(loading, { type: "MODEL_CHANGED", model: BIG, visible: true });
    assert.equal(run(switched, { type: "LOADED", key: SMALL.key }).status, "awaiting-click");
    assert.equal(run(switched, { type: "FAILED", key: SMALL.key }).status, "awaiting-click");
  });

  it("re-checks the size rule per variant and does not remember a click", () => {
    const ready = run(initialShellState(SMALL), { type: "VISIBLE" }, { type: "LOADED", key: SMALL.key });
    assert.equal(run(ready, { type: "MODEL_CHANGED", model: BIG, visible: true }).status, "awaiting-click");
    const other = { key: "https://f/c.glb", size: 1000 };
    assert.equal(run(ready, { type: "MODEL_CHANGED", model: other, visible: true }).status, "loading");
    assert.equal(run(ready, { type: "MODEL_CHANGED", model: other, visible: false }).status, "poster");
    assert.equal(run(ready, { type: "MODEL_CHANGED", model: SMALL, visible: true }), ready);
    const back = run(
      run(initialShellState(BIG), { type: "REQUEST" }),
      { type: "MODEL_CHANGED", model: SMALL, visible: false },
      { type: "MODEL_CHANGED", model: BIG, visible: true },
    );
    assert.equal(back.status, "awaiting-click");
  });

  it("stays on the poster without WebGL", () => {
    const state = run(initialShellState(SMALL), { type: "NO_WEBGL" }, { type: "VISIBLE" }, { type: "REQUEST" });
    assert.equal(state.status, "unsupported");
  });
});

describe("viewer3d sizes, facts, copy and decoder", () => {
  it("asks for a click only above 10 MB and formats sizes", () => {
    assert.equal(needsClickToLoad(AUTO_LOAD_MAX_BYTES), false);
    assert.equal(needsClickToLoad(AUTO_LOAD_MAX_BYTES + 1), true);
    assert.equal(formatModelSize(24 * MB), "24 MB");
    assert.equal(formatModelSize(4.2 * MB), "4,2 MB");
    assert.equal(formatModelSize(4.2 * MB, "en-GB"), "4.2 MB");
    assert.equal(nbsp(formatModelSize(820 * 1024)), "820 kB");
    assert.equal(VIEWER3D_COPY_PL.show("24 MB"), "Pokaż model 3D (24 MB)");
  });

  it("lists the model facts in the merchant's unit", () => {
    assert.equal(nbsp(formatDimensions([320, 180, 125], "centimeters", VIEWER3D_COPY_PL)!), "32 × 18 × 12,5 cm");
    assert.equal(formatDimensions([25.4, 50.8, 12.7], "inches", VIEWER3D_COPY_EN, "en"), "1 × 2 × 0.5 in");
    const rows = modelFactRows(
      { fileSize: 4.2 * MB, triangleCount: 48210, dimensionsMm: [10, 20, 30], unit: "millimeters" },
      VIEWER3D_COPY_PL,
    );
    assert.deepEqual(rows.map((row) => [row.label, nbsp(row.value)]), [
      ["Format", "GLB"],
      ["Rozmiar pliku", "4,2 MB"],
      ["Trójkąty", "48 210"],
      ["Wymiary", "10 × 20 × 30 mm"],
    ]);
  });

  it("picks the copy by locale and applies overrides", () => {
    assert.equal(viewer3DCopy("en-US").retry, "Try again");
    assert.equal(viewer3DCopy().retry, "Spróbuj ponownie");
    assert.equal(viewer3DCopy("pl", { retry: "Jeszcze raz" }).retry, "Jeszcze raz");
  });

  it("defaults the Draco decoder to three's files for the installed revision", () => {
    assert.equal(
      defaultDecoderPath("187"),
      "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/libs/draco/gltf/",
    );
    assert.equal(defaultDecoderPath("170dev"), defaultDecoderPath("170"));
  });

  it("remembers the gesture hint and survives broken storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    assert.equal(hasSeenGestureHint(storage), false);
    markGestureHintSeen(storage);
    assert.equal(hasSeenGestureHint(storage), true);
    assert.equal(values.get(GESTURE_HINT_STORAGE_KEY), "1");
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    assert.equal(hasSeenGestureHint(broken), false);
    assert.doesNotThrow(() => markGestureHintSeen(broken));
  });
});

const model = (url: string, size = 1000) => ({ previewUrl: url, previewSize: size, illustrative: true });
const product: Product3DProduct = {
  id: "prodv2_abc",
  name: "Figurka",
  price: 4900,
  currency: "PLN",
  model3d: model("https://f/product.glb"),
  variants: [
    { id: "prodv2_abc_default", name: "Biała", price: 4900, currency: "PLN", model3d: model("https://f/product.glb") },
    { id: "prodv2_abc_red", name: "Czerwona", price: 5900, currency: "PLN", model3d: model("https://f/red.glb") },
    { id: "prodv2_abc_none", name: "Bez modelu", price: 5900, currency: "PLN" },
  ],
};

describe("viewer3d product data", () => {
  it("builds the products URL with include=model3d", () => {
    assert.equal(
      buildProduct3DURL({ projectID: "p 1", host: "https://shop.test/", productId: "prodv2_abc", locale: "en" }),
      "https://shop.test/api/integrations/p%201/public-commerce/products?ids=prodv2_abc&locale=en&include=model3d",
    );
  });

  it("resolves the model of the chosen variant, else the product's", () => {
    assert.equal(resolveModel(product)?.previewUrl, "https://f/product.glb");
    assert.equal(resolveModel(product, "prodv2_abc_red")?.previewUrl, "https://f/red.glb");
    assert.equal(resolveModel(product, "red")?.previewUrl, "https://f/red.glb", "short variant id");
    assert.equal(resolveModel(product, "prodv2_abc_none"), undefined, "a variant without a model shows none");
    assert.equal(resolveModel(product, "unknown")?.previewUrl, "https://f/product.glb");
    const variantsOnly = { ...product, model3d: undefined, variants: product.variants!.slice(1) };
    assert.equal(resolveModel(variantsOnly)?.previewUrl, "https://f/red.glb");
    assert.equal(resolveModel({ ...product, model3d: { previewUrl: "", previewSize: 1 } as never, variants: [] }), undefined);
  });

  it("finds the product by its id or by one of its variants", () => {
    const other = { ...product, id: "prodv2_other", variants: [] };
    assert.equal(pickProduct([other, product], "prodv2_abc"), product);
    assert.equal(pickProduct([other, product], "prodv2_abc_red"), product);
    assert.equal(pickProduct([other, product], "prodv2_x"), undefined);
    assert.equal(pickVariant(product, undefined), undefined);
    // The server answers `prodv2_abc` with the item `prodv2_abc_default`.
    const asDefault = { ...product, id: "prodv2_abc_default" };
    assert.equal(pickProduct([asDefault], "prodv2_abc"), asDefault);
    assert.equal(pickVariant(asDefault, "red")?.id, "prodv2_abc_red");
    assert.equal(resolveModel(asDefault, "prodv2_abc")?.previewUrl, "https://f/product.glb");
  });

  it("adds the chosen variant, else the default one, to the cart", () => {
    assert.equal(cartItemIdFor(product, product.variants![1]), "prodv2_abc_red");
    assert.equal(cartItemIdFor(product, undefined), "prodv2_abc_default");
    assert.equal(cartItemIdFor({ ...product, variants: [] }, undefined), "prodv2_abc");
    assert.equal(isCartable(product, undefined), true);
    assert.equal(isCartable({ ...product, recurring: { billingPeriod: "month" } }, undefined), false);
    assert.equal(isCartable(product, { ...product.variants![0], priceType: "pay_what_you_want" }), false);
    assert.equal(isCartable(product, { ...product.variants![0], availableQuantity: 0 }), false);
  });
});

describe("viewer3d fetch", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearProduct3DCache();
  });

  it("shares one request per URL and forgets failures", async () => {
    let calls = 0;
    let fail = true;
    globalThis.fetch = (async (input: string, init?: RequestInit) => {
      calls += 1;
      assert.equal(init?.credentials, "omit");
      assert.match(String(input), /include=model3d/);
      if (fail) return new Response("", { status: 503 });
      return new Response(JSON.stringify({ success: true, result: [product] }));
    }) as typeof fetch;
    const query = { projectID: "p", host: "https://h.test", productId: "prodv2_abc" };

    await assert.rejects(fetchProduct3D(query), /503/);
    fail = false;
    const [first, second] = await Promise.all([fetchProduct3D(query), fetchProduct3D(query)]);
    assert.equal(first, second);
    assert.equal(first[0].id, "prodv2_abc");
    assert.equal(calls, 2, "the failure was retried, the success was shared");
  });

  it("reads an older server's answer (no model3d) as no model", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, result: [{ ...product, model3d: undefined, variants: [] }] }))) as typeof fetch;
    const [loaded] = await fetchProduct3D({ projectID: "p", host: "https://old.test", productId: "prodv2_abc" });
    assert.equal(resolveModel(loaded), undefined);
  });
});
