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
    assert.equal(parseBuyError("x".repeat(301)).message, undefined);
    assert.equal(parseBuyError("x".repeat(300)).message, "x".repeat(300));
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

  it("picks the type from the status and carries the message", () => {
    assert.deepEqual(buyErrorFromResponse(400, json({ code: "price-changed", error: "m" })), {
      ERR: true,
      error: "price-changed",
      type: "badInput",
      data: { message: "m" },
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
      "Cena produktu się zmieniła — odśwież stronę.",
    );
  });

  it("falls back to the server message, then to the generic text", () => {
    for (const code of ["invalid-request", "product-not-found", "internal", "internal-error", "toString"]) {
      assert.equal(buyErrorText({ error: code, data: { message: "Powód" } }, get("pl")), "Powód");
      assert.equal(buyErrorText({ error: code, data: { message: undefined } }, get("pl")), CHECKOUT_TEXT_TABLES.pl.checkoutFailed);
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
