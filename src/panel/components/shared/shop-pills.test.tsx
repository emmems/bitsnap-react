import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { setupReactPage } from "@/src/analytics/react-testing";
import type { ShopOption } from "../../shop-filter";

const page = setupReactPage("https://bitsnap.pl/panel");

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let ShopPills: typeof import("./ShopPills.tsx").ShopPills;
let ShopAvatar: typeof import("./ShopAvatar.tsx").ShopAvatar;
let ShopMark: typeof import("./ShopAvatar.tsx").ShopMark;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  ({ ShopPills } = await import("./ShopPills.tsx"));
  ({ ShopAvatar, ShopMark } = await import("./ShopAvatar.tsx"));
});

const roots: Array<{ unmount: () => void }> = [];

afterEach(async () => {
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
});

async function mount(node: React.ReactNode) {
  const container = page.win.document.createElement("div");
  page.win.document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => root.render(node));
  return container;
}

const SHOPS: ShopOption[] = [
  {
    projectId: "shopA",
    name: "Księgarnia Alfa",
    imageUrl: "https://cdn.test/alfa-light.png",
    imageDarkUrl: "https://cdn.test/alfa-dark.png",
    count: 3,
  },
  {
    projectId: "shopB",
    name: "Studio Beta",
    count: 2,
  },
];

describe("ShopPills", () => {
  it("hides itself when fewer than 2 shops exist", async () => {
    const zero = await mount(
      <ShopPills
        shops={[]}
        value={undefined}
        onChange={() => {}}
        label="Filtr sklepu"
        allLabel="Wszystkie"
      />,
    );
    assert.equal(zero.innerHTML, "");

    const one = await mount(
      <ShopPills
        shops={[SHOPS[0]!]}
        value={undefined}
        onChange={() => {}}
        label="Filtr sklepu"
        allLabel="Wszystkie"
      />,
    );
    assert.equal(one.innerHTML, "");
  });

  it("renders role='group', aria-pressed buttons in plain Tab order, and a polite live-region count", async () => {
    const picked: Array<string | undefined> = [];
    const container = await mount(
      <ShopPills
        shops={SHOPS}
        value="shopA"
        onChange={(id) => picked.push(id)}
        label="Filtr sklepu"
        allLabel="Wszystkie"
        allCount={5}
        countText="3 zamówienia"
      />,
    );

    const group = container.querySelector('[role="group"]');
    assert.ok(group, "uses role=group, not role=tablist");
    assert.equal(container.querySelector('[role="tablist"]'), null);
    assert.equal(group!.getAttribute("aria-label"), "Filtr sklepu");

    const buttons = [...group!.querySelectorAll<HTMLButtonElement>("button")];
    assert.equal(buttons.length, 3);
    assert.deepEqual(
      buttons.map((b) => b.getAttribute("aria-pressed")),
      ["false", "true", "false"],
    );
    // Plain Tab order: no roving tabindex (-1).
    for (const button of buttons) {
      assert.equal(button.type, "button");
      assert.equal(button.getAttribute("tabindex"), null);
      assert.match(button.className, /min-h-11/);
    }

    assert.match(buttons[0]!.textContent ?? "", /Wszystkie/);
    assert.match(buttons[1]!.textContent ?? "", /Księgarnia Alfa/);
    assert.match(buttons[2]!.textContent ?? "", /Studio Beta/);

    // Live-region count.
    const live = container.querySelector('[aria-live="polite"]');
    assert.equal(live?.textContent, "3 zamówienia");

    await React.act(async () => buttons[2]!.click());
    await React.act(async () => buttons[0]!.click());
    assert.deepEqual(picked, ["shopB", undefined]);
    assert.ok(group!.classList.contains("-ml-1"));
    assert.ok(group!.classList.contains("pl-1"));
    assert.ok(group!.classList.contains("scroll-pl-1"));
    assert.ok(group!.classList.contains("sm:ml-0"));
    assert.ok(group!.classList.contains("sm:pl-0"));
  });

  it("marks 'Wszystkie' as pressed when value is empty or does not match any shop", async () => {
    for (const value of ["", "unknown"]) {
      const container = await mount(
        <ShopPills
          shops={SHOPS}
          value={value}
          onChange={() => {}}
          label="Filtr sklepu"
          allLabel="Wszystkie"
        />,
      );
      const buttons = [...container.querySelectorAll<HTMLButtonElement>('[role="group"] button')];
      assert.deepEqual(
        buttons.map((b) => b.getAttribute("aria-pressed")),
        ["true", "false", "false"],
        `value=${JSON.stringify(value)}`,
      );
    }
  });

  it("scrolls a focused pill into view horizontally", async () => {
    const calls: unknown[] = [];
    const original = page.win.Element.prototype.scrollIntoView;
    page.win.Element.prototype.scrollIntoView = function (arg?: unknown) {
      calls.push(arg);
    };
    try {
      const container = await mount(
        <ShopPills
          shops={SHOPS}
          value={undefined}
          onChange={() => {}}
          label="Filtr sklepu"
          allLabel="Wszystkie"
        />,
      );
      const pill = container.querySelectorAll<HTMLButtonElement>("button")[1]!;
      await React.act(async () => pill.focus());
      assert.deepEqual(calls, [{ inline: "nearest", block: "nearest" }]);
    } finally {
      page.win.Element.prototype.scrollIntoView = original;
    }
  });
});

describe("ShopAvatar and ShopMark", () => {
  it("switches light/dark logos with alt='' and falls back to the initial when images break", async () => {
    const container = await mount(
      <ShopAvatar
        name="Alfa"
        imageUrl="https://cdn.test/light.png"
        imageDarkUrl="https://cdn.test/dark.png"
      />,
    );
    const imgs = [...container.querySelectorAll<HTMLImageElement>("img")];
    assert.equal(imgs.length, 2);
    assert.equal(imgs[0]!.getAttribute("alt"), "");
    assert.equal(imgs[1]!.getAttribute("alt"), "");

    // Light breaks -> falls back to dark image.
    await React.act(async () => {
      imgs[0]!.dispatchEvent(new page.win.Event("error"));
    });
    const afterOne = [...container.querySelectorAll<HTMLImageElement>("img")];
    assert.equal(afterOne.length, 1);
    assert.equal(afterOne[0]!.getAttribute("src"), "https://cdn.test/dark.png");

    // Dark breaks too -> falls back to initial.
    await React.act(async () => {
      afterOne[0]!.dispatchEvent(new page.win.Event("error"));
    });
    assert.equal(container.querySelector("img"), null);
    assert.equal(container.querySelector('[data-shop-avatar="initial"]')?.textContent, "A");
  });

  it("renders ShopMark with fallback name for deleted shops", async () => {
    const container = await mount(
      <ShopMark shop={{ name: "" }} fallbackName="Sklep" />,
    );
    assert.equal(container.querySelector('[data-shop-mark]')?.getAttribute("title"), "Sklep");
    assert.equal(container.querySelector('[data-shop-avatar="initial"]')?.textContent, "S");
    assert.match(container.textContent ?? "", /Sklep/);
  });
});
