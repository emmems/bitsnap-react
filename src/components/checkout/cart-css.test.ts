import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import { contrastRatio } from "@/src/consent/core/contrast";

/*
 * Static guard for the cart stylesheet `cart.css` (F-01 regression guard,
 * plan part 3 §7.1).
 *
 * The cart lost to host pages because its rules sat in a cascade layer: any
 * unlayered host rule (`.w-full`, `button { background: transparent }`) beats a
 * layered rule whatever its specificity. jsdom implements neither cascade
 * layers nor media queries, so the cascade itself is checked in a browser; this
 * test pins the properties of the file that make it work there.
 */

// Tests run from the package root (`node --test .test-dist/...`).
const CSS_PATH = resolve(process.cwd(), "src/components/checkout/cart.css");
/** The cart's shell: the provider wrapper and the one frame of every presentation. */
const SHELL_PATHS = ["CartComponent.tsx", "CartFrame.tsx"].map((file) =>
  resolve(process.cwd(), "src/components/checkout", file),
);

interface StyleRule {
  selectors: string[];
  declarations: Map<string, string>;
  /** Enclosing at-rule preludes, outermost first (e.g. `@media (...)`). */
  atRules: string[];
}

/** Minimal CSS reader: enough for a hand-written stylesheet without strings that contain braces. */
function readStyleRules(css: string): StyleRule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: StyleRule[] = [];
  const stack: string[] = [];
  let buffer = "";

  for (const char of source) {
    if (char === "{") {
      stack.push(buffer.trim());
      buffer = "";
    } else if (char === "}") {
      const prelude = stack.pop();
      assert.ok(prelude != null, "unbalanced braces in cart.css");
      if (!prelude.startsWith("@")) {
        const declarations = new Map<string, string>();
        for (const part of buffer.split(";")) {
          const colon = part.indexOf(":");
          if (colon === -1) continue;
          declarations.set(
            part.slice(0, colon).trim(),
            part.slice(colon + 1).replace(/\s+/g, " ").trim(),
          );
        }
        rules.push({
          selectors: splitTopLevel(prelude, ","),
          declarations,
          atRules: [...stack],
        });
      }
      buffer = "";
    } else {
      buffer += char;
    }
  }

  assert.equal(stack.length, 0, "unbalanced braces in cart.css");
  return rules;
}

/** Splits on a separator outside of brackets and parentheses. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

type Specificity = [number, number, number];

/** Reads the parenthesised argument that starts at `open` (the index of `(`). */
function readArgument(selector: string, open: number): { argument: string; end: number } {
  let depth = 0;
  for (let index = open; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return { argument: selector.slice(open + 1, index), end: index + 1 };
      }
    }
  }
  throw new Error(`unclosed parenthesis in ${selector}`);
}

