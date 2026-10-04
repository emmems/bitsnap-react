import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Environment } from "../../gen/proto/common/v1/environment_pb.ts";
import { toReturnsProviderProps } from "./legacy.ts";

describe("1.6.0 BitsnapReturns props", () => {
  it("maps the Environment enum and the string form", () => {
    assert.equal(toReturnsProviderProps({ projectID: "p", environment: Environment.TEST }).environment, "test");
    assert.equal(toReturnsProviderProps({ projectID: "p", environment: Environment.PRODUCTION }).environment, "production");
    assert.equal(toReturnsProviderProps({ projectID: "p", environment: "test" }).environment, "test");
    assert.equal(toReturnsProviderProps({ projectID: "p" }).environment, "production");
  });

  it("maps old text keys, and current keys win over them", () => {
    const { texts } = toReturnsProviderProps({
      projectID: "p",
      texts: { title: "Old title", email: "Email", emailStepTitle: "New title", ordersEmpty: "None" },
    });
    assert.deepEqual(texts, { emailStepTitle: "New title", emailLabel: "Email", ordersEmpty: "None" });
  });

  it("turns theme.brandColor into button tokens unless appearance is set", () => {
    const fromTheme = toReturnsProviderProps({ projectID: "p", theme: { brandColor: "#ff0000" } });
    assert.equal(fromTheme.appearance?.tokens?.buttonBackground, "#ff0000");
    const explicit = { theme: "dark" as const };
    assert.equal(toReturnsProviderProps({ projectID: "p", theme: { brandColor: "#ff0000" }, appearance: explicit }).appearance, explicit);
  });

  it("passes other props through", () => {
    const props = toReturnsProviderProps({ projectID: "p", host: "https://h", panelAccessToken: "t", className: "c" });
    assert.equal(props.host, "https://h");
    assert.equal(props.panelAccessToken, "t");
    assert.equal(props.className, "c");
    assert.equal("theme" in props, false);
  });
});
