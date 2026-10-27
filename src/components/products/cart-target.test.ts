import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planCartTarget } from "./cart-target.ts";

const defaultHost = "https://bitsnap.pl";

describe("planCartTarget", () => {
  it("fills in the project and host of a page that has none yet", () => {
    assert.deepEqual(
      planCartTarget(
        { projectID: null, host: defaultHost, defaultHost },
        { projectID: "p1", host: "https://shop.example" },
      ),
      { ok: true, setProjectID: "p1", setHost: "https://shop.example" },
    );
  });

  it("changes nothing when the page already matches", () => {
    assert.deepEqual(
      planCartTarget(
        { projectID: "p1", host: "https://shop.example", defaultHost },
        { projectID: "p1", host: "https://shop.example" },
      ),
      { ok: true, setProjectID: null, setHost: null },
    );
  });

  it("keeps the current host when the target has none", () => {
    assert.deepEqual(
      planCartTarget(
        { projectID: "p1", host: "https://shop.example", defaultHost },
        { projectID: "p1", host: "" },
      ),
      { ok: true, setProjectID: null, setHost: null },
    );
  });

  it("refuses another project", () => {
    const plan = planCartTarget(
      { projectID: "p2", host: defaultHost, defaultHost },
      { projectID: "p1" },
    );
    assert.equal(plan.ok, false);
  });

  it("does not set the project when the host conflicts", () => {
    const plan = planCartTarget(
      { projectID: null, host: "https://other.example", defaultHost },
      { projectID: "p1", host: "https://shop.example" },
    );
    assert.equal(plan.ok, false);
    assert.equal("setProjectID" in plan, false);
  });

  it("does not set the host when the project conflicts", () => {
    const plan = planCartTarget(
      { projectID: "p2", host: defaultHost, defaultHost },
      { projectID: "p1", host: "https://shop.example" },
    );
    assert.equal(plan.ok, false);
    assert.equal("setHost" in plan, false);
  });

  it("treats hosts that differ only by trailing slashes as equal", () => {
    assert.deepEqual(
      planCartTarget(
        { projectID: "p1", host: "https://shop.example/", defaultHost },
        { projectID: "p1", host: "https://shop.example" },
      ),
      { ok: true, setProjectID: null, setHost: null },
    );
    assert.deepEqual(
      planCartTarget(
        { projectID: "p1", host: "https://shop.example", defaultHost },
        { projectID: "p1", host: "https://shop.example//" },
      ),
      { ok: true, setProjectID: null, setHost: null },
    );
  });

  it("recognises the default host written with a trailing slash", () => {
    assert.deepEqual(
      planCartTarget(
        { projectID: "p1", host: "https://bitsnap.pl/", defaultHost },
        { projectID: "p1", host: "https://shop.example/" },
      ),
      { ok: true, setProjectID: null, setHost: "https://shop.example" },
    );
  });
});