function add(a: Specificity, b: Specificity): Specificity {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function compare(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Selectors Level 4 specificity: `:where()` adds nothing; `:is()`, `:not()`
 * and `:has()` add their most specific argument; other pseudo-classes,
 * classes and attributes count as (0,1,0); types and pseudo-elements (0,0,1).
 */
export function specificity(selector: string): Specificity {
  let result: Specificity = [0, 0, 0];
  let index = 0;

  while (index < selector.length) {
    const char = selector[index];

    if (char === "[") {
      const close = selector.indexOf("]", index);
      result = add(result, [0, 1, 0]);
      index = close + 1;
    } else if (char === "#") {
      const match = /^#[\w-]+/.exec(selector.slice(index));
      result = add(result, [1, 0, 0]);
      index += match?.[0].length ?? 1;
    } else if (char === ".") {
      const match = /^\.[\w-]+/.exec(selector.slice(index));
      result = add(result, [0, 1, 0]);
      index += match?.[0].length ?? 1;
    } else if (char === ":" && selector[index + 1] === ":") {
      const match = /^::[\w-]+/.exec(selector.slice(index));
      result = add(result, [0, 0, 1]);
      index += match?.[0].length ?? 2;
    } else if (char === ":") {
      const match = /^:([\w-]+)/.exec(selector.slice(index));
      const name = match?.[1] ?? "";
      index += (match?.[0].length ?? 1);
      if (selector[index] === "(") {
        const { argument, end } = readArgument(selector, index);
        index = end;
        if (name === "where") continue;
        if (name === "is" || name === "not" || name === "has") {
          const most = splitTopLevel(argument, ",")
            .map((part) => specificity(part.replace(/^[>+~]\s*/, "")))
            .sort(compare)
            .at(-1);
          result = add(result, most ?? [0, 0, 0]);
          continue;
        }
      }
      result = add(result, [0, 1, 0]);
    } else if (/[a-zA-Z*]/.test(char)) {
      const match = /^(\*|[a-zA-Z][\w-]*)/.exec(selector.slice(index));
      if (match?.[0] !== "*") result = add(result, [0, 0, 1]);
      index += match?.[0].length ?? 1;
    } else {
      index += 1;
    }
  }

  return result;
}

const css = readFileSync(CSS_PATH, "utf8");
const rules = readStyleRules(css);
const styleRules = rules.filter(
  (rule) => !rule.atRules.some((atRule) => atRule.startsWith("@keyframes")),
);
const topLevel = styleRules.filter((rule) => rule.atRules.length === 0);
const findTop = (selector: string) => topLevel.find((rule) => rule.selectors.includes(selector));
const slot = (name: string) => `[data-bitsnap-checkout] [data-bitsnap-checkout-slot="${name}"]`;
const PAYMENT_BUTTONS_EXCLUSION = ':not(:where([data-bitsnap-checkout-slot="paymentButtons"] *))';

describe("specificity helper", () => {
  it("counts the selectors the stylesheet uses", () => {
    assert.deepEqual(specificity('[data-a] [data-b="x"]'), [0, 2, 0]);
    assert.deepEqual(specificity('[data-a] [data-b="x"]:hover:not(:disabled)'), [0, 4, 0]);
    assert.deepEqual(specificity('[data-a] [data-b="x"]:where(:hover:not(:disabled))'), [0, 2, 0]);
    assert.deepEqual(specificity('[data-a] [data-b="x"] input[type="radio"]'), [0, 3, 1]);
    assert.deepEqual(specificity('[data-a] :where([data-b]:disabled) [data-c]'), [0, 2, 0]);
    assert.deepEqual(specificity('[data-a] [data-b]:has(input:focus-visible)'), [0, 3, 1]);
    assert.deepEqual(specificity(`[data-a] :where(a, svg)${PAYMENT_BUTTONS_EXCLUSION}`), [0, 1, 0]);
    assert.deepEqual(specificity("#id .a::before"), [1, 1, 1]);
  });
});

describe("cart.css isolation", () => {
  it("has rules to check", () => {
    assert.ok(styleRules.length > 40, `only ${styleRules.length} rules parsed`);
  });

  it("is the one checkout sheet: checkout.css is gone and the entry imports no checkout CSS", () => {
    assert.throws(() => readFileSync(resolve(process.cwd(), "src/components/checkout/checkout.css")));
    const entry = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
    assert.doesNotMatch(entry, /checkout\/(checkout|cart)\.css/, "cart.css is appended by the build, never imported");
  });

  it("is not wrapped in a cascade layer, so unlayered host CSS cannot beat it", () => {
    assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /@layer\b/);
  });

  it("scopes every selector outside @keyframes to the checkout boundary or the cart trigger", () => {
    for (const rule of styleRules) {
      for (const selector of rule.selectors) {
        assert.ok(
          selector.startsWith("[data-bitsnap-checkout"),
          `"${selector}" is not scoped to [data-bitsnap-checkout…]`,
        );
      }
    }
  });

  it("caps every selector at (0,2,0), so the SDK selector plus one class always wins", () => {
    for (const rule of styleRules) {
      for (const selector of rule.selectors) {
        const value = specificity(selector);
        assert.ok(
          compare(value, [0, 2, 0]) <= 0,
          `"${selector}" has specificity (${value.join(",")}); wrap state and descendant qualifiers in :where()`,
        );
      }
    }
  });

  it("uses literal values only: no Tailwind theme variable, so a page with only cart.css works", () => {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of withoutComments.matchAll(/var\(\s*(--[\w-]+)/g)) {
      assert.match(match[1], /^--(bitsnap-checkout-|bsc-)/, `${match[1]} is not a cart variable`);
    }
  });

  it("writes lengths in px, never rem (a host `html { font-size: 62.5% }` cannot shrink the cart, D8)", () => {
    assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /\d(\.\d+)?rem\b/);
  });

  it("builds the inheritance firewall on the root only, the one rule that uses `all` (R01)", () => {
    const withAll = rules.filter((rule) => rule.declarations.has("all"));
    assert.equal(withAll.length, 1, "exactly one rule sets `all`");
    const [firewall] = withAll;
    assert.deepEqual(firewall.selectors, ['[data-bitsnap-checkout="root"]']);
    assert.deepEqual(firewall.atRules, []);
    assert.equal(firewall.declarations.get("all"), "initial");
    assert.equal(firewall.declarations.get("display"), "block");
    // Stacking is explicit, not left to the inline z-index (R05).
    assert.equal(firewall.declarations.get("position"), "relative");
    assert.equal(firewall.declarations.get("z-index"), "999999");
    // The host's font (D16); the token switches it. 16 px default size.
    assert.equal(firewall.declarations.get("font-family"), "var(--bitsnap-checkout-font-family, inherit)");
    assert.equal(firewall.declarations.get("font-size"), "var(--bitsnap-checkout-font-size, 16px)");
    assert.equal(firewall.declarations.get("box-sizing"), "border-box");
  });

  it("sets color-scheme per theme after the firewall, with the per-theme literals (R09, N01)", () => {
    const firewall = topLevel.findIndex((rule) => rule.declarations.has("all"));
    const expected = {
      dark: { "color-scheme": "dark", "--bsc-control-border": "#737373", "--bsc-skeleton": "#333333" },
      light: { "color-scheme": "light", "--bsc-control-border": "#8a8a8a", "--bsc-skeleton": "#d4d4d8" },
    };
    for (const [theme, values] of Object.entries(expected)) {
      const selector = `[data-bitsnap-checkout="root"]:where(.${theme})`;
      const index = topLevel.findIndex((rule) => rule.selectors.includes(selector));
      assert.ok(index > firewall, `${selector} must come after the firewall (all: initial resets color-scheme)`);
      for (const [property, value] of Object.entries(values)) {
        assert.equal(topLevel[index].declarations.get(property), value, `${theme} ${property}`);
      }
      // Literals, never a preset variable's fallback (the light preset writes `border` inline).
      assert.doesNotMatch(topLevel[index].declarations.get("--bsc-overlay") ?? "", /var\(/);
    }
  });

  it("keeps the per-theme literals above their contrast bars on both panels (R14, N02)", () => {
    const panels = { dark: ["#171717", "#262626"], light: ["#ffffff", "#f9fafb"] } as const;
    for (const [theme, [panel, surface]] of Object.entries(panels)) {
      const block = findTop(`[data-bitsnap-checkout="root"]:where(.${theme})`)!;
      const control = block.declarations.get("--bsc-control-border")!;
      const skeleton = block.declarations.get("--bsc-skeleton")!;
      assert.ok(contrastRatio(control, panel) >= 3, `${theme} control border on the panel`);
      assert.ok(contrastRatio(control, surface) >= 3, `${theme} control border on the surface`);
      assert.ok(contrastRatio(skeleton, panel) >= 1.3, `${theme} skeleton on the panel`);
    }
  });

  it("resets the elements hosts decorate at (0,1,0), skipping the express containers (R08, R23)", () => {
    const reset = topLevel.find((rule) =>
      rule.selectors.some((selector) => selector.startsWith("[data-bitsnap-checkout] :where(a,")),
    );
    assert.ok(reset, "no local reset");
    assert.equal(reset.selectors.length, 1);
    const [selector] = reset.selectors;
    for (const element of ["a", "svg", "button", "input", "select", "img", "hr", "h1", "p", "fieldset", "legend"]) {
      assert.match(selector, new RegExp(`[(\\s]${element}[,)]`), `${element} is not reset`);
    }
    assert.ok(selector.endsWith(PAYMENT_BUTTONS_EXCLUSION), "the express containers are not excluded");
    assert.deepEqual(specificity(selector), [0, 1, 0]);
    for (const [property, value] of [
      ["margin", "0"],
      ["padding", "0"],
      ["font", "inherit"],
      ["background", "none"],
      ["border", "0 solid"],
      ["color", "inherit"],
      // A host `a { text-decoration: underline }` or `ul { list-style: disc }` (S5).
      ["text-decoration", "inherit"],
      ["list-style", "none"],
    ]) {
      assert.equal(reset.declarations.get(property), value, property);
    }
    const firstComponent = topLevel.findIndex((rule) => compare(specificity(rule.selectors[0]), [0, 2, 0]) === 0);
    assert.ok(topLevel.indexOf(reset) < firstComponent, "the reset comes before the component rules");
  });

  it("sets box-sizing on every descendant and its pseudo-elements, never inside the express containers (N15)", () => {
    const boxSizing = topLevel.find(
      (rule) => rule.declarations.get("box-sizing") === "border-box" && rule.selectors.length === 3,
    );
    assert.ok(boxSizing, "no box-sizing rule for descendants");
    const base = `[data-bitsnap-checkout] :where(*)${PAYMENT_BUTTONS_EXCLUSION}`;
    assert.deepEqual(boxSizing.selectors, [base, `${base}::before`, `${base}::after`]);
  });

  it("names every keyframes with the bitsnap prefix (keyframe names are global)", () => {
    const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]);
    assert.ok(names.length >= 7);
    for (const name of names) {
      assert.match(name, /^bitsnap-(cart|checkout)-/, name);
    }
  });
});

