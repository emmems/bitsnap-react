import type { CSSProperties } from "react";

/**
 * Generic building blocks shared by the appearance modules (checkout, and
 * later returns). Each module supplies its own token to CSS variable map, theme
 * presets and shadcn mapping, and keeps its own public types. Everything here
 * is pure so it can be tested without a DOM.
 */

/** Caller overrides for a single slot. */
export type SlotAppearance = {
  /** Merged after the built-in classes with `cn`, so Tailwind conflicts resolve. */
  className?: string;
  /** Merged after the built-in inline styles. */
  style?: CSSProperties;
};

/** Typed partial map of slot name to its overrides. */
export type AppearanceElements<Slot extends string> = Partial<
  Record<Slot, SlotAppearance>
>;

/** CSS custom property used for each token. */
export type TokenVariables<Token extends string> = Readonly<
  Record<Token, string>
>;

/**
 * Remaps a token onto a shadcn theme variable (`--background`, `--ring`, ...)
 * so shared UI primitives follow the module's tokens. Only written when the
 * token is in effect.
 */
export type ShadcnVariableMapping<Token extends string> = readonly {
  token: Token;
  variable: string;
}[];

export type AppearanceCoreConfig<Token extends string, Theme extends string> = {
  /** Theme used when the caller does not select one. */
  defaultTheme: Theme;
  /** Partial token sets applied underneath the caller tokens. */
  presets: Record<Theme, Partial<Record<Token, string>>>;
  variables: TokenVariables<Token>;
  shadcnVariables: ShadcnVariableMapping<Token>;
};

export type ResolvedAppearanceCore<
  Token extends string,
  Theme extends string,
  Slot extends string,
> = {
  theme: Theme;
  /** `true` as soon as the caller passed a theme, a token or a slot override. */
  isCustomized: boolean;
  /** Tokens that are in effect. Empty entries were dropped. */
  tokens: Partial<Record<Token, string>>;
  elements: AppearanceElements<Slot>;
  /** Inline custom properties for the theme boundary. */
  boundaryStyle: CSSProperties;
};

/** Drops `undefined`/`null` tokens so unset values keep the stylesheet default. */
export function omitUndefined<Token extends string>(
  tokens: Partial<Record<Token, string>>,
): Partial<Record<Token, string>> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(tokens)) {
    if (value != null) {
      result[key] = value;
    }
  }

  return result as Partial<Record<Token, string>>;
}

export function hasAnyElement<Slot extends string>(
  elements: AppearanceElements<Slot>,
): boolean {
  return Object.values<SlotAppearance | undefined>(elements).some(
    (element) =>
      element != null && (element.className != null || element.style != null),
  );
}

/**
 * Token to CSS variable resolution, followed by the shadcn remapping. Only
 * tokens that are in effect produce a variable.
 */
export function resolveBoundaryStyle<Token extends string>(
  tokens: Partial<Record<Token, string>>,
  variables: TokenVariables<Token>,
  shadcnVariables: ShadcnVariableMapping<Token>,
): CSSProperties {
  const style: Record<string, string> = {};

  for (const [token, variable] of Object.entries<string>(variables)) {
    const value = tokens[token as Token];
    if (value != null) {
      style[variable] = value;
    }
  }

  for (const { token, variable } of shadcnVariables) {
    const value = tokens[token];
    if (value != null) {
      style[variable] = value;
    }
  }

  return style as CSSProperties;
}

/**
 * Resolves theme, tokens, slot overrides and the boundary style. The resolver
 * never invents values: a token is only present when the caller provided it or
 * selected a theme preset that carries it.
 */
export function resolveAppearanceCore<
  Token extends string,
  Theme extends string,
  Slot extends string,
>(
  appearance:
    | {
        theme?: Theme;
        tokens?: Partial<Record<Token, string>>;
        elements?: AppearanceElements<Slot>;
      }
    | undefined,
  config: AppearanceCoreConfig<Token, Theme>,
): ResolvedAppearanceCore<Token, Theme, Slot> {
  const theme: Theme = appearance?.theme ?? config.defaultTheme;

  const tokens = omitUndefined<Token>({
    ...config.presets[theme],
    ...appearance?.tokens,
  });

  const elements = appearance?.elements ?? {};

  return {
    theme,
    isCustomized:
      appearance?.theme != null ||
      Object.keys(tokens).length > 0 ||
      hasAnyElement(elements),
    tokens,
    elements,
    boundaryStyle: resolveBoundaryStyle(
      tokens,
      config.variables,
      config.shadcnVariables,
    ),
  };
}

/** Caller overrides for a slot, if any were provided. */
export function getSlotAppearance<Slot extends string>(
  elements: AppearanceElements<Slot>,
  slot: Slot,
): SlotAppearance | undefined {
  return elements[slot];
}
