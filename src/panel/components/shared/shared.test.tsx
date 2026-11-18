import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { setupReactPage } from "@/src/analytics/react-testing";
import { getPanelTexts } from "../../texts";

const page = setupReactPage("https://shop.example.test/panel");

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let renderToString: typeof import("react-dom/server").renderToString;
let shared: {
  PanelCard: typeof import("./PanelCard.tsx").PanelCard;
  PanelEmptyState: typeof import("./PanelEmptyState.tsx").PanelEmptyState;
  StatusPill: typeof import("./StatusPill.tsx").StatusPill;
  orderStatusVariant: typeof import("./StatusPill.tsx").orderStatusVariant;
  ProductDescription: typeof import("./ProductDescription.tsx").ProductDescription;
};
let useColorMode: typeof import("../../theme/useColorMode.ts").useColorMode;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  renderToString = (await import("react-dom/server")).renderToString;
  shared = {
    ...(await import("./PanelCard.tsx")),
    ...(await import("./PanelEmptyState.tsx")),
    ...(await import("./StatusPill.tsx")),
    ...(await import("./ProductDescription.tsx")),
  };
  ({ useColorMode } = await import("../../theme/useColorMode.ts"));
});

const roots: Array<{ unmount: () => void }> = [];
afterEach(async () => {
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
});

async function mount(element: React.ReactElement) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => root.render(element));
  return container;
}

const pl = getPanelTexts("pl");

describe("StatusPill", () => {
  it("gives every known status a semantic variant", () => {
    const expected: Record<string, string> = {
      paid: "ok",
      completed: "ok",
      processing: "info",
      sent: "info",
      unpaid: "warn",
      issue: "warn",
      overdue: "danger",
      draft: "neutral",
      created: "neutral",
      cancelled: "neutral",
      canceled: "neutral",
      refunded: "neutral",
      returned: "neutral",
    };
    for (const [status, variant] of Object.entries(expected)) {
      assert.equal(shared.orderStatusVariant(status), variant, status);
    }
    assert.equal(shared.orderStatusVariant(" PAID "), "ok");
    assert.equal(shared.orderStatusVariant("mystery"), "neutral");
  });

  it("labels statuses, and shows an unknown one as-is", async () => {
    const container = await mount(
      <div>
        <shared.StatusPill status="canceled" texts={pl} />
        <shared.StatusPill status="paid" texts={pl} />
        <shared.StatusPill status="on_hold" texts={pl} />
      </div>,
    );
    const pills = [...container.querySelectorAll<HTMLElement>("[data-status-variant]")];
    assert.deepEqual(
      pills.map((pill) => [pill.textContent, pill.dataset.statusVariant]),
      [
        ["Anulowane", "neutral"],
        ["Opłacone", "ok"],
        ["on_hold", "neutral"],
      ],
    );
    assert.match(pills[1].className, /text-\(--panel-ok\)/);
  });
});

describe("PanelCard and PanelEmptyState", () => {
  it("renders the requested element with the panel surface", async () => {
    const container = await mount(
      <shared.PanelCard as="section" aria-label="Karta" className="extra">
        x
      </shared.PanelCard>,
    );
    const card = container.querySelector("section")!;
    assert.equal(card.getAttribute("aria-label"), "Karta");
    assert.match(card.className, /bg-\(--panel-surface\)/);
    assert.match(card.className, /extra/);
  });

  it("shows headline, sentence and one action", async () => {
    const container = await mount(
      <shared.PanelEmptyState
        title="Brak zamówień"
        description="Tu pojawią się Twoje zamówienia."
        action={<button type="button">Do sklepu</button>}
        headingLevel={3}
      />,
    );
    assert.equal(container.querySelector("h3")?.textContent, "Brak zamówień");
    assert.equal(container.querySelectorAll("button").length, 1);
  });
});

