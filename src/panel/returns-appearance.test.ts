import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readableForeground,
  resolvePanelReturnsAppearance,
} from "./returns-appearance";

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
  it("derives button and focus tokens from the brand color", () => {
    assert.deepEqual(resolvePanelReturnsAppearance(undefined, "#635bff"), {
      tokens: {
        buttonBackground: "#635bff",
        focusRing: "#635bff",
        buttonForeground: "#ffffff",
      },
    });
  });

  it("omits the foreground when it cannot be computed", () => {
    assert.deepEqual(resolvePanelReturnsAppearance(undefined, "tomato"), {
      tokens: { buttonBackground: "tomato", focusRing: "tomato" },
    });
  });

  it("keeps an explicit appearance untouched", () => {
    const explicit = { theme: "dark" } as const;
    assert.equal(resolvePanelReturnsAppearance(explicit, "#635bff"), explicit);
  });

  it("falls back to the library defaults without a brand", () => {
    assert.equal(resolvePanelReturnsAppearance(undefined, undefined), undefined);
    assert.equal(resolvePanelReturnsAppearance(undefined, "  "), undefined);
  });
});
