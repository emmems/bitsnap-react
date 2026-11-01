import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { setupReactPage, teardownReactPage } from "@/src/analytics/react-testing";
import type { Model3DView } from "./types.ts";

const page = setupReactPage("https://shop.example.test/p/figurka");
const win = page.win as unknown as Window & typeof globalThis;

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let Model3DViewer: typeof import("./Model3DShell.tsx").Model3DViewer;
let Product3DViewer: typeof import("./Product3DViewer.tsx").Product3DViewer;
let useProduct3DModel: typeof import("./useProduct3DModel.ts").useProduct3DModel;
let clearProduct3DCache: typeof import("./model.ts").clearProduct3DCache;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ Model3DViewer } = await import("./Model3DShell.tsx"));
  ({ Product3DViewer } = await import("./Product3DViewer.tsx"));
  ({ useProduct3DModel } = await import("./useProduct3DModel.ts"));
  ({ clearProduct3DCache } = await import("./model.ts"));
});
after(() => teardownReactPage());

const MB = 1024 * 1024;
type Observer = { callback: (entries: { isIntersecting: boolean }[]) => void };
let observers: Observer[] = [];
let mounts: string[] = [];
let behavior: "none" | "load" | "fail" = "none";
let fetches: string[] = [];
let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

/** The shell's contract with the three viewer, without three. */
function fakeLoader() {
  return Promise.resolve({
    default: function FakeViewer(props: { url: string; onLoaded: () => void; onError: (e: unknown) => void }) {
      React.useEffect(() => {
        mounts.push(props.url);
        if (behavior === "load") props.onLoaded();
        if (behavior === "fail") props.onError(new Error("boom"));
      }, [props.url]);
      return React.createElement("div", { "data-fake-viewer": props.url });
    },
  } as never);
}

function model(over: Partial<Model3DView> = {}): Model3DView {
  return {
    previewUrl: "https://files.test/models/a/preview.glb",
    previewSize: 4 * MB,
    thumbnailUrl: "https://files.test/models/a/thumb.webp",
    illustrative: true,
    ...over,
  };
}

const act = (fn: () => void | Promise<void>) => React.act(async () => void (await fn()));
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function intersect(isIntersecting: boolean) {
  await act(() => {
    for (const observer of observers) observer.callback([{ isIntersecting }]);
  });
}
const state = () => container.querySelector("[data-viewer3d-frame]")?.getAttribute("data-state");
const button = (text: string) =>
  [...container.querySelectorAll("button")].find((el) => el.textContent?.includes(text)) as HTMLButtonElement | undefined;

let webgl = true;
beforeEach(() => {
  observers = [];
  mounts = [];
  behavior = "none";
  fetches = [];
  webgl = true;
  win.localStorage.clear();
  clearProduct3DCache();
  Object.assign(globalThis, {
    IntersectionObserver: class {
      callback: Observer["callback"];
      constructor(callback: Observer["callback"]) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  });
  (win as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
  (win.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () =>
    webgl ? {} : null;
  container = win.document.createElement("div");
  win.document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});

async function render(props: Partial<Parameters<typeof Model3DViewer>[0]> = {}) {
  await act(() => {
    root.render(
      React.createElement(Model3DViewer, {
        model: model(),
        productName: "Kubek",
        loadViewer: fakeLoader,
        ...props,
      }),
    );
  });
}

describe("Model3DViewer", () => {
  it("auto-loads a small model when it becomes visible", async () => {
    await render();
    assert.equal(mounts.length, 0, "nothing loads before it is near the viewport");
    await intersect(true);
    await flush();
    assert.deepEqual(mounts, ["https://files.test/models/a/preview.glb"]);
  });

  it("shows the size of a big model and loads nothing before the click", async () => {
    await render({ model: model({ previewSize: 24 * MB }) });
    await intersect(true);
    await flush();
    assert.equal(button("Pokaż model 3D")?.textContent, "Pokaż model 3D (24 MB)");
    assert.equal(mounts.length, 0);
    await act(() => button("Pokaż model 3D")!.click());
    await flush();
    assert.equal(mounts.length, 1);
  });

  it("asks again when the next variant's model is big", async () => {
    behavior = "load";
    await render();
    await intersect(true);
    await flush();
    assert.equal(state(), "ready");
    assert.ok(container.querySelector('[aria-label="Pełny ekran"]'), "fullscreen control once ready");
    await render({ model: model({ previewUrl: "https://files.test/b.glb", previewSize: 30 * MB }) });
    await flush();
    assert.equal(state(), "awaiting-click");
    assert.match(container.textContent ?? "", /Pokaż model 3D \(30 MB\)/);
  });

  it("keeps the poster and retries after an error", async () => {
    behavior = "fail";
    const warn = console.warn;
    console.warn = () => {};
    try {
      await render();
      await intersect(true);
      await flush();
      assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Nie udało się wczytać modelu 3D/);
      assert.ok(container.querySelector('img[alt="Kubek"]'));
      behavior = "load";
      await act(() => button("Spróbuj ponownie")!.click());
      await flush();
      assert.equal(state(), "ready");
    } finally {
      console.warn = warn;
    }
  });

  it("fails into the retry state when three cannot be loaded", async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      await render({ loadViewer: () => Promise.reject(new Error("Cannot find module 'three'")) });
      await intersect(true);
      await flush();
      assert.equal(state(), "error");
    } finally {
      console.warn = warn;
    }
  });

  it("stays on the poster without WebGL", async () => {
    webgl = false;
    await render();
    await intersect(true);
    await flush();
    assert.equal(mounts.length, 0);
    assert.match(container.textContent ?? "", /Ta przeglądarka nie wyświetli modelu 3D/);
  });

  it("shows the disclaimer only when the product does not sell the file, in English too", async () => {
    await render();
    assert.match(container.textContent ?? "", /Model 3D jest poglądowy/);
    await render({ model: model({ illustrative: false }), locale: "en-US" });
    assert.doesNotMatch(container.textContent ?? "", /poglądowy|illustrative/);
  });
});

