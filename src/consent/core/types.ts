export type ConsentCategory = "analytics" | "marketing" | "preferences";

export type ConsentChoices = Record<ConsentCategory, boolean>;

export type ConsentTheme = "auto" | "light" | "dark";

export type ConsentPosition = "bottom" | "bottom-left" | "bottom-right";

export type ConsentLocale = "pl" | "en";

export const CONSENT_CATEGORIES: readonly ConsentCategory[] = [
  "analytics",
  "marketing",
  "preferences",
];

export const CONSENT_TEXT_KEYS = [
  "title",
  "description",
  "acceptAll",
  "rejectAll",
  "settings",
  "save",
  "close",
  "necessaryTitle",
  "necessaryDescription",
  "analyticsTitle",
  "analyticsDescription",
  "marketingTitle",
  "marketingDescription",
  "preferencesTitle",
  "preferencesDescription",
  "poweredBy",
] as const;

export type ConsentTexts = Record<(typeof CONSENT_TEXT_KEYS)[number], string>;

export type ConsentService = {
  name: string;
  category: ConsentCategory;
  /** Cookies to delete (best effort) when the category is withdrawn. A trailing `*` matches a prefix. */
  cookies?: string[];
};

export type ConsentConfig = {
  /** Banner version. A stored choice with a lower `bv` makes the banner ask again. */
  version: number;
  theme: ConsentTheme;
  accentColor?: string;
  position: ConsentPosition;
  privacyPolicyUrl?: string;
  categories: ConsentChoices;
  services: ConsentService[];
  texts?: Partial<Record<ConsentLocale, Partial<ConsentTexts>>>;
  poweredBy: true;
};

/** What the consent cookie holds, and what `get()` returns. */
export type ConsentState = {
  id: string;
  /** Unix seconds. */
  ts: number;
  /** Version of the banner the choice was made on. */
  bv: number;
  c: ConsentChoices;
};

export type ConsentAction =
  | "accept_all"
  | "reject_all"
  | "custom"
  | "withdraw";

/** `detail` of `bitsnap:consent` and the argument of `on('change')`. */
export type ConsentChangeDetail = ConsentState & {
  /** `reset` when the visitor's stored choice was cleared (`get()` is `null` then). */
  action: ConsentAction | "reset";
};

export type ConsentOptions = {
  /** Public project key. Enables the remote config and the consent log. */
  projectKey?: string;
  theme?: ConsentTheme;
  locale?: "auto" | ConsentLocale;
  position?: ConsentPosition;
  privacyPolicyUrl?: string;
  /** `project` keeps one cookie per project key (`bitsnap_consent_<key>`). */
  scope?: "global" | "project";
  apiHost?: string;
  collectHost?: string;
  /** Google Consent Mode v2. `auto` is on when `gtag` or `dataLayer` already exist. */
  gcm?: "auto" | "on" | "off";
  /** Local overrides, merged over the defaults and the remote config. */
  config?: Partial<ConsentConfig>;
  /** Categories used when no remote config is loaded. */
  categories?: Partial<ConsentChoices>;
  reloadOnWithdraw?: boolean;
  /**
   * Dashboard preview: shows the banner at once from the local options, never
   * reads or writes the cookie, loads no remote config, sends no consent log,
   * and the buttons only close the banner.
   */
  preview?: boolean;
  /** Replaces the banner title (current locale, non-empty values only). */
  title?: string;
  /** Replaces the banner description (current locale, non-empty values only). */
  description?: string;
};

export type BitsnapConsentApi = {
  /**
   * Whose choice this banner holds: `project` keeps one cookie per project key
   * (`bitsnap_consent_<key>`), `global` the site-wide `bitsnap_consent`.
   */
  readonly scope: "global" | "project";
  /** The bare public project key the banner was started with, if any (`pk_` stripped). */
  readonly projectKey: string | null;
  get(): ConsentState | null;
  /**
   * `true` when the visitor refused `category`, also in a choice made on an older banner
   * version (which `get()` no longer returns) that they have not answered again yet.
   */
  denied(category: ConsentCategory): boolean;
  on(event: "change", fn: (detail: ConsentChangeDetail) => void): () => void;
  open(): void;
  close(): void;
  accept(categories?: Partial<ConsentChoices>): void;
  acceptAll(): void;
  rejectAll(): void;
  reset(): void;
  /** Resolves with the stored choice (or `null`) once config and stored choice are applied. */
  ready: Promise<ConsentState | null>;
  destroy(): void;
};
