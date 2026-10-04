import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  initialReturnsStep,
  reduceReturnsStep,
  returnsStepNumber,
  stepRequiresSession,
  type ReturnsStep,
  type ReturnsStepEvent,
} from "./state-machine.ts";

function run(start: ReturnsStep, ...events: ReturnsStepEvent[]): ReturnsStep {
  return events.reduce(reduceReturnsStep, start);
}

describe("returns step machine", () => {
  it("starts at the orders only when a session exists", () => {
    assert.deepEqual(initialReturnsStep(false), { name: "email" });
    assert.deepEqual(initialReturnsStep(true), { name: "orders" });
  });

  it("walks the whole flow from email to result", () => {
    const items = [{ lineId: "l1", quantity: 2 }];
    const step = run(
      { name: "email" },
      { type: "CODE_SENT" },
      { type: "AUTHENTICATED" },
      { type: "SELECT_ORDER", orderId: "o1" },
      { type: "REVIEW", items, note: "damaged" },
      { type: "SUBMITTED", returnId: "r1" },
    );

    assert.deepEqual(step, { name: "result", returnId: "r1" });
    assert.deepEqual(reduceReturnsStep(step, { type: "CONTINUE" }), { name: "orders" });
  });

  it("goes to the orders when a panel token session or stored session appears", () => {
    assert.deepEqual(
      reduceReturnsStep({ name: "email" }, { type: "AUTHENTICATED" }),
      { name: "orders" },
    );
  });

  it("does not move a customer who is mid-flow when the session is re-announced", () => {
    const step: ReturnsStep = { name: "order", orderId: "o1" };

    assert.equal(reduceReturnsStep(step, { type: "AUTHENTICATED" }), step);
  });

  it("returns to the start on SESSION_EXPIRED from every step that needs a session", () => {
    const steps: ReturnsStep[] = [
      { name: "orders" },
      { name: "order", orderId: "o1" },
      { name: "confirmation", orderId: "o1", items: [], note: "" },
      { name: "result", returnId: "r1" },
      { name: "myReturns" },
      { name: "myReturn", returnId: "r1" },
    ];

    for (const step of steps) {
      assert.deepEqual(reduceReturnsStep(step, { type: "SESSION_EXPIRED" }), {
        name: "email",
      });
    }
  });

  it("keeps a pending verification when the session is reported missing", () => {
    const step: ReturnsStep = { name: "code" };

    assert.equal(reduceReturnsStep(step, { type: "SESSION_EXPIRED" }), step);
  });

  it("restores the selection when going back from the confirmation", () => {
    const items = [{ lineId: "l1", quantity: 1 }];
    const step = run(
      { name: "order", orderId: "o1" },
      { type: "REVIEW", items, note: "n" },
      { type: "BACK" },
    );

    assert.deepEqual(step, { name: "order", orderId: "o1", items, note: "n" });
  });

  it("navigates back and to my returns", () => {
    assert.deepEqual(run({ name: "code" }, { type: "BACK" }), { name: "email" });
    assert.deepEqual(
      run({ name: "orders" }, { type: "OPEN_MY_RETURNS" }, { type: "SELECT_RETURN", returnId: "r1" }),
      { name: "myReturn", returnId: "r1" },
    );
    assert.deepEqual(run({ name: "myReturn", returnId: "r1" }, { type: "BACK" }), {
      name: "myReturns",
    });
    assert.deepEqual(run({ name: "myReturns" }, { type: "BACK" }), { name: "orders" });
  });

  it("ignores events that do not apply to the current step", () => {
    const step: ReturnsStep = { name: "email" };

    assert.equal(reduceReturnsStep(step, { type: "SELECT_ORDER", orderId: "o" }), step);
    assert.equal(reduceReturnsStep(step, { type: "SUBMITTED", returnId: "r" }), step);
    assert.equal(reduceReturnsStep(step, { type: "BACK" }), step);
  });

  it("describes which steps need a session and their position", () => {
    assert.equal(stepRequiresSession("email"), false);
    assert.equal(stepRequiresSession("code"), false);
    assert.equal(stepRequiresSession("orders"), true);
    assert.equal(returnsStepNumber("email"), 1);
    assert.equal(returnsStepNumber("result"), 6);
    assert.equal(returnsStepNumber("myReturns"), undefined);
  });
});