const products = {
  success: true,
  result: [
    {
      id: "prodv2_abc",
      name: "Figurka",
      price: 4900,
      currency: "PLN",
      model3d: model({ previewUrl: "https://files.test/product.glb" }),
      variants: [
        { id: "prodv2_abc_default", name: "Biała", price: 4900, currency: "PLN", model3d: model({ previewUrl: "https://files.test/product.glb" }) },
        { id: "prodv2_abc_red", name: "Czerwona", price: 5900, currency: "PLN", model3d: model({ previewUrl: "https://files.test/red.glb", previewSize: 20 * MB }) },
        { id: "prodv2_abc_none", name: "Bez", price: 5900, currency: "PLN" },
      ],
    },
  ],
};

function serve(body: unknown, status = 200) {
  globalThis.fetch = (async (input: string) => {
    fetches.push(String(input));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

describe("useProduct3DModel", () => {
  function Probe(props: { productId: string; variantId?: string; host?: string }) {
    const result = useProduct3DModel(props.productId, props.variantId, { projectID: "proj", host: props.host ?? "https://api.test" });
    return React.createElement("output", {
      "data-status": result.status,
      "data-url": result.model?.previewUrl ?? "",
      "data-variant": result.variant?.name ?? "",
    });
  }
  const out = () => container.querySelector("output")!;
  const probe = (props: Parameters<typeof Probe>[0]) => act(() => root.render(React.createElement(Probe, props)));

  it("loads, then switches variants without fetching again", async () => {
    serve(products);
    await probe({ productId: "prodv2_abc" });
    await flush();
    assert.equal(out().dataset.status, "ready");
    assert.equal(out().dataset.url, "https://files.test/product.glb");
    assert.equal(fetches.length, 1);
    assert.match(fetches[0], /^https:\/\/api\.test\/api\/integrations\/proj\/public-commerce\/products\?ids=prodv2_abc.*include=model3d/);

    await probe({ productId: "prodv2_abc", variantId: "prodv2_abc_red" });
    assert.equal(out().dataset.url, "https://files.test/red.glb");
    assert.equal(out().dataset.variant, "Czerwona");
    await probe({ productId: "prodv2_abc", variantId: "prodv2_abc_none" });
    assert.equal(out().dataset.status, "none");
    assert.equal(fetches.length, 1);
  });

  it("is 'none' on an older server and 'error' on a failure", async () => {
    serve({ success: true, result: [{ id: "prodv2_abc", name: "X", price: 1, currency: "PLN" }] });
    await probe({ productId: "prodv2_abc", host: "https://old.test" });
    await flush();
    assert.equal(out().dataset.status, "none");
    serve({}, 500);
    await probe({ productId: "prodv2_abc", host: "https://down.test" });
    await flush();
    assert.equal(out().dataset.status, "error");
  });
});

describe("Product3DViewer", () => {
  it("renders the fallback without a model and the viewer with one", async () => {
    serve({ success: true, result: [{ id: "prodv2_abc", name: "X", price: 1, currency: "PLN" }] });
    await act(() =>
      root.render(
        React.createElement(Product3DViewer, {
          productId: "prodv2_abc",
          projectID: "proj",
          host: "https://none.test",
          fallback: React.createElement("p", { id: "fallback" }, "no model"),
          loadViewer: fakeLoader,
        }),
      ),
    );
    await flush();
    assert.ok(container.querySelector("#fallback"));
    assert.equal(container.querySelector("[data-bitsnap-viewer3d]"), null);

    serve(products);
    await act(() =>
      root.render(
        React.createElement(Product3DViewer, {
          productId: "prodv2_abc",
          variantId: "prodv2_abc_red",
          projectID: "proj",
          host: "https://api.test",
          loadViewer: fakeLoader,
        }),
      ),
    );
    await flush();
    assert.ok(container.querySelector("[data-bitsnap-viewer3d]"));
    assert.equal(container.querySelector("img")?.getAttribute("alt"), "Figurka – Czerwona");
    assert.match(container.textContent ?? "", /Pokaż model 3D \(20 MB\)/, "the red variant is over 10 MB");
  });
});
