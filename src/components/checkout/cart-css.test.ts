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
});

describe("cart.css content rules (1.31.0, in literals until steps 15-17)", () => {
  it("gives the checkout button its surface and spacing; the retry button no margin", () => {
    const button = findTop(slot("checkoutButton"));
    assert.ok(button, "no checkoutButton rule");
    assert.equal(button.declarations.get("background-color"), "var(--bsc-cta-bg)");
    assert.equal(button.declarations.get("padding"), "8px 12px");
    assert.equal(button.declarations.get("margin"), "8px");
    assert.equal(button.declarations.get("font-weight"), "700");
    assert.equal(findTop(`${slot("checkoutButton")}:where([data-bitsnap-checkout-retry])`)?.declarations.get("margin"), "0");
  });

  it("colours the sale line from the tokens with fallbacks that pass 4.5:1 on the dark panel", () => {
    const price = (kind: string) => findTop(`[data-bitsnap-checkout] [data-bitsnap-checkout-price="${kind}"]`);
    assert.equal(price("regular")?.declarations.get("color"), "var(--bitsnap-checkout-muted-foreground, #a3a3a3)");
    assert.equal(price("omnibus")?.declarations.get("color"), "var(--bitsnap-checkout-muted-foreground, #a3a3a3)");
    assert.equal(price("sale")?.declarations.get("color"), "var(--bitsnap-checkout-sale, #f87171)");
  });

  it("keeps the ring-coloured border on the focused country trigger", () => {
    assert.equal(
      findTop(`${slot("countryTrigger")}:where(:focus-visible)`)?.declarations.get("border-color"),
      "var(--bsc-ring)",
    );
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
    order(`${slot("countryOption")}:where(:hover, [data-highlighted])`, `${slot("countryOption")}:where([data-state="checked"])`);
    order(`${slot("paymentMethodOption")}:where(:hover)`, `${slot("paymentMethodOption")}:where([data-selected])`);
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
      [`${panel}:where([data-state="open"])`, `bitsnap-checkout-panel-in ${DURATION} ease-out`],
      [`${panel}:where([data-state="closed"])`, `bitsnap-checkout-panel-out ${DURATION} ease-in forwards`],
      [`${overlay}:where([data-state="open"])`, `bitsnap-checkout-fade-in ${DURATION} ease-out`],
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
