import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import { setupReactPage, teardownReactPage } from "@/src/analytics/react-testing";
import type { CheckoutAppearance } from "./appearance";

/*
 * Regression guard: without an `appearance`, the portalled country list used
 * to render as a bare element under <body>. Every library rule is scoped to
 * `.bitsnap-react` or `[data-bitsnap-checkout]`, so it had no stacking level,
 * opened behind the drawer and the overlay caught the pointer (1.29.1). The
 * cascade itself is checked in a browser; this pins what makes it work there.
 */

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let CountrySelector: typeof import("./CountrySelector.tsx").default;
let CheckoutAppearanceProvider: typeof import("./appearance.context.tsx").CheckoutAppearanceProvider;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  CountrySelector = (await import("./CountrySelector.tsx")).default;
  ({ CheckoutAppearanceProvider } = await import("./appearance.context.tsx"));
});

const roots: Array<{ unmount: () => void }> = [];

afterEach(async () => {
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
});

after(() => teardownReactPage());

const countries = [
  { name: "Poland", code: "PL" },
  { name: "Germany", code: "DE" },
];

async function openDropdown(appearance?: CheckoutAppearance): Promise<HTMLElement> {
  const doc = page.win.document;
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(
      <CheckoutAppearanceProvider appearance={appearance}>
        <CountrySelector
          id="country"
          open
          onToggle={() => {}}
          onChange={() => {}}
          selectedValue="PL"
          countries={countries}
        />
      </CheckoutAppearanceProvider>,
    );
  });
  await React.act(async () => void (await new Promise((r) => setTimeout(r, 20))));

  const option = doc.querySelector<HTMLElement>('[data-bitsnap-checkout-slot="countryOption"]');
  assert.ok(option, "the country list renders");
  assert.ok(!container.contains(option), "the country list is portalled out of the component");
  const content = option.closest<HTMLElement>('[data-slot="select-content"]');
  assert.ok(content, "the options sit in the select content");
  return content;
}

function assertBoundary(content: HTMLElement) {
  // `.bitsnap-react` gives the portal the library's theme variables
  // (`--spacing`, `--color-neutral-*`, `--radius`) and its descendants the
  // prefixed utilities; the data attributes let checkout.css reach the box.
  assert.ok(content.classList.contains("bitsnap-react"), "the dropdown is a .bitsnap-react boundary");
  assert.equal(content.getAttribute("data-bitsnap-checkout"), "dropdown");
  assert.equal(content.getAttribute("data-bitsnap-checkout-slot"), "countryDropdown");
}

describe("country dropdown", () => {
  it("is its own checkout boundary without an appearance", async () => {
    const content = await openDropdown();
    assertBoundary(content);
    assert.ok(content.classList.contains("dark"), "the default theme marker");
    // The shadcn variables the shared primitives read hold their light
    // defaults at the boundary, so the dark ones travel inline.
    assert.equal(content.style.getPropertyValue("--popover"), "var(--bitsnap-checkout-surface, var(--color-neutral-800))");
    assert.equal(content.style.getPropertyValue("--popover-foreground"), "var(--bitsnap-checkout-foreground, var(--color-neutral-200))");
    assert.equal(content.style.getPropertyValue("--accent"), "var(--bitsnap-checkout-hover-surface, var(--color-neutral-700))");
    assert.equal(content.style.getPropertyValue("--accent-foreground"), "var(--bitsnap-checkout-foreground, var(--color-neutral-200))");
    assert.equal(content.style.getPropertyValue("--border"), "var(--bitsnap-checkout-border, var(--color-neutral-700))");
  });

  it("is the same boundary with an empty appearance", async () => {
    assertBoundary(await openDropdown({}));
  });

  it("carries the light preset", async () => {
    const content = await openDropdown({ theme: "light" });
    assertBoundary(content);
    assert.ok(content.classList.contains("light"));
    assert.equal(content.style.getPropertyValue("--bitsnap-checkout-surface"), "#f9fafb");
    assert.equal(content.style.getPropertyValue("--popover"), "#f9fafb");
    assert.equal(content.style.getPropertyValue("--accent"), "#e4e4e7");
    assert.equal(content.style.getPropertyValue("--accent-foreground"), "#18181b");
    assert.equal(content.style.getPropertyValue("--border"), "#e4e4e7");
  });

  it("keeps the caller's countryDropdown overrides last", async () => {
    const content = await openDropdown({
      elements: { countryDropdown: { className: "my-dropdown", style: { zIndex: 5 } } },
    });
    assertBoundary(content);
    assert.ok(content.classList.contains("my-dropdown"));
    assert.equal(content.style.zIndex, "5");
  });
});

describe("checkout.css country dropdown rule", () => {
  const css = readFileSync(
    resolve(process.cwd(), "src/components/checkout/checkout.css"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("paints the portalled boundary itself, which prefixed utilities never reach", () => {
    const match = css.match(
      /\[data-bitsnap-checkout-slot="countryDropdown"\]\[data-bitsnap-checkout\]\s*\{([^}]*)\}/,
    );
    assert.ok(match, "no rule matches the dropdown boundary element");
    const body = match[1].replace(/\s+/g, " ");
    assert.match(body, /z-index: 999999;/, "stacks above the drawer root (999999, earlier in the DOM)");
    assert.match(body, /background-color: var\( --bitsnap-checkout-surface, var\(--color-neutral-800\) \);/);
    assert.match(body, /color: var\(--bitsnap-checkout-foreground, var\(--color-neutral-200\)\);/);
    assert.match(body, /border-width: 1px;/);
    assert.match(body, /border-style: solid;/);
  });
});
