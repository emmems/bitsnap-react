import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { renderToString } from "react-dom/server";
import {
  ACCENT_MIN_CONTRAST,
  contrastRatio,
  PANEL_SHADCN_MAPPING,
  PANEL_TOKENS,
  panelThemeStyle,
} from "./tokens";
import { useColorMode } from "./useColorMode";

// Tests run from the repository root (`pnpm test`).
const ROOT = process.cwd();
const PANEL_CSS = readFileSync(resolve(ROOT, "src/panel/theme/panel.css"), "utf8");
const GLOBAL_CSS = readFileSync(resolve(ROOT, "src/global.css"), "utf8");

function cssBlock(css: string, selectorStart: string): Record<string, string> {
  const start = css.indexOf(selectorStart);
  assert.notEqual(start, -1, `${selectorStart} not found`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[match[1]] = match[2].trim();
  }
  return vars;
}

describe("panel.css", () => {
  it("holds the same token values as PANEL_TOKENS", () => {
    const light = cssBlock(PANEL_CSS, "[data-bitsnap-panel] {");
    const dark = cssBlock(PANEL_CSS, ".dark [data-bitsnap-panel],");
    for (const [name, value] of Object.entries(PANEL_TOKENS.light)) {
      assert.equal(light[`--panel-${name}`], value, `light --panel-${name}`);
    }
    for (const [name, value] of Object.entries(PANEL_TOKENS.dark)) {
      assert.equal(dark[`--panel-${name}`], value, `dark --panel-${name}`);
    }
    assert.equal(dark["--panel-accent-now"], "var(--panel-accent-dark)");
    assert.equal(light["--panel-accent-now"], "var(--panel-accent)");
  });

  it("is emitted unprefixed, and the global .dark rule keeps its prefix", async () => {
    // Loaded at run time, not bundled into the test.
    const load = createRequire(resolve(ROOT, "package.json"));
    const postcss = load("postcss") as typeof import("postcss").default;
    const config = load(resolve(ROOT, "postcss.config.js")) as {
      plugins: Array<{ postcssPlugin?: string }>;
    };
    // Run only the prefix step of the real config (Tailwind is not needed for
    // these selectors); it is the one plugin that is not Tailwind/autoprefixer.
    const prefixPlugin = config.plugins.find(
      (plugin) =>
        plugin?.postcssPlugin !== "@tailwindcss/postcss" &&
        plugin?.postcssPlugin !== "autoprefixer",
    );
    assert.ok(prefixPlugin, "prefix plugin in postcss.config.js");

    const panel = (await postcss([prefixPlugin as never]).process(PANEL_CSS, { from: undefined })).css;
    assert.match(panel, /(^|\s)\[data-bitsnap-panel\] \{/);
    assert.match(panel, /\.dark \[data-bitsnap-panel\],\s*\[data-bitsnap-panel\]\.dark \{/);
    assert.doesNotMatch(panel, /\.bitsnap-react\s+\.bitsnap-react\s+\[data-bitsnap-panel\]/);
    assert.doesNotMatch(panel, /\.bitsnap-react\s+(\.dark\s+)?\[data-bitsnap-panel\]/);

    const globalDark = GLOBAL_CSS.slice(GLOBAL_CSS.indexOf("\n.dark {"), GLOBAL_CSS.indexOf("@theme"));
    const global = (await postcss([prefixPlugin as never]).process(globalDark, { from: undefined })).css;
    assert.match(global, /\.bitsnap-react \.dark \{/);
    assert.match(global, /--background: oklch\(0\.145 0 0\)/);
  });
});

describe("panelThemeStyle", () => {
  it("maps every shadcn token inline, even without a brand", () => {
    const style = panelThemeStyle() as Record<string, string>;
    const tokens = [...GLOBAL_CSS.slice(0, GLOBAL_CSS.indexOf("--chart-1")).matchAll(/(--[a-z-]+):/g)].map(
      (match) => match[1],
    );
    assert.ok(tokens.length >= 19);
    for (const token of tokens) {
      assert.ok(style[token]?.startsWith("var(--panel-"), `${token} is not mapped`);
    }
    assert.equal(style["--primary"], "var(--panel-accent-now)");
    assert.equal(style["--ring"], "var(--panel-accent-text-now)");
    assert.equal(style["--panel-accent"], undefined);
    assert.equal(Object.keys(style).length, Object.keys(PANEL_SHADCN_MAPPING).length);
  });

  it("sets the brand literals with a foreground computed from hex", () => {
    const style = panelThemeStyle("#dc2626", "#fca5a5") as Record<string, string>;
    assert.equal(style["--panel-accent"], "#dc2626");
    assert.equal(style["--panel-accent-fg"], "#ffffff");
    assert.equal(style["--panel-accent-text"], "#dc2626");
    assert.equal(style["--panel-accent-dark"], "#fca5a5");
    assert.equal(style["--panel-accent-dark-fg"], "#18181b");
    assert.equal(style["--panel-accent-dark-text"], "#fca5a5");
  });

  it("uses the light brand in dark mode when brandDark is missing", () => {
    const style = panelThemeStyle("rgb(37, 99, 235)") as Record<string, string>;
    assert.equal(style["--panel-accent-dark"], "rgb(37, 99, 235)");
    assert.equal(style["--panel-accent-dark-fg"], "#ffffff");
  });

  it("keeps the neutral look for a colour it cannot parse", () => {
    const style = panelThemeStyle("tomato", "var(--brand)") as Record<string, string>;
    assert.equal(style["--panel-accent"], undefined);
    assert.equal(style["--panel-accent-fg"], undefined);
    assert.equal(style["--panel-accent-dark"], undefined);
    assert.equal(style["--primary"], "var(--panel-accent-now)");
  });

  it("guards a pale brand: fill stays, text-like accents fall back", () => {
    const style = panelThemeStyle("#fde68a", "#1e1b4b") as Record<string, string>;
    assert.equal(style["--panel-accent"], "#fde68a");
    assert.equal(style["--panel-accent-fg"], "#18181b");
    assert.equal(style["--panel-accent-text"], "var(--panel-fg)");
    assert.equal(style["--panel-accent-edge"], "var(--panel-muted)");
    assert.equal(style["--panel-accent-dark-text"], "var(--panel-fg)");
  });
});

describe("panel contrast", () => {
  const AA = 4.5;
  for (const mode of ["light", "dark"] as const) {
    const t = PANEL_TOKENS[mode];
    it(`${mode}: text pairs pass AA`, () => {
      const pairs: Array<[string, string, string, number]> = [
        ["fg on bg", t.fg, t.bg, AA],
        ["fg on surface", t.fg, t.surface, AA],
        ["fg on surface-2", t.fg, t["surface-2"], AA],
        ["muted on surface", t.muted, t.surface, AA],
        ["muted on surface-2", t.muted, t["surface-2"], AA],
        ["muted on bg", t.muted, t.bg, AA],
        ["selected pill text on fill", t.fg, t["surface-2"], AA],
        ["selected pill border on bg", t.fg, t.bg, ACCENT_MIN_CONTRAST],
        ["selected pill border on fill", t.fg, t["surface-2"], ACCENT_MIN_CONTRAST],
        ["ok pill", t.ok, t["ok-bg"], AA],
        ["warn pill", t.warn, t["warn-bg"], AA],
        ["danger pill", t.danger, t["danger-bg"], AA],
        ["info pill", t.info, t["info-bg"], AA],
        ["danger on surface", t.danger, t.surface, AA],
        ["white on danger-solid", "#ffffff", t["danger-solid"], AA],
      ];
      for (const [name, fg, bg, min] of pairs) {
        const ratio = contrastRatio(fg, bg) ?? 0;
        assert.ok(ratio >= min, `${mode} ${name}: ${ratio.toFixed(2)} < ${min}`);
      }
    });
  }

  it("default accents pass AA in both modes", () => {
    assert.ok((contrastRatio("#fafafa", "#18181b") ?? 0) >= AA);
    assert.ok((contrastRatio("#18181b", PANEL_TOKENS.light.surface) ?? 0) >= ACCENT_MIN_CONTRAST);
    assert.ok((contrastRatio("#fafafa", PANEL_TOKENS.dark.surface) ?? 0) >= ACCENT_MIN_CONTRAST);
  });

  it("a guarded brand never leaves a text accent under 3:1", () => {
    for (const brand of ["#fde68a", "#ffffff", "#dc2626", "#000000", "#22c55e"]) {
      for (const mode of ["light", "dark"] as const) {
        const style = panelThemeStyle(brand) as Record<string, string>;
        const name = mode === "light" ? "--panel-accent-text" : "--panel-accent-dark-text";
        const value = style[name] === "var(--panel-fg)" ? PANEL_TOKENS[mode].fg : style[name];
        const ratio = contrastRatio(value, PANEL_TOKENS[mode].surface) ?? 0;
        assert.ok(ratio >= ACCENT_MIN_CONTRAST, `${brand} ${mode}: ${ratio.toFixed(2)}`);
      }
    }
  });
});

describe("useColorMode", () => {
  function Probe({ scheme }: { scheme?: "inherit" | "system" }) {
    return <span>{useColorMode(scheme) ?? "none"}</span>;
  }

  it("sets nothing on the server, in both schemes", () => {
    assert.match(renderToString(<Probe />), />none</);
    assert.match(renderToString(<Probe scheme="system" />), />none</);
  });
});
