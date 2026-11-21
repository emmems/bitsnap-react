import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { setupReactPage, teardownReactPage } from "@/src/analytics/react-testing";
import type { CheckoutAppearance } from "./appearance";

/*
 * The country picker is a native `<select>` inside the panel since 1.32.0
 * (PLAN D4). It replaced the Radix select whose list was portalled to <body>
 * (it opened behind the drawer in 1.29.1, and a portal breaks the dialog's
 * focus trap, scroll lock and Esc). This pins the control: in place, named,
 * `countryTrigger` styling, the placeholder option, and the no-op slots.
 */

const page = setupReactPage();

let React: typeof import("react");
let createRoot: typeof import("react-dom/client").createRoot;
let CountrySelector: typeof import("./CountrySelector.tsx").default;
let CheckoutAppearanceProvider: typeof import("./appearance.context.tsx").CheckoutAppearanceProvider;
let CheckoutTextsProvider: typeof import("./texts.context.tsx").CheckoutTextsProvider;

before(async () => {
  React = await import("react");
  createRoot = (await import("react-dom/client")).createRoot;
  CountrySelector = (await import("./CountrySelector.tsx")).default;
  ({ CheckoutAppearanceProvider } = await import("./appearance.context.tsx"));
  ({ CheckoutTextsProvider } = await import("./texts.context.tsx"));
});

const roots: Array<{ unmount: () => void }> = [];

afterEach(async () => {
  await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
  page.win.document.body.innerHTML = "";
});

after(() => teardownReactPage());

const countries = [
  { name: "Poland", code: "PL" },
  { name: "Germany", code: "DE" },
];

async function render(
  props: { selectedValue?: string; appearance?: CheckoutAppearance; onChange?: (code: string) => void } = {},
) {
  const doc = page.win.document;
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await React.act(async () => {
    root.render(
      <CheckoutTextsProvider locale="en-US">
        <CheckoutAppearanceProvider appearance={props.appearance}>
          <label htmlFor="country">Country</label>
          <CountrySelector
            id="country"
            onChange={props.onChange ?? (() => {})}
            selectedValue={props.selectedValue ?? "PL"}
            countries={countries}
            describedBy="hint"
          />
        </CheckoutAppearanceProvider>
      </CheckoutTextsProvider>,
    );
  });
  const select = container.querySelector("select");
  assert.ok(select, "a native select renders");
  return { container, select };
}

describe("country select (D4)", () => {
  it("renders in place, with no portal, named by its label", async () => {
    const { container, select } = await render();
    assert.equal(page.win.document.body.children.length, 1, "nothing is portalled to <body>");
    assert.ok(container.contains(select));
    assert.equal(select.id, "country");
    assert.equal(select.labels?.[0]?.textContent, "Country");
    assert.equal(select.getAttribute("data-bitsnap-checkout-slot"), "countryTrigger");
    assert.equal(select.className, "bsc-select");
    assert.equal(select.getAttribute("aria-describedby"), "hint");
    assert.deepEqual(
      Array.from(select.options).map((option) => [option.value, option.textContent]),
      [
        ["PL", "Poland"],
        ["DE", "Germany"],
      ],
    );
    assert.equal(select.value, "PL");
    assert.equal(container.querySelector("img"), null, "no external flag images (F-14)");
  });

  it("calls onChange with the chosen code", async () => {
    const chosen: string[] = [];
    const { select } = await render({ onChange: (code) => chosen.push(code) });
    await React.act(async () => {
      select.value = "DE";
      select.dispatchEvent(new page.win.Event("change", { bubbles: true }));
    });
    assert.deepEqual(chosen, ["DE"]);
  });

  it("shows a disabled placeholder while no country, or one the shop does not ship to, is chosen", async () => {
    for (const selectedValue of ["", "US"]) {
      const { select } = await render({ selectedValue });
      const first = select.options[0];
      assert.equal(first.value, "");
      assert.equal(first.textContent, "Choose a country");
      assert.equal(first.disabled, true);
      assert.equal(select.value, "");
      await React.act(async () => roots.splice(0).forEach((root) => root.unmount()));
      page.win.document.body.innerHTML = "";
    }
  });

  it("puts countryTrigger on the select; countryDropdown, countrySearch and countryOption do nothing", async () => {
    const { container, select } = await render({
      appearance: {
        elements: {
          countryTrigger: { className: "my-select", style: { width: "50%" } },
          countryDropdown: { className: "my-dropdown", style: { zIndex: 5 } },
          countrySearch: { className: "my-search" },
          countryOption: { className: "my-option" },
        },
      },
    });
    assert.equal(select.className, "bsc-select my-select");
    assert.equal(select.style.width, "50%");
    for (const name of ["my-dropdown", "my-search", "my-option"]) {
      assert.equal(container.querySelector(`.${name}`), null, `${name} renders nothing`);
    }
  });
});

describe("localCountryNames fallbacks", () => {
  const server = [
    { name: "Poland (server)", code: "PL" },
    { name: "Nowhere (server)", code: "ZZ" },
  ];

  it("names known codes in the locale and keeps the server's name for an unknown code", async () => {
    const { localCountryNames } = await import("./CountrySelector.tsx");
    const names = localCountryNames(server, "pl-PL");
    assert.equal(names[0]!.name, new Intl.DisplayNames(["pl-PL"], { type: "region" }).of("PL"));
    assert.notEqual(names[0]!.name, "Poland (server)");
    assert.deepEqual(names[1], { name: "Nowhere (server)", code: "ZZ" }, "ZZ is not a region: server name");
  });

  it("keeps every server name for a malformed locale (pl_PL)", async () => {
    const { localCountryNames } = await import("./CountrySelector.tsx");
    assert.deepEqual(localCountryNames(server, "pl_PL"), server);
  });

  it("keeps every server name when the runtime has no Intl.DisplayNames", async () => {
    const { localCountryNames } = await import("./CountrySelector.tsx");
    const intl = Intl as { DisplayNames?: typeof Intl.DisplayNames };
    const original = intl.DisplayNames;
    delete intl.DisplayNames;
    try {
      assert.deepEqual(localCountryNames(server, "pl-PL"), server);
    } finally {
      intl.DisplayNames = original;
    }
  });
});