describe("cart.css grid shell and header", () => {
  it("owns the drawer geometry: a grid of header, scroll region and footer, 380/420 px, full screen when compact (D7, D8)", () => {
    const panel = findTop(slot("panel"));
    assert.ok(panel, "no base panel rule");
    assert.equal(panel.declarations.get("position"), "fixed");
    assert.equal(panel.declarations.get("display"), "grid");
    assert.equal(panel.declarations.get("grid-template-rows"), "auto minmax(0, 1fr) auto");
    assert.equal(panel.declarations.get("overflow"), "hidden", "only the scroll region scrolls");
    assert.equal(panel.declarations.get("height"), "100dvh");
    assert.match(css, /height: 100vh;\s*height: 100dvh;/, "100vh stays as the fallback");
    assert.equal(panel.declarations.get("width"), "var(--bitsnap-checkout-panel-width, 380px)");
    assert.equal(panel.declarations.get("max-width"), "100vw");

    const media = styleRules
      .filter((rule) => rule.atRules.length === 1 && rule.selectors.includes(slot("panel")))
      .map((rule) => [rule.atRules[0], rule.declarations.get("width")]);
    assert.deepEqual(media, [
      ["@media (min-width: 1200px)", "var(--bitsnap-checkout-panel-width, 420px)"],
      ["@media (max-width: 639.98px), (max-height: 500px)", "100%"],
    ]);

    const overlay = findTop(slot("overlay"));
    assert.ok(overlay, "no overlay rule");
    assert.equal(overlay.declarations.get("position"), "fixed");
    assert.equal(overlay.declarations.get("z-index"), "10");
    assert.equal(
      overlay.declarations.get("background-color"),
      "var(--bitsnap-checkout-overlay, var(--bsc-overlay))",
      "a merchant overlay token wins over the theme literal",
    );
  });

  it("lets only the scroll region scroll", () => {
    const scroll = findTop("[data-bitsnap-checkout] .bsc-scroll");
    assert.ok(scroll, "no scroll region rule");
    assert.equal(scroll.declarations.get("min-height"), "0");
    assert.equal(scroll.declarations.get("overflow-y"), "auto");
    assert.equal(scroll.declarations.get("overscroll-behavior"), "contain");
  });

  it("gives the header 56 px and the close button a 44 px target", () => {
    assert.equal(findTop("[data-bitsnap-checkout] .bsc-header")?.declarations.get("min-height"), "56px");
    const iconButton = findTop("[data-bitsnap-checkout] .bsc-icon-btn");
    assert.equal(iconButton?.declarations.get("min-width"), "44px");
    assert.equal(iconButton?.declarations.get("min-height"), "44px");
    assert.ok(findTop("[data-bitsnap-checkout] .bsc-icon-btn:where(:focus-visible)")?.declarations.has("outline"));
  });

  it("styles the default cart trigger through its own attribute only (D20)", () => {
    const triggerRules = styleRules.filter((rule) =>
      rule.selectors.some((selector) => selector.includes("data-bitsnap-checkout-trigger")),
    );
    assert.ok(triggerRules.length >= 3);
    for (const rule of triggerRules) {
      for (const selector of rule.selectors.filter((s) => s.includes("data-bitsnap-checkout-trigger"))) {
        assert.ok(selector.startsWith('[data-bitsnap-checkout-trigger="default"]'), selector);
      }
    }
    const base = findTop('[data-bitsnap-checkout-trigger="default"]')!;
    assert.equal(base.declarations.get("min-width"), "44px");
    assert.equal(base.declarations.get("min-height"), "44px");
    assert.doesNotMatch(css, /data-bitsnap-checkout-trigger="custom"/, "a merchant trigger gets no SDK rule");
  });

  it("keeps the trigger's focus ring over a host `button:focus { outline: none }` (0,1,1)", () => {
    const focus = topLevel.find((rule) =>
      rule.selectors.some((selector) => selector.includes("data-bitsnap-checkout-trigger") && selector.includes(":focus-visible")),
    );
    assert.ok(focus, "no focus rule for the trigger");
    const [selector] = focus.selectors;
    assert.equal(selector, '[data-bitsnap-checkout-trigger="default"][data-bitsnap-checkout-trigger]:where(:focus-visible)');
    assert.ok(compare(specificity(selector), specificity("button:focus")) > 0, "a host button:focus rule wins");
    assert.deepEqual(specificity(selector), [0, 2, 0], "within the (0,2,0) cap");
    assert.equal(focus.declarations.get("outline"), "2px solid currentColor");
  });
});

