import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import type { CourseDataSource } from "./types.ts";

const dom = new JSDOM("<!doctype html><div id=root></div>");
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.Element.prototype.scrollIntoView = () => {};

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let PanelCourse: typeof import("./PanelCourse.tsx").PanelCourse;
let sampleCourse: typeof import("./fixtures.ts").sampleCourse;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  PanelCourse = (await import("./PanelCourse.tsx")).PanelCourse;
  sampleCourse = (await import("./fixtures.ts")).sampleCourse;
});

// The data source of a course that is already loaded is never answered.
const dataSource = new Proxy(
  {},
  { get: () => () => new Promise(() => {}) },
) as CourseDataSource;

describe("panel course navigation", () => {
  it("shows the default item again when the controlled item id is cleared", async () => {
    const container = dom.window.document.getElementById("root")!;
    const root = createRoot(container);

    // Mimics the panel page: the item lives in the URL (`?item=`).
    function Page() {
      const [itemId, setItemId] = React.useState<string>();
      return (
        <>
          <button id="back" onClick={() => setItemId(undefined)} />
          <PanelCourse
            dataSource={dataSource}
            initialCourse={sampleCourse()}
            locale="en"
            itemId={itemId}
            onItemChange={setItemId}
          />
        </>
      );
    }

    const current = () =>
      container.querySelector("[aria-current]")?.getAttribute("data-item-id");
    const click = async (selector: string) => {
      await React.act(async () => {
        (container.querySelector(selector) as HTMLElement).click();
      });
    };

    await React.act(async () => {
      root.render(<Page />);
    });
    assert.equal(current(), "l2", "the resume item opens first");

    await click('[data-item-id="l1"]');
    assert.equal(current(), "l1");
    await click('[data-item-id="t1"]');
    assert.equal(current(), "t1");

    await click("#back");
    assert.equal(current(), "l2", "going back to the URL without an item");

    await React.act(async () => {
      root.unmount();
    });
  });
});
