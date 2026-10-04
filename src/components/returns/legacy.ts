import { Environment } from "../../gen/proto/common/v1/environment_pb";
import { resolvePanelReturnsAppearance } from "../../panel/returns-appearance";
import type { ReturnsEnvironment, ReturnsProviderProps } from "./ReturnsProvider";
import type { ReturnsTexts } from "./texts";

/** Text keys of the 1.6.0 widget. */
export type LegacyReturnsTexts = {
  title: string;
  email: string;
  sendCode: string;
  code: string;
  verify: string;
  orders: string;
  submit: string;
  note: string;
  loading: string;
  history: string;
};

const LEGACY_TEXT_KEYS: Record<keyof LegacyReturnsTexts, keyof ReturnsTexts> = {
  title: "emailStepTitle",
  email: "emailLabel",
  sendCode: "emailSubmit",
  code: "codeLabel",
  verify: "codeSubmit",
  orders: "ordersTitle",
  submit: "confirmationSubmit",
  note: "noteLabel",
  loading: "loading",
  history: "myReturnsTitle",
};

/**
 * Props of `BitsnapReturns`. Besides the provider props it accepts the 1.6.0
 * props: the `Environment` enum, `theme.brandColor` and the old text keys.
 */
export type BitsnapReturnsProps = Omit<
  ReturnsProviderProps,
  "children" | "environment" | "texts"
> & {
  /** Backend environment, `"production"` unless set to `"test"`. */
  environment?: ReturnsEnvironment | Environment;
  /** Text overrides, applied whatever the locale. */
  texts?: Partial<ReturnsTexts> & Partial<LegacyReturnsTexts>;
  /** @deprecated Use `appearance.tokens` instead. */
  theme?: { brandColor?: string };
};

/** Maps `BitsnapReturns` props, including the 1.6.0 ones, to provider props. */
export function toReturnsProviderProps({
  environment,
  texts,
  theme,
  appearance,
  ...rest
}: BitsnapReturnsProps): Omit<ReturnsProviderProps, "children"> {
  let mappedTexts: Partial<ReturnsTexts> | undefined;
  if (texts != null) {
    const legacy: Partial<ReturnsTexts> = {};
    const current: Partial<ReturnsTexts> = {};
    for (const [key, value] of Object.entries(texts)) {
      if (value == null) continue;
      const target = LEGACY_TEXT_KEYS[key as keyof LegacyReturnsTexts];
      if (target != null) {
        legacy[target] = value;
      } else {
        current[key as keyof ReturnsTexts] = value;
      }
    }
    // Current keys win over the old ones that map to them.
    mappedTexts = { ...legacy, ...current };
  }

  return {
    ...rest,
    environment:
      environment === "test" || environment === Environment.TEST
        ? "test"
        : "production",
    texts: mappedTexts,
    appearance: resolvePanelReturnsAppearance(appearance, theme?.brandColor),
  };
}
