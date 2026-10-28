import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contrastRatio, onColor } from "./contrast.ts";
import { PALETTE } from "./styles.ts";

describe("consent colors", () => {
  for (const theme of ["light", "dark"] as const) {
    const p = PALETTE[theme];
    it(`meets WCAG AA in the ${theme} theme`, () => {
      // text: 4.5:1
      for (const [fg, bg] of [
        [p.fg, p.bg],
        [p.muted, p.bg],
        [p.link, p.bg],
        [p.onAccent, p.accent],
      ]) {
        assert.ok(contrastRatio(fg, bg) >= 4.5, `${fg} on ${bg} = ${contrastRatio(fg, bg).toFixed(2)}`);
      }
      // controls, borders of the toggle, focus ring: 3:1
      for (const [fg, bg] of [
        [p.accent, p.bg],
        [p.off, p.bg],
        [p.thumb, p.off],
        [p.onAccent, p.accent],
      ]) {
        assert.ok(contrastRatio(fg, bg) >= 3, `${fg} on ${bg} = ${contrastRatio(fg, bg).toFixed(2)}`);
      }
    });
  }

  it("picks a readable text color for a custom accent", () => {
    assert.equal(onColor("#ffeb3b"), "#111111");
    assert.equal(onColor("#1d4ed8"), "#ffffff");
    assert.equal(onColor("#000"), "#ffffff");
  });
});
