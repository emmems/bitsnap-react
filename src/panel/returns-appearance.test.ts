import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readableForeground,
  resolvePanelReturnsAppearance,
} from "./returns-appearance";
import { RETURNS_THEME_PRESETS } from "../components/returns/appearance";

describe("readableForeground", () => {
  it("uses white on dark brands and dark text on light brands", () => {
    assert.equal(readableForeground("#000000"), "#ffffff");
    assert.equal(readableForeground("#635bff"), "#ffffff");
    assert.equal(readableForeground("#ffffff"), "#18181b");
    assert.equal(readableForeground("#facc15"), "#18181b");
  });

  it("accepts short hex, alpha hex and rgb()", () => {
    assert.equal(readableForeground("#000"), "#ffffff");
    assert.equal(readableForeground("#ffffffff"), "#18181b");
    assert.equal(readableForeground("rgb(0, 0, 0)"), "#ffffff");
    assert.equal(readableForeground("rgb(250 250 250)"), "#18181b");
  });

  it("returns undefined for unsupported values", () => {
    assert.equal(readableForeground("tomato"), undefined);
    assert.equal(readableForeground("rgb(300, 0, 0)"), undefined);
    assert.equal(readableForeground(""), undefined);
  });
});

describe("resolvePanelReturnsAppearance", () => {
  it("follows the panel tokens on a transparent background", () => {
    const appearance = resolvePanelReturnsAppearance(undefined);
    assert.equal(appearance.theme, undefined);
    assert.equal(appearance.tokens?.background, "transparent");
    assert.equal(appearance.tokens?.surface, "var(--panel-surface)");
    assert.equal(appearance.tokens?.buttonBackground, "var(--panel-accent-now)");
    assert.equal(appearance.tokens?.buttonForeground, "var(--panel-accent-fg-now)");
    assert.equal(appearance.tokens?.focusRing, "var(--panel-accent-text-now)");
  });

  it("overrides every colour token of both returns presets", () => {
    const tokens = resolvePanelReturnsAppearance(undefined).tokens ?? {};
    for (const theme of ["light", "dark"] as const) {
      for (const name of Object.keys(RETURNS_THEME_PRESETS[theme])) {
        if (name === "radius") continue;
        assert.ok(name in tokens, `${theme} preset token ${name} leaks through`);
      }
    }
  });

  it("passes the mode the panel set itself", () => {
    assert.equal(resolvePanelReturnsAppearance(undefined, "dark").theme, "dark");
    assert.equal(resolvePanelReturnsAppearance(undefined, "light").theme, "light");
  });

  it("keeps an explicit appearance untouched", () => {
    const explicit = { theme: "dark" } as const;
    assert.equal(resolvePanelReturnsAppearance(explicit, "light"), explicit);
  });
});
