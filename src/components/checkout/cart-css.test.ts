import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

/*
 * Static guard for the checkout stylesheet (F-01 regression guard).
 *
 * The cart lost to host pages because its rules sat in a cascade layer: any
 * unlayered host rule (`.w-full`, `button { background: transparent }`) beats a
 * layered rule whatever its specificity. jsdom implements neither cascade
 * layers nor media queries, so the cascade itself is checked in a browser; this
 * test pins the properties of the file that make it work there.
 */

// Tests run from the package root (`node --test .test-dist/...`).
const CSS_PATH = resolve(process.cwd(), "src/components/checkout/checkout.css");
const COMPONENT_PATH = resolve(
  process.cwd(),
  "src/components/checkout/CartComponent.tsx",
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
      assert.ok(prelude != null, "unbalanced braces in checkout.css");
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

  assert.equal(stack.length, 0, "unbalanced braces in checkout.css");
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

describe("specificity helper", () => {
  it("counts the selectors the stylesheet uses", () => {
    assert.deepEqual(specificity('[data-a] [data-b="x"]'), [0, 2, 0]);
    assert.deepEqual(specificity('[data-a] [data-b="x"]:hover:not(:disabled)'), [0, 4, 0]);
    assert.deepEqual(specificity('[data-a] [data-b="x"]:where(:hover:not(:disabled))'), [0, 2, 0]);
    assert.deepEqual(specificity('[data-a] [data-b="x"] input[type="radio"]'), [0, 3, 1]);
    assert.deepEqual(specificity('[data-a] :where([data-b]:disabled) [data-c]'), [0, 2, 0]);
    assert.deepEqual(specificity('[data-a] [data-b]:has(input:focus-visible)'), [0, 3, 1]);
    assert.deepEqual(specificity("#id .a::before"), [1, 1, 1]);
  });
});

describe("checkout.css", () => {
  it("has rules to check", () => {
    assert.ok(styleRules.length > 20, `only ${styleRules.length} rules parsed`);
  });

  it("is not wrapped in a cascade layer, so unlayered host CSS cannot beat it", () => {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(withoutComments, /@layer\b/);
    for (const rule of rules) {
      assert.ok(
        !rule.atRules.some((atRule) => atRule.startsWith("@layer")),
        `${rule.selectors.join(", ")} sits in a layer`,
      );
    }
  });

  it("scopes every selector to the checkout boundary", () => {
    for (const rule of styleRules) {
      for (const selector of rule.selectors) {
        assert.ok(
          selector.startsWith("[data-bitsnap-checkout"),
          `"${selector}" is not scoped to [data-bitsnap-checkout…] (the prefixer would rewrite it and it could leak)`,
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

  it("positions the root explicitly, so its z-index works under reduced motion too", () => {
    const root = styleRules.find(
      (rule) =>
        rule.atRules.length === 0 &&
        rule.selectors.includes('[data-bitsnap-checkout="root"]'),
    );
    assert.ok(root, 'no [data-bitsnap-checkout="root"] rule');
    assert.equal(root.declarations.get("position"), "relative");
    assert.equal(root.declarations.get("z-index"), "999999");
  });

  it("owns the drawer geometry instead of utility classes", () => {
    const panelSelector = '[data-bitsnap-checkout] [data-bitsnap-checkout-slot="panel"]';
    const base = styleRules.find(
      (rule) => rule.atRules.length === 0 && rule.selectors.includes(panelSelector),
    );
    assert.ok(base, "no base panel rule");
    assert.equal(base.declarations.get("position"), "fixed");
    assert.equal(base.declarations.get("top"), "0");
    assert.equal(base.declarations.get("right"), "0");
    assert.equal(base.declarations.get("bottom"), "0");
    assert.equal(base.declarations.get("width"), "100%");

    const widths = styleRules
      .filter((rule) => rule.atRules.length === 1 && rule.selectors.includes(panelSelector))
      .map((rule) => [rule.atRules[0], rule.declarations.get("width")]);
    assert.deepEqual(widths, [
      // Tailwind's `md` and `xl` breakpoints, as `md:w-[350px] xl:w-[420px]` used.
      ["@media (min-width: 48rem)", "var(--bitsnap-checkout-panel-width, 350px)"],
      ["@media (min-width: 80rem)", "var(--bitsnap-checkout-panel-width, 420px)"],
    ]);

    const overlay = styleRules.find((rule) =>
      rule.selectors.includes('[data-bitsnap-checkout] [data-bitsnap-checkout-slot="overlay"]'),
    );
    assert.ok(overlay, "no overlay rule");
    assert.equal(overlay.declarations.get("position"), "fixed");
    assert.equal(overlay.declarations.get("z-index"), "10");
  });

  it("gives the checkout button its surface and spacing", () => {
    const button = styleRules.find((rule) =>
      rule.selectors.includes(
        '[data-bitsnap-checkout] [data-bitsnap-checkout-slot="checkoutButton"]',
      ),
    );
    assert.ok(button, "no checkoutButton rule");
    assert.match(button.declarations.get("background-color") ?? "", /--bitsnap-checkout-button-background/);
    // `px-3 py-2 mx-2 my-2`, compiled the way Tailwind compiles them.
    assert.equal(
      button.declarations.get("padding"),
      "calc(var(--spacing) * 2) calc(var(--spacing) * 3)",
    );
    assert.equal(button.declarations.get("margin"), "calc(var(--spacing) * 2)");
    assert.equal(button.declarations.get("font-weight"), "700");

    const retry = styleRules.find((rule) =>
      rule.selectors.includes(
        '[data-bitsnap-checkout] [data-bitsnap-checkout-slot="checkoutButton"]:where([data-bitsnap-checkout-retry])',
      ),
    );
    assert.ok(retry, "no rule for the retry button");
    assert.equal(retry.declarations.get("margin"), "0");
  });

  it("writes the lengths that replace utilities in rem, not px", () => {
    // 1.29.1 sized these with Tailwind utilities (rem), so they followed a host
    // `html { font-size: 62.5% }`. Only borders, outlines and the arbitrary
    // panel widths were px then.
    const allowedPx = new Set(["border-width", "border", "border-radius", "outline", "outline-offset"]);
    for (const rule of styleRules) {
      for (const [property, value] of rule.declarations) {
        if (!/\dpx\b/.test(value)) continue;
        const isPanelWidth =
          property === "width" && value.startsWith("var(--bitsnap-checkout-panel-width,");
        assert.ok(
          allowedPx.has(property) || isPanelWidth,
          `${rule.selectors.join(", ")} { ${property}: ${value} } uses px; write calc(var(--spacing) * n)`,
        );
      }
    }
  });

  it("keeps the skeleton at its 1.29.1 colour, independent of the surface token", () => {
    const skeleton = styleRules.find((rule) =>
      rule.selectors.includes('[data-bitsnap-checkout] [data-bitsnap-checkout-slot="skeleton"]'),
    );
    assert.ok(skeleton, "no skeleton rule");
    assert.equal(skeleton.declarations.get("background-color"), "var(--color-neutral-700)");
  });

  it("lists every state rule after its base rule, so the state wins at equal specificity", () => {
    const topLevel = styleRules.filter((rule) => rule.atRules.length === 0);
    const indexOf = (selector: string) =>
      topLevel.findIndex((rule) => rule.selectors.includes(selector));

    let checked = 0;
    for (const [index, rule] of topLevel.entries()) {
      for (const selector of rule.selectors) {
        const match = /^(.*\[data-bitsnap-checkout-slot="[^"]+"\]):where\(.*\)$/.exec(selector);
        if (match == null) continue;
        const base = indexOf(match[1]);
        if (base === -1) continue; // e.g. `product`: only styled in a state
        checked += 1;
        assert.ok(
          base < index,
          `"${selector}" comes before its base rule "${match[1]}"; equal specificity, so the base would win`,
        );
      }
    }
    assert.ok(checked >= 8, `only ${checked} state rules checked`);

    const slot = (name: string, state: string) =>
      `[data-bitsnap-checkout] [data-bitsnap-checkout-slot="${name}"]:where(${state})`;
    const order = (earlier: string, later: string) => {
      const a = indexOf(earlier);
      const b = indexOf(later);
      assert.ok(a !== -1, `no rule "${earlier}"`);
      assert.ok(b !== -1, `no rule "${later}"`);
      assert.ok(a < b, `"${later}" has to come after "${earlier}"`);
    };
    order(slot("countryOption", ":hover, [data-highlighted]"), slot("countryOption", '[data-state="checked"]'));
    order(slot("paymentMethodOption", ":hover"), slot("paymentMethodOption", "[data-selected]"));
  });

  it("keeps the ring-coloured border on the focused country trigger", () => {
    const focus = styleRules.find((rule) =>
      rule.selectors.includes(
        '[data-bitsnap-checkout] [data-bitsnap-checkout-slot="countryTrigger"]:where(:focus-visible)',
      ),
    );
    assert.ok(focus, "no focus rule for the country trigger");
    assert.equal(
      focus.declarations.get("border-color"),
      "var(--bitsnap-checkout-focus-ring, var(--ring))",
    );
  });
});

describe("CartComponent.tsx", () => {
  it("leaves the drawer geometry to the stylesheet", () => {
    const source = readFileSync(COMPONENT_PATH, "utf8");
    // A host page that defines `.w-full` or `.fixed` unlayered would win over
    // these classes (F-01); checkout.css sets the values instead.
    for (const utility of ["w-full", "md:w-[", "xl:w-[", "fixed", "z-10", "z-20"]) {
      assert.ok(
        !source.includes(`"${utility}`) && !source.includes(` ${utility}`),
        `CartComponent.tsx still uses the utility "${utility}"`,
      );
    }
  });
});
