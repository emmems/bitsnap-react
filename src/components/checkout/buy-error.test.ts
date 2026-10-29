import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buyErrorFromResponse,
  buyErrorText,
  buyErrorTextKey,
  parseBuyError,
} from "./buy-error.ts";
import { CHECKOUT_TEXT_TABLES, getCheckoutText } from "./texts.ts";

const json = (body: unknown) => JSON.stringify(body);

describe("parseBuyError", () => {
  it("reads the code and the message of the new JSON contract", () => {
    assert.deepEqual(
      parseBuyError(
        json({ success: false, code: "price-changed", error: "Cena się zmieniła." }),
      ),
      { code: "price-changed", message: "Cena się zmieniła." },
    );
  });

  it("returns the item ids", () => {
    assert.deepEqual(
      parseBuyError(
        json({ success: false, code: "product-not-available", error: "x", itemIds: ["a", "b"] }),
      ).itemIds,
      ["a", "b"],
    );
  });

  it("unwraps an error that is itself a JSON string", () => {
    assert.deepEqual(
      parseBuyError(json({ success: false, error: json({ message: "Brak bramki." }) })),
      { code: "internal-error", message: "Brak bramki." },
    );
  });

  it("keeps the old plain error message", () => {
    assert.deepEqual(
      parseBuyError(json({ error: "Failed to create payment session." })),
      { code: "internal-error", message: "Failed to create payment session." },
    );
  });

  it("uses a short plain text body", () => {
    assert.deepEqual(parseBuyError("  Bad gateway  "), {
      code: "internal-error",
      message: "Bad gateway",
    });
  });

  it("ignores HTML and long plain text", () => {
    assert.equal(parseBuyError("<!DOCTYPE html><html><body>502</body></html>").message, undefined);
    assert.equal(parseBuyError("<html>oops</html>").message, undefined);
    const long = "x ".repeat(99) + "xx";
    assert.equal(parseBuyError(long + "x").message, undefined);
    assert.equal(parseBuyError(long).message, long);
  });

  it("ignores bare proxy markup, multi-line text and stack traces", () => {
    for (const body of [
      "<h1>502 Bad Gateway</h1>",
      "Bad <b>gateway</b>",
      "Bad gateway\nretry later",
      "TypeError: x is undefined",
      json({ error: "Boom at\n    at run (file.js:1:1)" }),
    ]) {
      assert.equal(parseBuyError(body).message, undefined, body);
    }
  });

  it("ignores messages that look like codes", () => {
    for (const body of ["internal_error", "bad-gateway", "forbidden", json({ error: "no_payment_gateway" })]) {
      assert.equal(parseBuyError(body).message, undefined, body);
    }
    assert.equal(parseBuyError("Forbidden request").message, "Forbidden request");
  });

  it("rejects JSON scalars in a wrapped error", () => {
    for (const error of ["123", "null", "true", '"text here"', "[1]"]) {
      assert.deepEqual(parseBuyError(json({ error })), { code: "internal-error", message: undefined }, error);
    }
  });

  it("reads inner.error before inner.message and carries the inner code up", () => {
    assert.deepEqual(
      parseBuyError(json({ error: json({ error: "Brak bramki.", message: "Inne", code: "no-payment-gateway" }) })),
      { code: "no-payment-gateway", message: "Brak bramki." },
    );
    assert.deepEqual(
      parseBuyError(json({ code: "price-changed", error: json({ message: "Cena się zmieniła.", code: "other" }) })),
      { code: "price-changed", message: "Cena się zmieniła." },
    );
  });

  it("survives empty, null and non-object bodies", () => {
    for (const body of ["", "null", "123", "[]", "{}"]) {
      const parsed = parseBuyError(body);
      assert.equal(parsed.code, "internal-error", body);
      assert.equal(parsed.message, undefined, body);
    }
  });
});