describe("ProductDescription", () => {
  it("renders a skeleton for HTML on the server (no hydration mismatch)", () => {
    const out = renderToString(<shared.ProductDescription text="<p>Hello</p>" texts={pl} />);
    assert.match(out, /role="status"/);
    assert.doesNotMatch(out, /Hello/);
  });

  it("renders plain text on the server", () => {
    const out = renderToString(<shared.ProductDescription text={"Line 1\nLine 2"} texts={pl} />);
    assert.match(out, /Line 1\nLine 2/);
  });

  it("sanitizes HTML on the client", async () => {
    const container = await mount(
      <shared.ProductDescription
        text={'<p style="color:red">Opis <a href="https://a.example">link</a></p><script>alert(1)</script><img src="x" onerror="alert(1)">'}
        texts={pl}
      />,
    );
    const content = container.querySelector("[id]")!;
    assert.match(content.innerHTML, /Opis/);
    assert.doesNotMatch(content.innerHTML, /script|onerror|style=/);
    assert.match(content.querySelector("a")?.getAttribute("rel") ?? "", /noopener/);
  });

  it("renders nothing for an empty description", async () => {
    for (const text of ["", "   ", null, "<p></p><p> </p>", '{"root":{"children":[]}}']) {
      const container = await mount(<shared.ProductDescription text={text} texts={pl} />);
      assert.equal(container.innerHTML, "", String(text));
    }
  });

  it("folds below the Nth line box, past paragraph margins", async () => {
    // Two paragraphs of two 21px lines each, with a 12px gap between them.
    const lineRects: Record<string, Array<[number, number]>> = {
      Pierwszy: [[0, 21], [21, 42]],
      Drugi: [[54, 75], [75, 96]],
    };
    const RangeProto = page.win.Range.prototype as Range & { getClientRects?: unknown };
    const original = Object.getOwnPropertyDescriptor(RangeProto, "getClientRects");
    Object.defineProperty(RangeProto, "getClientRects", {
      configurable: true,
      value(this: Range) {
        const text = this.startContainer.textContent ?? "";
        const key = Object.keys(lineRects).find((name) => text.startsWith(name));
        return (key ? lineRects[key] : []).map(([top, bottom]) => ({ top, bottom, height: bottom - top }));
      },
    });
    try {
      const html = "<p>Pierwszy akapit</p><p>Drugi akapit</p>";
      const folded = await mount(<shared.ProductDescription text={html} lines={3} texts={pl} />);
      await React.act(async () => {});
      const content = folded.querySelector<HTMLElement>("[id]")!;
      assert.equal(content.style.maxHeight, "75px", "ends at the bottom of line 3, not 3 × 1.5em");
      const toggle = folded.querySelector("button")!;
      assert.equal(toggle.textContent, pl.descriptionShowMore);
      await React.act(async () => toggle.click());
      assert.equal(content.style.maxHeight, "");
      assert.equal(toggle.getAttribute("aria-expanded"), "true");

      const fits = await mount(<shared.ProductDescription text={html} lines={4} texts={pl} />);
      await React.act(async () => {});
      assert.equal(fits.querySelector<HTMLElement>("[id]")!.style.maxHeight, "", "four lines fit: no cut");
      assert.equal(fits.querySelector("button"), null);
    } finally {
      if (original) Object.defineProperty(RangeProto, "getClientRects", original);
      else delete RangeProto.getClientRects;
    }
  });

  it("reduces Lexical JSON to text", async () => {
    const state = JSON.stringify({
      root: { children: [{ type: "paragraph", children: [{ type: "text", text: "Z edytora" }] }] },
    });
    const container = await mount(<shared.ProductDescription text={state} texts={pl} />);
    assert.equal(container.textContent, "Z edytora");
  });
});

describe("useColorMode", () => {
  function Probe({ scheme }: { scheme: "inherit" | "system" }) {
    return <span>{useColorMode(scheme) ?? "none"}</span>;
  }

  it('follows the system in "system" mode and sets nothing in "inherit"', async () => {
    let dark = true;
    const listeners = new Set<() => void>();
    (page.win as unknown as { matchMedia: unknown }).matchMedia = () => ({
      get matches() {
        return dark;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    });
    Object.assign(globalThis, { matchMedia: (page.win as unknown as { matchMedia: unknown }).matchMedia });

    const system = await mount(<Probe scheme="system" />);
    assert.equal(system.textContent, "dark");
    dark = false;
    await React.act(async () => listeners.forEach((listener) => listener()));
    assert.equal(system.textContent, "light");

    const inherit = await mount(<Probe scheme="inherit" />);
    assert.equal(inherit.textContent, "none");
  });
});
