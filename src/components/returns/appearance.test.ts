import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getReturnsSlotAppearance,
  RETURNS_SLOT_NAMES,
  RETURNS_THEME_PRESETS,
  RETURNS_TOKEN_VARIABLES,
  resolveReturnsAppearance,
} from "./appearance.ts";

describe("resolveReturnsAppearance", () => {
  it("defaults to the complete light preset", () => {
    const resolved = resolveReturnsAppearance();

    assert.equal(resolved.theme, "light");
    assert.equal(resolved.boundaryClassName, "light");
    assert.deepEqual(resolved.tokens, RETURNS_THEME_PRESETS.light);
    assert.equal(
      (resolved.boundaryStyle as Record<string, string>)[
        "--bitsnap-returns-background"
      ],
      "#ffffff",
    );
  });

  it("ships complete presets with a variable for every color token", () => {
    for (const theme of ["light", "dark"] as const) {
      const preset = RETURNS_THEME_PRESETS[theme] as Record<string, string>;
      for (const token of Object.keys(RETURNS_TOKEN_VARIABLES)) {
        if (token === "fontFamily" || token === "fontSize") {
          continue;
        }
        assert.ok(preset[token], `${theme} preset is missing ${token}`);
      }
    }
    assert.notEqual(
      RETURNS_THEME_PRESETS.dark.background,
      RETURNS_THEME_PRESETS.light.background,
    );
  });

  it("applies the dark preset and marks the boundary", () => {
    const resolved = resolveReturnsAppearance({ theme: "dark" });

    assert.equal(resolved.theme, "dark");
    assert.equal(resolved.boundaryClassName, "dark");
    assert.equal(resolved.tokens.background, RETURNS_THEME_PRESETS.dark.background);
  });

  it("lets partial tokens override the preset and keeps the rest", () => {
    const resolved = resolveReturnsAppearance({
      theme: "dark",
      tokens: { buttonBackground: "#635bff", success: "#0a0" },
    });
    const style = resolved.boundaryStyle as Record<string, string>;

    assert.equal(style["--bitsnap-returns-button-background"], "#635bff");
    assert.equal(style["--bitsnap-returns-success"], "#0a0");
    assert.equal(style["--bitsnap-returns-radius"], "8px");
    assert.equal(
      style["--bitsnap-returns-foreground"],
      RETURNS_THEME_PRESETS.dark.foreground,
    );
  });

  it("remaps the shared primitive variables onto the tokens", () => {
    const style = resolveReturnsAppearance({
      tokens: { buttonBackground: "#635bff", focusRing: "#111111" },
    }).boundaryStyle as Record<string, string>;

    assert.equal(style["--primary"], "#635bff");
    assert.equal(style["--ring"], "#111111");
  });

  it("does not know checkout only tokens", () => {
    assert.equal("overlay" in RETURNS_TOKEN_VARIABLES, false);
  });
});

describe("returns slots", () => {
  it("exposes the planned slot list without lineImage", () => {
    assert.equal(RETURNS_SLOT_NAMES.length, 41);
    assert.equal(new Set(RETURNS_SLOT_NAMES).size, RETURNS_SLOT_NAMES.length);
    assert.ok(!(RETURNS_SLOT_NAMES as readonly string[]).includes("lineImage"));
    for (const slot of ["root", "statusBadge", "returnInstructions", "noteInput"]) {
      assert.ok((RETURNS_SLOT_NAMES as readonly string[]).includes(slot));
    }
  });

  it("looks up caller overrides per slot", () => {
    const resolved = resolveReturnsAppearance({
      elements: {
        title: { className: "serif", style: { fontSize: "30px" } },
      },
    });

    assert.deepEqual(getReturnsSlotAppearance(resolved, "title"), {
      className: "serif",
      style: { fontSize: "30px" },
    });
    assert.equal(getReturnsSlotAppearance(resolved, "line"), undefined);
  });
});
