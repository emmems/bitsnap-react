import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accentVars } from "./accent.ts";

describe("accentVars", () => {
  it("sets nothing without a brand color", () => {
    assert.deepEqual(accentVars(undefined), {});
    assert.deepEqual(accentVars({}), {});
  });

  it("derives readable foregrounds and mirrors the brand for dark mode", () => {
    assert.deepEqual(accentVars({ brand: "#ffffff" }), {
      "--course-accent": "#ffffff",
      "--course-accent-fg": "#18181b",
      "--course-accent-dark": "#ffffff",
      "--course-accent-dark-fg": "#18181b",
    });
  });

  it("uses brandDark for dark mode", () => {
    const vars = accentVars({ brand: "#000000", brandDark: "#ffffff" }) as Record<
      string,
      string
    >;
    assert.equal(vars["--course-accent-fg"], "#ffffff");
    assert.equal(vars["--course-accent-dark"], "#ffffff");
    assert.equal(vars["--course-accent-dark-fg"], "#18181b");
  });

  it("leaves the foreground out for colors it cannot parse", () => {
    const vars = accentVars({ brand: "hotpink" }) as Record<string, string>;
    assert.equal(vars["--course-accent"], "hotpink");
    assert.equal("--course-accent-fg" in vars, false);
  });
});
