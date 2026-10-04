const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToString } = require("react-dom/server");
const { BitsnapReturns, Environment } = require("../dist/index.js");
const legacy = require("../dist/returns.js");
const { BitsnapModels } = require("../dist/models.js");

test("React SDK pricing schema preserves reference and version fields", () => {
  const pricing = {
    regularPrice: 10000,
    effectivePrice: 8000,
    currency: "PLN",
    discount: { id: "sale", type: "PERCENTAGE", value: 2000, status: "ACTIVE" },
    referencePrice: {
      amount: 9000,
      windowDays: 30,
      asOf: 1_800_000_000,
      basis: "observed-history",
      historyAvailable: true,
    },
    priceVersion: "variant-1:sale:v2",
  };
  assert.deepEqual(
    JSON.parse(JSON.stringify(BitsnapModels.ProductPricingSchema.parse(pricing))),
    pricing,
  );
});

test("1.6.0 returns widget renders on the server without browser globals", () => {
  const html = renderToString(
    React.createElement(legacy.BitsnapReturns, {
      projectID: "project-a",
      host: "https://custom.example",
      environment: legacy.Environment.TEST,
      texts: { title: "Returns", email: "Email" },
    }),
  );

  assert.match(html, /Returns/);
  assert.match(html, /Email/);
});

test("returns widget accepts the 1.6.0 props and renders on the server", () => {
  const html = renderToString(
    React.createElement(BitsnapReturns, {
      projectID: "project-a",
      host: "https://custom.example",
      environment: Environment.TEST,
      texts: { title: "Returns", email: "Email" },
      theme: { brandColor: "#ff0000" },
    }),
  );

  assert.match(html, /data-bitsnap-returns="root"/);
  assert.match(html, /--bitsnap-returns-button-background:#ff0000/);
});
