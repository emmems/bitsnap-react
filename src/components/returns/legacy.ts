import { Environment } from "@/src/gen/proto/common/v1/environment_pb";
import type { ReturnsAppearance } from "./appearance";
import { brandColorTokens } from "./color";
import type { ReturnsTexts } from "./texts";

/**
 * Compatibility layer for the `bitsnap-react` 1.6.0 returns widget. Everything
 * here is pure; the components and hooks apply it at their boundary.
 */

/** Environment as a string or as the proto enum used by 1.6.0. */
export type ReturnsEnvironmentInput = "production" | "test" | Environment;

/** Text keys of the 1.6.0 widget. */
export type LegacyReturnsTexts = Partial<{
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
}>;

/** Our text keys plus the 1.6.0 ones. Our keys win when both are given. */
export type ReturnsTextsInput = Partial<ReturnsTexts> & LegacyReturnsTexts;

/** 1.6.0 `theme` prop. */
export type LegacyReturnsTheme = { brandColor?: string };

/** Backend environment for a string or enum value. Defaults to production. */
export function resolveReturnsEnvironment(
  environment?: ReturnsEnvironmentInput,
): Environment {
  return environment === "test" || environment === Environment.TEST
    ? Environment.TEST
    : Environment.PRODUCTION;
}

const LEGACY_TEXT_KEYS: Record<
  Exclude<keyof LegacyReturnsTexts, "loading">,
  readonly (keyof ReturnsTexts)[]
> = {
  title: ["emailStepTitle"],
  email: ["emailLabel"],
  sendCode: ["emailSubmit"],
  code: ["codeLabel"],
  verify: ["codeSubmit"],
  orders: ["ordersTitle"],
  submit: ["confirmationSubmit"],
  note: ["noteLabel"],
  history: ["myReturnsTitle", "myReturnsLink"],
};

/**
 * Maps 1.6.0 text keys onto ours. A key of the new API always wins over the
 * legacy key that maps to it. `loading` has the same name in both.
 */
export function mapLegacyTexts(
  texts: ReturnsTextsInput | undefined,
): Partial<ReturnsTexts> | undefined {
  if (texts == null) {
    return undefined;
  }

  const result: Partial<ReturnsTexts> = {};
  for (const [legacyKey, targets] of Object.entries(LEGACY_TEXT_KEYS) as [
    keyof typeof LEGACY_TEXT_KEYS,
    readonly (keyof ReturnsTexts)[],
  ][]) {
    const value = texts[legacyKey];
    if (typeof value === "string") {
      for (const target of targets) {
        result[target] = value;
      }
    }
  }

  for (const key of Object.keys(texts) as (keyof ReturnsTextsInput)[]) {
    if (key in LEGACY_TEXT_KEYS) {
      continue;
    }
    const value = texts[key];
    if (typeof value === "string") {
      result[key as keyof ReturnsTexts] = value;
    }
  }

  return result;
}

/**
 * Appearance with the 1.6.0 `brandColor` applied as button background, focus
 * ring and readable button foreground. Explicit `appearance.tokens` win.
 */
export function resolveBrandAppearance(
  appearance: ReturnsAppearance | undefined,
  theme: LegacyReturnsTheme | undefined,
): ReturnsAppearance | undefined {
  const color = theme?.brandColor?.trim();
  if (color == null || color === "") {
    return appearance;
  }
  return {
    ...appearance,
    tokens: { ...brandColorTokens(color), ...appearance?.tokens },
  };
}

/** Arguments of the paged hooks in either call style. */
export type PagedArguments = {
  pageSize: number;
  /** Explicit page token of the positional (1.6.0) form. */
  explicitPageToken: string | undefined;
};

/**
 * Normalizes `(pageSize?, pageToken?)` (1.6.0) and `({ pageSize })` (ours).
 * Both forms default to 20 items, like 1.6.0.
 */
export function resolvePagedArguments(
  first: number | { pageSize?: number } | undefined,
  pageToken: string | undefined,
): PagedArguments {
  if (typeof first === "object" && first != null) {
    return { pageSize: first.pageSize ?? 20, explicitPageToken: undefined };
  }
  if (typeof first === "number" || pageToken !== undefined) {
    return { pageSize: first ?? 20, explicitPageToken: pageToken ?? "" };
  }
  return { pageSize: 20, explicitPageToken: undefined };
}