describe("buyErrorFromResponse", () => {
  it("keeps item-ids-not-found with the ids as data", () => {
    const err = buyErrorFromResponse(
      400,
      json({ code: "product-not-available", error: "x", itemIds: ["a"] }),
    );
    assert.deepEqual(err, { ERR: true, error: "item-ids-not-found", type: "badInput", data: ["a"] });
  });

  it("keeps item-ids-not-found for product-not-found and for a missing code", () => {
    for (const body of [
      { code: "product-not-found", itemIds: ["a"] },
      { error: "x", itemIds: ["a"] },
    ]) {
      assert.deepEqual(buyErrorFromResponse(404, json(body)), {
        ERR: true,
        error: "item-ids-not-found",
        type: "badInput",
        data: ["a"],
      });
    }
  });

  it("keeps any other code and puts the ids in data", () => {
    assert.deepEqual(
      buyErrorFromResponse(400, json({ code: "price-changed", error: "Cena się zmieniła.", itemIds: ["a", "b"] })),
      { ERR: true, error: "price-changed", type: "badInput", data: { message: "Cena się zmieniła.", itemIds: ["a", "b"] } },
    );
    assert.deepEqual(buyErrorFromResponse(500, json({ code: "internal", itemIds: ["a"] })), {
      ERR: true,
      error: "internal",
      type: "internal",
      data: { message: undefined, itemIds: ["a"] },
    });
  });

  it("does not treat empty itemIds as unavailable products", () => {
    assert.deepEqual(buyErrorFromResponse(400, json({ code: "price-changed", itemIds: [] })), {
      ERR: true,
      error: "price-changed",
      type: "badInput",
      data: { message: undefined },
    });
  });

  it("picks the type from the status and carries the message", () => {
    assert.deepEqual(buyErrorFromResponse(400, json({ code: "price-changed", error: "Cena się zmieniła." })), {
      ERR: true,
      error: "price-changed",
      type: "badInput",
      data: { message: "Cena się zmieniła." },
    });
    const internal = buyErrorFromResponse(500, "");
    assert.equal(internal.error, "internal-error");
    assert.equal(internal.type, "internal");
    assert.deepEqual(internal.data, { message: undefined });
  });
});

describe("buyErrorText", () => {
  const get = (locale: string) => (key: Parameters<typeof getCheckoutText>[0]) =>
    getCheckoutText(key, locale);

  it("maps every shopper-facing code to its own text", () => {
    const codes = {
      "no-payment-gateway": "noPaymentGateway",
      "gateway-not-configured": "gatewayNotConfigured",
      "shipping-not-configured": "shippingNotConfigured",
      "mixed-recurring": "mixedRecurring",
      "currency-unsupported": "currencyUnsupported",
      "price-changed": "priceChanged",
    } as const;
    for (const [code, key] of Object.entries(codes)) {
      assert.equal(buyErrorTextKey(code), key);
      for (const locale of ["pl", "en"] as const) {
        assert.equal(
          buyErrorText({ error: code, data: { message: "server" } }, get(locale)),
          CHECKOUT_TEXT_TABLES[locale][key],
        );
      }
    }
    assert.equal(
      buyErrorText({ error: "price-changed" }, get("pl")),
      "Cena produktu się zmieniła. Odśwież stronę, aby zobaczyć aktualną cenę.",
    );
  });

  it("maps product-not-found to the unavailable products text", () => {
    assert.equal(
      buyErrorText({ error: "product-not-found", type: "badInput", data: { message: "x" } }, get("pl")),
      CHECKOUT_TEXT_TABLES.pl.unavailableProducts,
    );
  });

  it("shows the generic text for internal, invalid-request and 5xx", () => {
    const message = { message: "Powód" };
    for (const err of [
      { error: "internal", type: "badInput", data: message },
      { error: "internal-error", type: "internal", data: message },
      { error: "invalid-request", type: "badInput", data: message },
      { error: "some-business-code", type: "internal", data: message },
    ]) {
      assert.equal(buyErrorText(err, get("pl")), CHECKOUT_TEXT_TABLES.pl.checkoutFailed);
    }
  });

  it("falls back to the server message of a 4xx, then to the generic text", () => {
    for (const code of ["some-business-code", "internal-error", "toString"]) {
      assert.equal(buyErrorText({ error: code, type: "badInput", data: { message: "Powód" } }, get("pl")), "Powód");
      assert.equal(buyErrorText({ error: code, type: "badInput", data: { message: undefined } }, get("pl")), CHECKOUT_TEXT_TABLES.pl.checkoutFailed);
      assert.equal(buyErrorText({ error: code }, get("en")), CHECKOUT_TEXT_TABLES.en.checkoutFailed);
    }
  });

  it("respects merchant overrides", () => {
    const overrides = { priceChanged: "Zmiana ceny!", checkoutFailed: "Błąd" };
    const get = (key: Parameters<typeof getCheckoutText>[0]) => getCheckoutText(key, "pl", overrides);
    assert.equal(buyErrorText({ error: "price-changed" }, get), "Zmiana ceny!");
    assert.equal(buyErrorText({ error: "internal-error" }, get), "Błąd");
  });
});
