const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToString } = require("react-dom/server");
const { PanelLogin, PanelProvider, setPanelConfig } = require("../dist/index.js");

const render = (props) =>
  renderToString(
    React.createElement(
      PanelProvider,
      { analytics: false },
      React.createElement(PanelLogin, props),
    ),
  );

test("PanelLogin renders a given shop logo inside the card, with alt text", () => {
  setPanelConfig({ projectID: undefined, host: undefined });
  const html = render({ logoUrl: "https://cdn.test/shop.png", locale: "en" });
  assert.match(html, /<img src="https:\/\/cdn\.test\/shop\.png" alt="Shop logo"/);
  assert.ok(html.indexOf("data-slot=\"card\"") < html.indexOf("<img"), "logo is in the card");
  assert.doesNotMatch(html, /Company Logo/);
  const polish = render({ logoUrl: "https://cdn.test/shop.png" });
  assert.match(polish, /alt="Logo sklepu"/);
});

test("PanelLogin without a project and logo renders the Bitsnap logo", () => {
  setPanelConfig({ projectID: undefined, host: undefined });
  const html = render({});
  assert.match(html, /role="img" aria-label="Bitsnap"/);
  assert.doesNotMatch(html, /<img/);
});

test("PanelLogin reserves the logo height while the shop branding loads", () => {
  setPanelConfig({ projectID: "project-a", host: "https://custom.example" });
  const html = render({});
  assert.match(html, /<div class="flex h-10 items-center px-4 sm:px-6" aria-hidden="true"><\/div>/);
  assert.doesNotMatch(html, /<img|aria-label="Bitsnap"/);
  setPanelConfig({ projectID: undefined, host: undefined });
});

test("PanelLogin hides the logo with showLogo={false}", () => {
  setPanelConfig({ projectID: "project-a", host: "https://custom.example" });
  const html = render({ showLogo: false, logoUrl: "https://cdn.test/shop.png" });
  assert.doesNotMatch(html, /<img|aria-label="Bitsnap"|flex h-10 items-center/);
  setPanelConfig({ projectID: undefined, host: undefined });
});
