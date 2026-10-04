import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Environment } from "@/src/gen/proto/common/v1/environment_pb";
import {
  mapLegacyTexts,
  resolveBrandAppearance,
  resolvePagedArguments,
  resolveReturnsEnvironment,
} from "./legacy";

describe("resolveReturnsEnvironment", () => {
  it("accepts strings and the proto enum", () => {
    assert.equal(resolveReturnsEnvironment("test"), Environment.TEST);
    assert.equal(resolveReturnsEnvironment(Environment.TEST), Environment.TEST);
    assert.equal(resolveReturnsEnvironment("production"), Environment.PRODUCTION);
    assert.equal(
      resolveReturnsEnvironment(Environment.PRODUCTION),
      Environment.PRODUCTION,
    );
  });

  it("defaults to production", () => {
    assert.equal(resolveReturnsEnvironment(undefined), Environment.PRODUCTION);
  });
});

describe("mapLegacyTexts", () => {
  it("returns undefined without texts", () => {
    assert.equal(mapLegacyTexts(undefined), undefined);
  });

  it("maps every 1.6.0 key", () => {
    assert.deepEqual(
      mapLegacyTexts({
        title: "t",
        email: "e",
        sendCode: "s",
        code: "c",
        verify: "v",
        orders: "o",
        submit: "u",
        note: "n",
        loading: "l",
        history: "h",
      }),
      {
        emailStepTitle: "t",
        emailLabel: "e",
        emailSubmit: "s",
        codeLabel: "c",
        codeSubmit: "v",
        ordersTitle: "o",
        confirmationSubmit: "u",
        noteLabel: "n",
        loading: "l",
        myReturnsTitle: "h",
        myReturnsLink: "h",
      },
    );
  });

  it("keeps our keys and lets them win over legacy keys", () => {
    assert.deepEqual(
      mapLegacyTexts({ title: "legacy", emailStepTitle: "ours", back: "Back" }),
      { emailStepTitle: "ours", back: "Back" },
    );
    assert.deepEqual(
      mapLegacyTexts({ history: "h", myReturnsLink: "link" }),
      { myReturnsTitle: "h", myReturnsLink: "link" },
    );
  });
});

describe("resolveBrandAppearance", () => {
  it("derives button and focus tokens with a readable foreground", () => {
    assert.deepEqual(resolveBrandAppearance(undefined, { brandColor: "#111827" }), {
      tokens: {
        buttonBackground: "#111827",
        focusRing: "#111827",
        buttonForeground: "#ffffff",
      },
    });
    assert.equal(
      resolveBrandAppearance(undefined, { brandColor: "#facc15" })?.tokens
        ?.buttonForeground,
      "#18181b",
    );
  });

  it("lets explicit appearance tokens win and keeps the rest", () => {
    assert.deepEqual(
      resolveBrandAppearance(
        { theme: "dark", tokens: { buttonBackground: "#ff0000" } },
        { brandColor: "#111827" },
      ),
      {
        theme: "dark",
        tokens: {
          buttonBackground: "#ff0000",
          focusRing: "#111827",
          buttonForeground: "#ffffff",
        },
      },
    );
  });

  it("returns the appearance untouched without a brand color", () => {
    const appearance = { theme: "light" as const };
    assert.equal(resolveBrandAppearance(appearance, undefined), appearance);
    assert.equal(resolveBrandAppearance(appearance, { brandColor: " " }), appearance);
    assert.equal(resolveBrandAppearance(undefined, {}), undefined);
  });

  it("omits the foreground for colors it cannot parse", () => {
    assert.deepEqual(resolveBrandAppearance(undefined, { brandColor: "tomato" }), {
      tokens: { buttonBackground: "tomato", focusRing: "tomato" },
    });
  });
});

describe("resolvePagedArguments", () => {
  it("handles the object form", () => {
    assert.deepEqual(resolvePagedArguments({ pageSize: 5 }, undefined), {
      pageSize: 5,
      explicitPageToken: undefined,
    });
    assert.deepEqual(resolvePagedArguments({}, undefined), {
      pageSize: 20,
      explicitPageToken: undefined,
    });
  });

  it("handles the positional 1.6.0 form with an explicit token", () => {
    assert.deepEqual(resolvePagedArguments(20, ""), {
      pageSize: 20,
      explicitPageToken: "",
    });
    assert.deepEqual(resolvePagedArguments(undefined, "abc"), {
      pageSize: 20,
      explicitPageToken: "abc",
    });
    assert.deepEqual(resolvePagedArguments(7, undefined), {
      pageSize: 7,
      explicitPageToken: "",
    });
  });

  it("defaults to 20 items without arguments, like 1.6.0", () => {
    assert.deepEqual(resolvePagedArguments(undefined, undefined), {
      pageSize: 20,
      explicitPageToken: undefined,
    });
  });
});
