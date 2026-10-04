import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getSlotAppearance,
  resolveAppearanceCore,
  type AppearanceCoreConfig,
} from "./appearance-core.ts";

type Token = "background" | "accent" | "radius";
type Theme = "dark" | "light";
type Slot = "root" | "title";

const config: AppearanceCoreConfig<Token, Theme> = {
  defaultTheme: "light",
  presets: {
    dark: { background: "#000000" },
    light: {},
  },
  variables: {
    background: "--acme-background",
    accent: "--acme-accent",
    radius: "--acme-radius",
  },
  shadcnVariables: [
    { token: "background", variable: "--background" },
    { token: "radius", variable: "--radius" },
  ],
};

const resolve = (
  appearance?: Parameters<typeof resolveAppearanceCore<Token, Theme, Slot>>[0],
) => resolveAppearanceCore<Token, Theme, Slot>(appearance, config);

describe("resolveAppearanceCore", () => {
  it("uses the configured default theme and writes nothing when omitted", () => {
    const resolved = resolve();

    assert.equal(resolved.theme, "light");
    assert.equal(resolved.isCustomized, false);
    assert.deepEqual(resolved.tokens, {});
    assert.deepEqual(resolved.boundaryStyle, {});
  });

  it("resolves tokens through the custom prefix and shadcn mapping", () => {
    const resolved = resolve({
      tokens: { accent: "#635bff", radius: "12px" },
    });

    assert.equal(resolved.isCustomized, true);
    assert.deepEqual(resolved.boundaryStyle, {
      "--acme-accent": "#635bff",
      "--acme-radius": "12px",
      "--radius": "12px",
    });
  });

  it("applies presets underneath caller tokens and drops undefined ones", () => {
    const resolved = resolve({
      theme: "dark",
      tokens: { background: undefined, accent: "red" },
    });

    assert.equal(resolved.theme, "dark");
    assert.deepEqual(resolved.tokens, { accent: "red" });

    const preset = resolve({ theme: "dark" });
    assert.equal(preset.isCustomized, true);
    assert.equal(
      (preset.boundaryStyle as Record<string, string>)["--background"],
      "#000000",
    );

    const overridden = resolve({
      theme: "dark",
      tokens: { background: "#111111" },
    });
    assert.equal(
      (overridden.boundaryStyle as Record<string, string>)[
        "--acme-background"
      ],
      "#111111",
    );
  });

  it("detects customization through slot overrides only when they carry values", () => {
    assert.equal(resolve({ elements: { root: {} } }).isCustomized, false);
    assert.equal(
      resolve({ elements: { root: { className: "x" } } }).isCustomized,
      true,
    );
  });
});

describe("getSlotAppearance", () => {
  it("returns the slot overrides or undefined", () => {
    const elements = { title: { className: "t" } };

    assert.deepEqual(getSlotAppearance<Slot>(elements, "title"), {
      className: "t",
    });
    assert.equal(getSlotAppearance<Slot>(elements, "root"), undefined);
  });
});