describe("cart.css content rules", () => {
  it("gives the CTA its surface and the retry and empty-state buttons a secondary look of their own (F-15)", () => {
    const cta = findTop("[data-bitsnap-checkout] .bsc-cta");
    assert.equal(cta?.declarations.get("background-color"), "var(--bsc-cta-bg)");
    assert.equal(cta?.declarations.get("color"), "var(--bsc-cta-fg)");
    assert.equal(findTop(slot("checkoutButton")), undefined, "no slot rule: the retry button is not a checkoutButton");
    const secondary = findTop("[data-bitsnap-checkout] .bsc-btn-secondary");
    assert.equal(secondary?.declarations.get("border"), "1px solid var(--bsc-control-border)");
    assert.equal(secondary?.declarations.get("min-height"), "44px");
    assert.ok(findTop("[data-bitsnap-checkout] .bsc-btn-secondary:where(:focus-visible)")?.declarations.has("outline"));
  });

  it("colours the sale line from the tokens with fallbacks that pass 4.5:1 on the dark panel", () => {
    const price = (kind: string) => findTop(`[data-bitsnap-checkout] [data-bitsnap-checkout-price="${kind}"]`);
    assert.equal(price("regular")?.declarations.get("color"), "var(--bitsnap-checkout-muted-foreground, #a3a3a3)");
    assert.equal(price("omnibus")?.declarations.get("color"), "var(--bitsnap-checkout-muted-foreground, #a3a3a3)");
    assert.equal(price("sale")?.declarations.get("color"), "var(--bitsnap-checkout-sale, #f87171)");
  });

  it("lists every state rule after its base rule, so the state wins at equal specificity", () => {
    const indexOf = (selector: string) => topLevel.findIndex((rule) => rule.selectors.includes(selector));
    let checked = 0;
    for (const [index, rule] of topLevel.entries()) {
      for (const selector of rule.selectors) {
        const match = /^(.*(?:\[data-bitsnap-checkout-slot="[^"]+"\]|\.bsc-[\w-]+|\[data-bitsnap-checkout-trigger="default"\])):where\(.*\)$/.exec(selector);
        if (match == null) continue;
        const base = indexOf(match[1]);
        if (base === -1) continue; // e.g. `product`: only styled in a state
        checked += 1;
        assert.ok(base < index, `"${selector}" comes before its base rule "${match[1]}"`);
      }
    }
    assert.ok(checked >= 10, `only ${checked} state rules checked`);
    const order = (earlier: string, later: string) => assert.ok(indexOf(earlier) < indexOf(later), `${later} after ${earlier}`);
    order("[data-bitsnap-checkout] .bsc-method:where(:hover)", "[data-bitsnap-checkout] .bsc-method:where([data-selected])");
    order("[data-bitsnap-checkout] .bsc-cta:where(:disabled)", '[data-bitsnap-checkout] .bsc-cta:where([aria-busy="true"])');
  });
});

describe("cart.css motion", () => {
  const panel = slot("panel");
  const overlay = slot("overlay");
  const keyframes = (name: string) => rules.filter((rule) => rule.atRules.at(-1) === `@keyframes ${name}`);
  const REDUCED = "@media (prefers-reduced-motion: reduce)";
  const reduced = styleRules.filter((rule) => rule.atRules.length === 1 && rule.atRules[0] === REDUCED);
  const reducedRule = (selector: string) => reduced.find((rule) => rule.selectors.includes(selector));
  const DURATION = "var(--bitsnap-checkout-motion-duration, 240ms)";
  const motionOffIndex = topLevel.findIndex((rule) =>
    rule.selectors.some((selector) => selector.startsWith('[data-bitsnap-checkout="root"][data-bitsnap-checkout-motion="off"]')),
  );

  it("keeps the 1.31.0 drawer keyframes, the panel never starting at opacity 0 (perf gate A1)", () => {
    const panelIn = keyframes("bitsnap-checkout-panel-in");
    assert.equal(panelIn.length, 1);
    assert.equal(panelIn[0].declarations.get("transform"), "translateX(24px)");
    const start = Number(panelIn[0].declarations.get("opacity"));
    assert.ok(start > 0 && start < 1, `panel enter starts at opacity ${start}`);
    const fadeIn = keyframes("bitsnap-checkout-panel-fade-in");
    assert.ok(Number(fadeIn[0]?.declarations.get("opacity")) > 0);
    assert.equal(fadeIn[0].declarations.has("transform"), false, "reduced motion slides");
    const panelOut = keyframes("bitsnap-checkout-panel-out");
    assert.equal(panelOut[0]?.declarations.get("opacity"), "0");
    assert.equal(panelOut[0]?.declarations.get("transform"), "translateX(24px)");
    assert.equal(keyframes("bitsnap-checkout-fade-in")[0]?.declarations.get("opacity"), "0");
    assert.equal(keyframes("bitsnap-checkout-fade-out")[0]?.declarations.get("opacity"), "0");
  });

  it("animates the panel and the overlay on Radix's data-state with the motionDuration token", () => {
    const expected: Array<[string, string]> = [
      [`${panel}:where([data-state="open"])`, `bitsnap-checkout-panel-in ${DURATION} ease-out backwards`],
      [`${panel}:where([data-state="closed"])`, `bitsnap-checkout-panel-out ${DURATION} ease-in forwards`],
      [`${overlay}:where([data-state="open"])`, `bitsnap-checkout-fade-in ${DURATION} ease-out backwards`],
      [`${overlay}:where([data-state="closed"])`, `bitsnap-checkout-fade-out ${DURATION} ease-in forwards`],
    ];
    for (const [selector, animation] of expected) {
      assert.equal(findTop(selector)?.declarations.get("animation"), animation, selector);
    }
    // Presence waits for an exit only when the name changes; the enter holds no transform (N14).
    assert.notEqual(expected[0][1].split(" ")[0], expected[1][1].split(" ")[0]);
    assert.doesNotMatch(expected[0][1], /\b(forwards|both)\b/);
  });

  it("lets the closing panel and overlay take no clicks, over Radix's inline pointer-events", () => {
    for (const element of [panel, overlay]) {
      assert.equal(findTop(`${element}:where([data-state="closed"])`)?.declarations.get("pointer-events"), "none !important");
      assert.equal(findTop(`${element}:where([data-state="open"])`)?.declarations.has("pointer-events"), false);
    }
  });

  it("fades for at most 120 ms and stops the pulse under reduced motion, never touching .bsc-skeleton (R20)", () => {
    const short = `min(${DURATION}, 120ms)`;
    assert.equal(reducedRule(`${panel}:where([data-state="open"])`)?.declarations.get("animation-name"), "bitsnap-checkout-panel-fade-in");
    assert.equal(reducedRule(`${panel}:where([data-state="closed"])`)?.declarations.get("animation-name"), "bitsnap-checkout-fade-out");
    for (const selector of [
      `${panel}:where([data-state="open"])`,
      `${panel}:where([data-state="closed"])`,
      `${overlay}:where([data-state="open"], [data-state="closed"])`,
    ]) {
      assert.equal(reducedRule(selector)?.declarations.get("animation-duration"), short, selector);
    }
    assert.equal(reducedRule("[data-bitsnap-checkout] .bsc-pulse")?.declarations.get("animation"), "none");
    for (const rule of reduced) {
      for (const selector of rule.selectors) {
        assert.doesNotMatch(selector, /bsc-skeleton/, `${selector} touches the skeleton's delayed show`);
      }
    }
  });

  it("shows the skeleton after 150 ms from a visible resting state; only .bsc-pulse pulses (N12)", () => {
    const skeleton = findTop("[data-bitsnap-checkout] .bsc-skeleton");
    assert.equal(skeleton?.declarations.get("opacity"), "1");
    assert.equal(skeleton?.declarations.get("animation"), "bitsnap-cart-show 1ms linear 150ms backwards");
    const pulsing = styleRules.filter((rule) => /bitsnap-cart-pulse/.test(rule.declarations.get("animation") ?? ""));
    assert.deepEqual(pulsing.map((rule) => rule.selectors), [["[data-bitsnap-checkout] .bsc-pulse"]]);
    assert.equal(findTop("[data-bitsnap-checkout] .bsc-pulse")?.declarations.get("background-color"), "var(--bsc-skeleton)");
    assert.match(readFileSync(resolve(process.cwd(), "src/components/checkout/Skeleton.tsx"), "utf8"), /bsc-pulse/);
  });

  it("turns motion off on the root marker, except for the express widgets and the skeleton (R21, N03)", () => {
    assert.ok(motionOffIndex !== -1, "no motion-off rule");
    const motionOff = topLevel[motionOffIndex];
    assert.equal(motionOff.declarations.get("animation"), "none !important");
    assert.equal(motionOff.declarations.get("transition"), "none !important");
    const [selector] = motionOff.selectors;

    const { window } = new JSDOM(`<div data-bitsnap-checkout="root" data-bitsnap-checkout-motion="off">
      <div data-bitsnap-checkout-slot="overlay"></div>
      <div data-bitsnap-checkout-slot="panel">
        <button class="bsc-icon-btn"></button>
        <div class="bsc-skeleton"><div class="bsc-pulse" data-bitsnap-checkout-slot="skeleton"></div></div>
        <div data-bitsnap-checkout-slot="paymentButtons"><button id="wallet"></button></div>
      </div>
    </div>`);
    const doc = window.document;
    const matches = (query: string) => doc.querySelector(query)!.matches(selector);
    assert.equal(matches('[data-bitsnap-checkout-slot="panel"]'), true);
    assert.equal(matches('[data-bitsnap-checkout-slot="overlay"]'), true);
    assert.equal(matches(".bsc-icon-btn"), true);
    assert.equal(matches(".bsc-skeleton"), false, "the delayed show must never stay at opacity 0");
    assert.equal(matches('[data-bitsnap-checkout-slot="skeleton"]'), false);
    assert.equal(matches('[data-bitsnap-checkout-slot="paymentButtons"]'), false);
    assert.equal(matches("#wallet"), false, "a wallet button keeps its own animation");
    assert.deepEqual(specificity(selector), [0, 2, 0]);
  });

  it("puts motion off after every animation rule it stops, none of them !important", () => {
    for (const rule of topLevel) {
      const sets = rule.declarations.get("animation") ?? rule.declarations.get("animation-name") ?? "";
      if (!/bitsnap-(checkout|cart)-/.test(sets)) continue;
      assert.doesNotMatch(sets, /!important/, `${rule.selectors.join(", ")} would beat motion off`);
      assert.ok(topLevel.indexOf(rule) < motionOffIndex, `${rule.selectors.join(", ")} comes after motion off`);
    }
  });
});

describe("cart.css dialog and compact geometry (step 18, D8, R06)", () => {
  const COMPACT = "@media (max-width: 639.98px), (max-height: 500px)";
  const DIALOG = `${slot("panel")}:where([data-bitsnap-checkout-presentation="dialog"])`;
  const DURATION = "var(--bitsnap-checkout-motion-duration, 240ms)";
  const compact = styleRules.filter((rule) => rule.atRules.length === 1 && rule.atRules[0] === COMPACT);
  const compactRule = (selector: string) => compact.find((rule) => rule.selectors.includes(selector));
  const keyframes = (name: string) => rules.filter((rule) => rule.atRules.at(-1) === `@keyframes ${name}`);

  it("centres the panel itself: auto margins on a fixed box, no translate, sized by the tokens", () => {
    const dialog = findTop(DIALOG);
    assert.ok(dialog, "no dialog rule");
    assert.equal(dialog.declarations.get("inset"), "0");
    assert.equal(dialog.declarations.get("margin"), "auto");
    assert.equal(dialog.declarations.get("height"), "fit-content");
    assert.equal(dialog.declarations.get("width"), "min(100vw - 32px, var(--bitsnap-checkout-panel-width, 480px))");
    assert.equal(
      dialog.declarations.get("max-height"),
      "var(--bitsnap-checkout-panel-max-height, min(100dvh - 48px, 704px))",
    );
    assert.equal(dialog.declarations.has("transform"), false, "a transform would hold fixed descendants");
    // After the drawer's side widths, so it wins at the same specificity.
    const wide = styleRules.findIndex((rule) => rule.atRules[0] === "@media (min-width: 1200px)");
    assert.ok(styleRules.indexOf(dialog) > wide);
  });

  it("makes the dialog a bottom sheet and the drawer full screen in the compact layout", () => {
    const sheet = compactRule(DIALOG);
    assert.ok(sheet, "no sheet rule");
    assert.equal(sheet.declarations.get("inset"), "auto 0 0 0");
    assert.equal(sheet.declarations.get("margin"), "0");
    assert.equal(sheet.declarations.get("width"), "100%");
    assert.equal(sheet.declarations.get("max-height"), "min(92dvh, var(--bitsnap-checkout-panel-max-height, 704px))");
    assert.ok(styleRules.indexOf(sheet) > styleRules.indexOf(findTop(DIALOG)!), "the sheet comes after the dialog");
    const drawer = compactRule(slot("panel"));
    assert.equal(drawer?.declarations.get("width"), "100%");
  });

  it("keeps clear of the safe areas: bottom in the footer, top in the full-screen drawer, sides when compact", () => {
    assert.equal(
      findTop("[data-bitsnap-checkout] .bsc-footer")?.declarations.get("padding"),
      "12px 16px calc(16px + env(safe-area-inset-bottom))",
    );
    const drawer = compactRule(slot("panel"));
    assert.equal(drawer?.declarations.get("padding-left"), "env(safe-area-inset-left)");
    assert.equal(drawer?.declarations.get("padding-right"), "env(safe-area-inset-right)");
    const header = '[data-bitsnap-checkout] :where([data-bitsnap-checkout-presentation="drawer"]) .bsc-header';
    const headerRule = compactRule(header);
    assert.equal(headerRule?.declarations.get("padding-top"), "env(safe-area-inset-top)");
    assert.equal(headerRule?.declarations.get("min-height"), "calc(56px + env(safe-area-inset-top))");
    // After the base header rule, whose padding shorthand would otherwise win.
    assert.ok(styleRules.indexOf(headerRule!) > styleRules.indexOf(findTop("[data-bitsnap-checkout] .bsc-header")!));
  });

  it("drops Continue shopping from a sheet at most 500 px high, after its base rule", () => {
    const short = styleRules.find(
      (rule) => rule.atRules[0] === "@media (max-height: 500px)" && rule.selectors.includes("[data-bitsnap-checkout] .bsc-continue"),
    );
    assert.equal(short?.declarations.get("display"), "none");
    assert.ok(styleRules.indexOf(short!) > styleRules.indexOf(findTop("[data-bitsnap-checkout] .bsc-continue")!));
  });

  it("gives the dialog a stronger overlay as a literal, which a merchant overlay token still beats (N01)", () => {
    const rule = findTop('[data-bitsnap-checkout="root"]:where(.dark, .light):where([data-bitsnap-checkout-presentation="dialog"])');
    assert.equal(rule?.declarations.get("--bsc-overlay"), "rgb(0 0 0 / 0.45)");
    for (const theme of ["dark", "light"]) {
      const block = findTop(`[data-bitsnap-checkout="root"]:where(.${theme})`)!;
      assert.ok(topLevel.indexOf(rule!) > topLevel.indexOf(block), `after the ${theme} block`);
    }
    assert.equal(findTop(slot("overlay"))?.declarations.get("background-color"), "var(--bitsnap-checkout-overlay, var(--bsc-overlay))");
  });

  it("animates the dialog and the sheet as multiples of motionDuration, entering with backwards fill (D8, N14)", () => {
    const open = `${slot("panel")}:where([data-bitsnap-checkout-presentation="dialog"][data-state="open"])`;
    const closed = `${slot("panel")}:where([data-bitsnap-checkout-presentation="dialog"][data-state="closed"])`;
    assert.equal(findTop(open)?.declarations.get("animation"), `bitsnap-checkout-dialog-in calc(${DURATION} * 0.85) ease-out backwards`);
    assert.equal(findTop(closed)?.declarations.get("animation"), `bitsnap-checkout-dialog-out calc(${DURATION} * 0.65) ease-in forwards`);
    assert.equal(compactRule(open)?.declarations.get("animation"), `bitsnap-checkout-sheet-in calc(${DURATION} * 1.1) ease-out backwards`);
    assert.equal(compactRule(closed)?.declarations.get("animation"), `bitsnap-checkout-sheet-out calc(${DURATION} * 0.85) ease-in forwards`);
    assert.ok(Number(keyframes("bitsnap-checkout-dialog-in")[0]?.declarations.get("opacity")) > 0, "readable from the first frame");
    assert.equal(keyframes("bitsnap-checkout-sheet-in")[0]?.declarations.get("transform"), "translateY(100%)");
    // The dialog's rules come after the drawer's state rules, and before reduced motion.
    const drawerOpen = topLevel.indexOf(findTop(`${slot("panel")}:where([data-state="open"])`)!);
    assert.ok(topLevel.indexOf(findTop(open)!) > drawerOpen);
  });

  it("enters every animated element with backwards fill, never forwards or both (N14)", () => {
    for (const rule of styleRules) {
      const animation = rule.declarations.get("animation") ?? "";
      if (!/bitsnap-checkout-[\w-]*-in\b/.test(animation)) continue;
      assert.match(animation, /\bbackwards\b/, rule.selectors.join(", "));
      assert.doesNotMatch(animation, /\b(forwards|both)\b/, rule.selectors.join(", "));
    }
  });

  it("lets reduced motion fade the dialog and the sheet too: its panel rules come last", () => {
    const reduced = styleRules.findIndex((rule) => rule.atRules[0] === "@media (prefers-reduced-motion: reduce)");
    for (const rule of styleRules) {
      if (/dialog-in|dialog-out|sheet-in|sheet-out/.test(rule.declarations.get("animation") ?? "")) {
        assert.ok(styleRules.indexOf(rule) < reduced, rule.selectors.join(", "));
      }
    }
  });
});

describe("CartComponent.tsx and CartFrame.tsx", () => {
  it("keeps auto-animate off the drawer root and off the list with motion off (S8)", () => {
    const drawer = SHELL_PATHS.map((path) => readFileSync(path, "utf8")).join("\n");
    const content = readFileSync(
      resolve(process.cwd(), "src/components/checkout/CartComponentContent.tsx"),
      "utf8",
    );
    assert.equal(drawer.includes("useAutoAnimate("), false, "the drawer root calls useAutoAnimate directly");
    assert.equal(drawer.includes("useCartAutoAnimate"), false, "the drawer root uses auto-animate again");
    assert.equal(content.match(/useAutoAnimate\(/g)?.length, 1, "only inside useCartAutoAnimate");
    assert.match(content, /const productsParent = useCartAutoAnimate\(\)/);
    assert.match(
      content,
      /"data-bitsnap-checkout-motion"\]\s*===\s*"off"[\s\S]*?if \(!motionOff\) \{\s*return undefined;\s*\}\s*setEnabled\(false\)/,
    );
  });

  it("carries no Tailwind utility in the shell; the stylesheet owns its look", () => {
    const source = SHELL_PATHS.map((path) => readFileSync(path, "utf8")).join("\n");
    for (const match of source.matchAll(/className=\{?(?:cn\()?"([^"]*)"/g)) {
      for (const token of match[1].split(/\s+/).filter(Boolean)) {
        assert.match(token, /^(bsc-[\w-]+|bitsnap-react)$/, `shell class "${token}"`);
      }
    }
  });
});

describe("cart.css lines (step 15)", () => {
  it("keeps the product-name link's look over a host `a:hover { color; text-decoration }` (0,1,1) (S5)", () => {
    const host = specificity("a:hover");
    const base = findTop("[data-bitsnap-checkout] .bsc-line-link");
    const hover = findTop("[data-bitsnap-checkout] .bsc-line-link:where(:hover)");
    assert.ok(base && hover, "no product-name link rules");
    for (const rule of [base, hover]) {
      assert.deepEqual(specificity(rule.selectors[0]), [0, 2, 0]);
      assert.ok(compare(specificity(rule.selectors[0]), host) > 0);
    }
    assert.equal(base.declarations.get("color"), "inherit");
    assert.equal(base.declarations.get("text-decoration"), "none");
    assert.equal(hover.declarations.get("color"), "inherit");
    assert.equal(hover.declarations.get("text-decoration"), "underline");
  });

  it("lays a line out on a 72 px tile column, the tile filled when the image is missing", () => {
    const line = findTop("[data-bitsnap-checkout] .bsc-line");
    assert.equal(line?.declarations.get("grid-template-columns"), "72px minmax(0, 1fr) auto");
    const thumb = findTop("[data-bitsnap-checkout] .bsc-line-thumb");
    assert.equal(thumb?.declarations.get("width"), "72px");
    assert.equal(thumb?.declarations.get("height"), "72px");
    assert.equal(thumb?.declarations.get("object-fit"), "cover");
    assert.equal(thumb?.declarations.get("background-color"), "var(--bsc-surface)");
    assert.ok(findTop("[data-bitsnap-checkout] .bsc-line-thumb-empty"), "no placeholder tile rule");
  });

  it("gives the stepper a 3:1 control-border pill and 44 px buttons, the remove button 44 px (R14)", () => {
    const stepper = findTop("[data-bitsnap-checkout] .bsc-stepper");
    assert.equal(stepper?.declarations.get("height"), "44px");
    assert.equal(stepper?.declarations.get("box-shadow"), "inset 0 0 0 1px var(--bsc-control-border)");
    const button = findTop("[data-bitsnap-checkout] .bsc-stepper-btn");
    assert.equal(button?.declarations.get("min-width"), "44px");
    assert.equal(button?.declarations.get("min-height"), "44px");
    assert.ok(findTop("[data-bitsnap-checkout] .bsc-stepper-btn:where(:focus-visible)")?.declarations.has("outline"));
    assert.ok(findTop("[data-bitsnap-checkout] .bsc-stepper-input:where(:focus-visible)")?.declarations.has("outline"));
    assert.equal(findTop("[data-bitsnap-checkout] .bsc-stepper-input")?.declarations.get("width"), "40px");
  });

  it("imports no ui/button, button group, lucide or cva in the line components", () => {
    for (const file of ["SingleProduct.tsx", "ProductPrice.tsx", "CartLines.tsx", "Skeleton.tsx", "icons.tsx"]) {
      const source = readFileSync(resolve(process.cwd(), "src/components/checkout", file), "utf8");
      assert.doesNotMatch(source, /ui\/button|lucide-react|class-variance-authority/, file);
    }
  });
});

describe("cart.css options and footer (step 16)", () => {
  it("styles the native country select: 44 px, a 3:1 control border, own chevron, visible focus (D4)", () => {
    const select = findTop("[data-bitsnap-checkout] .bsc-select");
    assert.equal(select?.declarations.get("height"), "44px");
    assert.equal(select?.declarations.get("border"), "1px solid var(--bsc-control-border)");
    assert.equal(select?.declarations.get("appearance"), "none");
    assert.match(select?.declarations.get("background") ?? "", /url\("data:image\/svg\+xml,[^"]*%238a8a8a/);
    assert.ok(findTop("[data-bitsnap-checkout] .bsc-select:where(:focus-visible)")?.declarations.has("outline"));
    assert.doesNotMatch(css, /countryDropdown|countrySearch|countryOption/, "the portalled dropdown rules are gone");
  });

  it("gives every payment card a 3:1 boundary and a 48 px target", () => {
    const card = findTop("[data-bitsnap-checkout] .bsc-method");
    assert.equal(card?.declarations.get("border"), "1px solid var(--bsc-control-border)");
    assert.equal(card?.declarations.get("min-height"), "48px");
    assert.equal(findTop("[data-bitsnap-checkout] .bsc-radio")?.declarations.get("border"), "2px solid var(--bsc-control-border)");
  });

  it("keeps the footer in its grid row with the safe area, total larger than its label, a 52 px CTA (F-07, D8, D10)", () => {
    const footer = findTop("[data-bitsnap-checkout] .bsc-footer");
    assert.equal(footer?.declarations.get("padding"), "12px 16px calc(16px + env(safe-area-inset-bottom))");
    assert.equal(findTop("[data-bitsnap-checkout] .bsc-total-label")?.declarations.get("font-size"), "14px");
    assert.equal(findTop("[data-bitsnap-checkout] .bsc-total-value")?.declarations.get("font-size"), "20px");
    const cta = findTop("[data-bitsnap-checkout] .bsc-cta");
    assert.equal(cta?.declarations.get("min-height"), "52px");
    assert.equal(cta?.declarations.get("width"), "100%");
    assert.ok(findTop("[data-bitsnap-checkout] .bsc-cta:where(:focus-visible)")?.declarations.has("outline"));
    assert.equal(findTop(slot("summary")), undefined, "the step 14 interim margin-top is gone");
  });
});

describe("express components (step 16)", () => {
  const TAILWIND = /^(w|h|p|m|px|py|mx|my|flex|grid|text|font|bg|border|rounded|gap|fixed|absolute|relative|overflow|z|opacity|size|animate)-?/;
  it("carry only bsc-* classes, no Tailwind utility and no ui/spinner (plan part 3 §7.3b)", () => {
    for (const file of [
      "src/components/express/ExpressStatus.tsx",
      "src/components/express/InPostPayButton.tsx",
      "src/components/express/RevolutPayButton.tsx",
      "src/components/checkout/ApplePay.tsx",
      "src/components/checkout/GooglePay.tsx",
      "src/components/checkout/CartExpressArea.tsx",
      "src/components/checkout/CartCheckout.tsx",
      "src/components/checkout/CountrySelector.tsx",
      "src/components/checkout/PaymentMethodChoice.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      assert.doesNotMatch(source, /ui\/spinner|ui\/select|lucide-react|lib\/utils/, file);
      for (const match of source.matchAll(/(?:className=|cx\()\{?\s*"([^"]*)"/g)) {
        for (const token of match[1].split(/\s+/).filter(Boolean)) {
          assert.doesNotMatch(token, TAILWIND, `${file}: "${token}"`);
        }
      }
    }
  });
});

describe("cart.css states (step 17)", () => {
  it("shapes the skeleton like the layout: line rows with a 72 px tile and a footer with a 52 px block", () => {
    assert.equal(findTop("[data-bitsnap-checkout] .bsc-skeleton-line")?.declarations.get("grid-template-columns"), "72px minmax(0, 1fr) auto");
    assert.equal(findTop("[data-bitsnap-checkout] .bsc-skeleton-thumb")?.declarations.get("height"), "72px");
    assert.equal(findTop("[data-bitsnap-checkout] .bsc-skeleton-cta")?.declarations.get("height"), "52px");
  });

  it("centres the empty and failed states with a 40 px icon", () => {
    assert.equal(findTop("[data-bitsnap-checkout] .bsc-state")?.declarations.get("justify-items"), "center");
    assert.equal(findTop("[data-bitsnap-checkout] .bsc-state-icon")?.declarations.get("width"), "40px");
    assert.equal(findTop("[data-bitsnap-checkout] .bsc-state-icon-error")?.declarations.get("color"), "var(--bsc-error)");
  });
});

/**
 * The declarations that win on `element` among the top-level rules: the most
 * specific selector, the later rule at equal specificity. jsdom matches
 * `:has()`, `:where()` and `:defined` but does not cascade them itself.
 */
function cascade(element: Element): Map<string, string> {
  const winners = new Map<string, { value: string; spec: Specificity }>();
  for (const rule of topLevel) {
    for (const selector of rule.selectors) {
      let hit = false;
      try {
        hit = element.matches(selector);
      } catch {
        continue; // a pseudo-element selector
      }
      if (!hit) continue;
      const spec = specificity(selector);
      for (const [property, value] of rule.declarations) {
        const previous = winners.get(property);
        if (previous == null || compare(spec, previous.spec) >= 0) winners.set(property, { value, spec });
      }
    }
  }
  return new Map([...winners].map(([property, { value }]) => [property, value]));
}

describe("cart.css express divider (N1, N2, N6)", () => {
  const GOOGLE_NOT_READY = '<div class="google-pay-button-container not-ready"><button type="button"></button></div>';
  const REVOLUT_EMPTY = '<div data-bitsnap-express="revolutPay"><div></div></div>';
  const ERROR_ONLY =
    '<div data-bitsnap-express="revolutPay"><div></div><p class="bsc-express-status bsc-express-status-alert" data-bitsnap-express-status="load-failed" data-bitsnap-checkout-part="status" role="alert">Could not load</p></div>' +
    '<p class="bsc-express-status bsc-express-status-alert" data-bitsnap-express-status="cart-unavailable" data-bitsnap-checkout-part="status" role="alert">Cart unavailable</p>';

  /** The cart's express block with these buttons; `define` registers custom elements first. */
  function express(buttons: { apple?: string; google?: string; wide?: string }, define: string[] = []) {
    const { window } = new JSDOM(`<div data-bitsnap-checkout="root" class="dark">
      <div data-bitsnap-checkout-slot="options" class="bsc-options">
        <div class="bsc-express">
          <div data-bitsnap-checkout-wallets="" class="bsc-wallets">
            <div data-bitsnap-checkout-slot="paymentButtons" class="bsc-express-btn">${buttons.apple ?? ""}</div>
            <div data-bitsnap-checkout-slot="paymentButtons" class="bsc-express-btn">${buttons.google ?? ""}</div>
            <div data-bitsnap-checkout-slot="paymentButtons" class="bsc-express-btn bsc-express-wide">${buttons.wide ?? ""}</div>
          </div>
          <p class="bsc-or" data-bitsnap-checkout-divider=""><span class="bsc-or-line"></span>or<span class="bsc-or-line"></span></p>
        </div>
      </div>
    </div>`);
    for (const name of define) window.customElements.define(name, class extends window.HTMLElement {});
    const doc = window.document;
    return {
      divider: cascade(doc.querySelector(".bsc-or")!).get("display"),
      collapsed: cascade(doc.querySelector(".bsc-express")!).get("margin-bottom") === "-16px",
    };
  }

  it("hides the divider and collapses the block with no button", () => {
    assert.deepEqual(express({}), { divider: "none", collapsed: true });
    assert.deepEqual(
      express({ apple: "<apple-pay-button></apple-pay-button>", google: GOOGLE_NOT_READY, wide: `<div data-bitsnap-express="inpostPay"><inpost-izi-button></inpost-izi-button></div>${REVOLUT_EMPTY}` }),
      { divider: "none", collapsed: true },
      "unloaded Apple Pay and InPost elements, a Google Pay container that is not ready, an empty Revolut frame",
    );
  });

  it("hides the divider when a wrapper holds only status or error text, which still takes its row", () => {
    assert.deepEqual(express({ google: GOOGLE_NOT_READY, wide: ERROR_ONLY }), { divider: "none", collapsed: false });
  });

  it("shows the divider under any real express button", () => {
    const cases: Array<[string, Parameters<typeof express>[0], string[]]> = [
      ["Apple Pay", { apple: "<apple-pay-button></apple-pay-button>" }, ["apple-pay-button"]],
      ["Google Pay", { google: '<div class="google-pay-button-container"><button type="button"></button></div>' }, []],
      ["InPost Pay", { wide: '<div data-bitsnap-express="inpostPay"><inpost-izi-button></inpost-izi-button></div>' }, ["inpost-izi-button"]],
      ["Revolut Pay", { wide: '<div data-bitsnap-express="revolutPay"><div><iframe></iframe></div></div>' }, []],
      ["Revolut Pay beside an InPost error", { wide: `${REVOLUT_EMPTY.replace("<div></div>", "<div><iframe></iframe></div>")}${ERROR_ONLY}` }, []],
    ];
    for (const [name, buttons, define] of cases) {
      assert.deepEqual(express(buttons, define), { divider: "flex", collapsed: false }, name);
    }
  });
});

describe("cart.css standalone express parts (S2, S4)", () => {
  it("centres the express status in small text outside the cart, and the cart's rule wins inside it", () => {
    const { window } = new JSDOM(`<div data-bitsnap-express="revolutPay"><div></div>
      <p id="alone" class="bsc-express-status bsc-express-status-alert" data-bitsnap-express-status="failed" data-bitsnap-checkout-part="status">x</p></div>
      <div data-bitsnap-checkout="root"><div data-bitsnap-checkout-slot="paymentButtons">
      <p id="cart" class="bsc-express-status bsc-express-status-alert" data-bitsnap-express-status="failed" data-bitsnap-checkout-part="status">x</p></div></div>`);
    const alone = cascade(window.document.getElementById("alone")!);
    assert.equal(alone.get("text-align"), "center");
    assert.equal(alone.get("font-size"), "13px");
    assert.equal(alone.get("margin"), "6px 0 0");
    const cart = cascade(window.document.getElementById("cart")!);
    assert.equal(cart.get("color"), "var(--bsc-error)");
    assert.equal(cart.get("text-align"), "center");
  });

  it("shows the Google Pay spinner outside the cart and hides its status text visually", () => {
    const { window } = new JSDOM(`<span id="idle" data-bitsnap-checkout-part="wallet-busy" role="status"></span>
      <span id="busy" data-bitsnap-checkout-part="wallet-busy" role="status"><span class="bsc-spinner" aria-hidden="true"></span><span data-bitsnap-checkout-part="sr">Confirming</span></span>`);
    const doc = window.document;
    assert.equal(cascade(doc.getElementById("idle")!).get("display"), "none", "an idle status takes no space");
    assert.equal(cascade(doc.getElementById("busy")!).get("display"), "flex");
    const spinner = cascade(doc.querySelector("#busy .bsc-spinner")!);
    assert.equal(spinner.get("width"), "16px");
    assert.match(spinner.get("animation") ?? "", /^bitsnap-cart-spin /);
    const text = cascade(doc.querySelector('#busy [data-bitsnap-checkout-part="sr"]')!);
    assert.equal(text.get("position"), "absolute");
    assert.equal(text.get("clip-path"), "inset(50%)");
  });

  it("hides the empty-cart announcement visually inside the cart (N7)", () => {
    const { window } = new JSDOM('<div data-bitsnap-checkout="root"><p data-bitsnap-checkout-part="sr" role="status">x</p></div>');
    const text = cascade(window.document.querySelector('[data-bitsnap-checkout-part="sr"]')!);
    assert.equal(text.get("position"), "absolute");
    assert.equal(text.get("width"), "1px");
    assert.equal(text.get("margin"), "0", "the reset applies; the part rule keeps it off screen");
  });
});
