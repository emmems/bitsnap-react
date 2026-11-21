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

describe("CartComponent.tsx and CartFrame.tsx", () => {
  it("keeps auto-animate off the drawer root and off the list with motion off (S8)", () => {
    const drawer = SHELL_PATHS.map((path) => readFileSync(path, "utf8")).join("\n");
    const content = readFileSync(
      resolve(process.cwd(), "src/components/checkout/CartComponentContent.tsx"),
      "utf8",
    );
    // On the root, auto-animate ran its "add" keyframes on the portalled panel
    // (opacity 0 for ~250 ms); checkout.css animates the drawer instead.
    assert.equal(drawer.includes("useAutoAnimate("), false, "the drawer root calls useAutoAnimate directly");
    assert.equal(drawer.includes("useCartAutoAnimate"), false, "the drawer root uses auto-animate again");
    // CSS cannot stop the animations auto-animate starts from script.
    assert.equal(content.match(/useAutoAnimate\(/g)?.length, 1, "only inside useCartAutoAnimate");
    assert.match(content, /const productsParent = useCartAutoAnimate\(\)/);
    assert.match(
      content,
      /"data-bitsnap-checkout-motion"\]\s*===\s*"off"[\s\S]*?if \(!motionOff\) \{\s*return undefined;\s*\}\s*setEnabled\(false\)/,
    );
  });

  it("leaves the drawer geometry to the stylesheet", () => {
    const source = SHELL_PATHS.map((path) => readFileSync(path, "utf8")).join("\n");
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

describe("checkout.css 1.31.0 tokens", () => {
  const findRule = (selector: string) =>
    styleRules.find((rule) => rule.selectors.includes(selector));

  it("colours the sale line from the tokens with fallbacks that pass 4.5:1 on the dark panel", () => {
    const regular = findRule('[data-bitsnap-checkout] [data-bitsnap-checkout-price="regular"]');
    const omnibus = findRule('[data-bitsnap-checkout] [data-bitsnap-checkout-price="omnibus"]');
    const sale = findRule('[data-bitsnap-checkout] [data-bitsnap-checkout-price="sale"]');
    assert.ok(regular && omnibus && sale, "missing a sale-line rule");
    assert.equal(regular.declarations.get("color"), "var(--bitsnap-checkout-muted-foreground, #a3a3a3)");
    assert.equal(omnibus.declarations.get("color"), "var(--bitsnap-checkout-muted-foreground, #a3a3a3)");
    assert.equal(sale.declarations.get("color"), "var(--bitsnap-checkout-sale, #f87171)");
  });

  it("turns the cart's own motion off on the root marker, but not the express widgets", () => {
    const motionOff = styleRules.find((rule) =>
      rule.selectors.some((selector) =>
        selector.startsWith('[data-bitsnap-checkout="root"][data-bitsnap-checkout-motion="off"]'),
      ),
    );
    assert.ok(motionOff, "no motion-off rule");
    assert.equal(motionOff.declarations.get("animation"), "none !important");
    assert.equal(motionOff.declarations.get("transition"), "none !important");
    assert.match(
      motionOff.selectors.join(","),
      /:not\(:where\(\[data-bitsnap-checkout-slot="paymentButtons"\], \[data-bitsnap-checkout-slot="paymentButtons"\] \*, \[data-bitsnap-checkout-slot="skeleton"\]\)\)/,
    );
    // The exclusion must match the skeleton the cart renders (its pulse is a
    // status signal), not a class nothing carries.
    assert.doesNotMatch(motionOff.selectors.join(","), /\.bsc-skeleton/);
    assert.match(
      readFileSync(resolve(process.cwd(), "src/components/checkout/CartLines.tsx"), "utf8"),
      /<Skeleton\s+data-bitsnap-checkout-slot="skeleton"/,
    );
    // The skeleton's delayed show (1.32.0) must never be stopped by motion off.
  });
});

describe("checkout.css drawer enter and exit", () => {
  const panel = '[data-bitsnap-checkout] [data-bitsnap-checkout-slot="panel"]';
  const overlay = '[data-bitsnap-checkout] [data-bitsnap-checkout-slot="overlay"]';
  const keyframes = (name: string) =>
    rules.filter((rule) => rule.atRules.at(-1) === `@keyframes ${name}`);
  const topLevel = (selector: string) =>
    styleRules.find((rule) => rule.atRules.length === 0 && rule.selectors.includes(selector));
  const reduced = (selector: string) =>
    styleRules.find(
      (rule) =>
        rule.atRules.length === 1 &&
        rule.atRules[0] === "@media (prefers-reduced-motion: reduce)" &&
        rule.selectors.includes(selector),
    );
  const DURATION = "var(--bitsnap-checkout-motion-duration, 240ms)";

  it("defines the drawer keyframes, the panel never starting at opacity 0", () => {
    const panelIn = keyframes("bitsnap-checkout-panel-in");
    assert.equal(panelIn.length, 1, "no bitsnap-checkout-panel-in keyframes");
    assert.deepEqual(panelIn[0].selectors, ["from"]);
    assert.equal(panelIn[0].declarations.get("transform"), "translateX(1.5rem)");
    // A1 counts the rows once their effective opacity is above 0: the enter
    // must not hold the panel at 0, as auto-animate's "add" did.
    const startOpacity = Number(panelIn[0].declarations.get("opacity"));
    assert.ok(startOpacity > 0 && startOpacity < 1, `panel enter starts at opacity ${startOpacity}`);

    const panelFadeIn = keyframes("bitsnap-checkout-panel-fade-in");
    assert.equal(panelFadeIn.length, 1, "no bitsnap-checkout-panel-fade-in keyframes");
    assert.ok(Number(panelFadeIn[0].declarations.get("opacity")) > 0, "reduced-motion panel enter starts at 0");
    assert.equal(panelFadeIn[0].declarations.has("transform"), false, "reduced motion slides");

    const panelOut = keyframes("bitsnap-checkout-panel-out");
    assert.equal(panelOut.length, 1, "no bitsnap-checkout-panel-out keyframes");
    assert.deepEqual(panelOut[0].selectors, ["to"]);
    assert.equal(panelOut[0].declarations.get("opacity"), "0");
    assert.equal(panelOut[0].declarations.get("transform"), "translateX(1.5rem)");

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
      const rule = topLevel(selector);
      assert.ok(rule, `no rule ${selector}`);
      assert.equal(rule.declarations.get("animation"), animation);
      assert.equal(rule.declarations.get("animation-fill-mode"), undefined);
    }
    // Radix Presence waits for an exit only when the animation name changes.
    assert.notEqual(expected[0][1].split(" ")[0], expected[1][1].split(" ")[0]);
    assert.notEqual(expected[2][1].split(" ")[0], expected[3][1].split(" ")[0]);
    // The enter keeps no fill: a held transform would make the panel the
    // containing block of fixed descendants.
    assert.doesNotMatch(expected[0][1], /\b(forwards|both)\b/);
  });

  it("lets the closing panel and overlay take no clicks, over Radix's inline pointer-events (review N2)", () => {
    for (const element of [panel, overlay]) {
      const closed = topLevel(`${element}:where([data-state="closed"])`);
      assert.ok(closed, `no closed rule for ${element}`);
      // Radix writes `style="pointer-events: auto"` on both: only !important wins.
      assert.equal(closed.declarations.get("pointer-events"), "none !important");
      assert.equal(topLevel(`${element}:where([data-state="open"])`)?.declarations.has("pointer-events"), false);
    }
  });

  it("drops the slide and shortens the fade under prefers-reduced-motion", () => {
    const short = `min(${DURATION}, 120ms)`;
    const open = reduced(`${panel}:where([data-state="open"])`);
    const closed = reduced(`${panel}:where([data-state="closed"])`);
    const overlays = reduced(`${overlay}:where([data-state="open"], [data-state="closed"])`);
    assert.ok(open && closed && overlays, "missing a reduced-motion rule");
    assert.equal(open.declarations.get("animation-name"), "bitsnap-checkout-panel-fade-in");
    assert.equal(closed.declarations.get("animation-name"), "bitsnap-checkout-fade-out");
    for (const rule of [open, closed, overlays]) {
      assert.equal(rule.declarations.get("animation-duration"), short);
    }
  });

  it("is stopped by the motion-off rule, which comes later and is !important", () => {
    const all = styleRules.filter((rule) => rule.atRules.length === 0);
    const motionOff = all.findIndex((rule) =>
      rule.selectors.some((selector) =>
        selector.startsWith('[data-bitsnap-checkout="root"][data-bitsnap-checkout-motion="off"]'),
      ),
    );
    assert.ok(motionOff !== -1, "no motion-off rule");
    assert.equal(all[motionOff].declarations.get("animation"), "none !important");
    // `:where(*)` matches the overlay and the panel (neither is excluded), so
    // `animation: none` reaches them and Radix Presence unmounts at once.
    const selector = all[motionOff].selectors.join(",");
    assert.doesNotMatch(selector, /slot="(panel|overlay)"/);
    for (const rule of styleRules) {
      const sets = rule.declarations.get("animation") ?? rule.declarations.get("animation-name") ?? "";
      if (!/bitsnap-checkout-(panel|fade)-/.test(sets)) continue;
      assert.doesNotMatch(sets, /!important/, `${rule.selectors.join(", ")} would beat motion off`);
      assert.ok(
        styleRules.indexOf(rule) < styleRules.indexOf(all[motionOff]),
        `${rule.selectors.join(", ")} comes after the motion-off rule`,
      );
    }
  });

  it("keeps every drawer animation rule within the (0,2,0) cap", () => {
    const animated = styleRules.filter(
      (rule) => rule.declarations.has("animation") || rule.declarations.has("animation-name"),
    );
    assert.ok(animated.length >= 7, `only ${animated.length} animation rules`);
    for (const rule of animated) {
      for (const selector of rule.selectors) {
        assert.ok(compare(specificity(selector), [0, 2, 0]) <= 0, `${selector} is above (0,2,0)`);
      }
    }
  });
});
