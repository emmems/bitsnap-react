import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatEventDate } from "./event-date";
import { imageExtension, stubCacheKey, ticketStubUrl } from "./qr-cache";

/** Intl may put a narrow no-break space before "PM". */
const plain = (value: string | undefined) => value?.replace(/\s/g, " ");

// 2026-12-12 18:00 UTC = 19:00 in Warsaw (CET, UTC+1).
const DECEMBER = BigInt(Date.UTC(2026, 11, 12, 18, 0) / 1000);
// 2026-07-04 17:30 UTC = 19:30 in Warsaw (CEST, UTC+2).
const JULY = BigInt(Date.UTC(2026, 6, 4, 17, 30) / 1000);

describe("formatEventDate", () => {
  it("formats in the panel's locale and the Warsaw time zone", () => {
    assert.equal(formatEventDate(DECEMBER, "pl-PL")?.label, "12 grudnia 2026, 19:00");
    assert.equal(formatEventDate(JULY, "pl-PL")?.label, "4 lipca 2026, 19:30");
    assert.equal(plain(formatEventDate(DECEMBER, "en-US")?.label), "December 12, 2026, 7:00 PM");
    assert.equal(formatEventDate(DECEMBER, "pl-PL")?.iso, "2026-12-12T18:00:00.000Z");
  });

  it("gives nothing when the ticket has no date", () => {
    assert.equal(formatEventDate(undefined, "pl-PL"), undefined);
    assert.equal(formatEventDate(0n, "pl-PL"), undefined);
    assert.equal(formatEventDate(-5n, "pl-PL"), undefined);
  });

  it("falls back to Polish for a locale Intl rejects", () => {
    assert.equal(formatEventDate(DECEMBER, "not_a_locale!")?.label, "12 grudnia 2026, 19:00");
  });

  it("uses Polish for any non-English locale, like the panel texts", () => {
    assert.equal(formatEventDate(DECEMBER, "xx-YY")?.label, "12 grudnia 2026, 19:00");
    assert.equal(formatEventDate(DECEMBER, "de-DE")?.label, "12 grudnia 2026, 19:00");
    assert.equal(plain(formatEventDate(DECEMBER, "en-GB")?.label), "December 12, 2026, 7:00 PM");
  });
});

describe("ticketStubUrl", () => {
  const tile = "https://bitsnap.pl/api/qr-gen?token=abc";

  it("uses the server's stub URL when it is https", () => {
    assert.equal(
      ticketStubUrl({ ticketStubUrl: "https://cdn.test/stub.png", ticketUrl: tile }),
      "https://cdn.test/stub.png",
    );
    assert.equal(ticketStubUrl({ ticketStubUrl: "javascript:alert(1)", ticketUrl: tile }), undefined);
  });

  it("falls back to the tile URL with layout=stub on an older server", () => {
    assert.equal(ticketStubUrl({ ticketStubUrl: "", ticketUrl: tile }), `${tile}&layout=stub`);
    assert.equal(
      ticketStubUrl({ ticketUrl: "https://bitsnap.pl/api/qr-gen?token=abc&layout=tile" }),
      "https://bitsnap.pl/api/qr-gen?token=abc&layout=stub",
    );
  });

  it("refuses a fallback that is not https", () => {
    assert.equal(ticketStubUrl({ ticketUrl: "http://bitsnap.pl/api/qr-gen?token=abc" }), undefined);
    assert.equal(ticketStubUrl({ ticketUrl: "data:image/png;base64,iVBORw0KGgo=" }), undefined);
    assert.equal(ticketStubUrl({ ticketUrl: "javascript:alert(1)" }), undefined);
    assert.equal(ticketStubUrl({ ticketUrl: "" }), undefined);
    assert.equal(ticketStubUrl({}), undefined);
  });

  it("keeps the stub under its own cache key", () => {
    assert.equal(stubCacheKey("acc-1"), "acc-1:stub");
  });
});

describe("imageExtension", () => {
  it("names the saved file after the data URL's image type", () => {
    assert.equal(imageExtension("data:image/png;base64,AA=="), "png");
    assert.equal(imageExtension("data:image/jpeg;base64,AA=="), "jpg");
    assert.equal(imageExtension("data:image/JPG;base64,AA=="), "jpg");
    assert.equal(imageExtension("data:image/gif;base64,AA=="), "gif");
    assert.equal(imageExtension("data:image/webp;base64,AA=="), "webp");
  });

  it("falls back to png for a URL or an unknown type", () => {
    assert.equal(imageExtension("https://qr.test/stub?layout=stub"), "png");
    assert.equal(imageExtension("data:image/avif;base64,AA=="), "png");
  });
});
