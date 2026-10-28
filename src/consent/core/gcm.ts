import type { ConsentChoices } from "./types";

type Gtag = (...args: unknown[]) => void;

type GcmWindow = Window & {
  gtag?: Gtag;
  dataLayer?: unknown[];
};

export const GCM_DEFAULT = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
  functionality_storage: "denied",
  personalization_storage: "denied",
  security_storage: "granted",
  wait_for_update: 500,
} as const;

const grant = (value: boolean) => (value ? "granted" : "denied");

/** analytics -> analytics_storage; marketing -> ad_*; preferences -> functionality/personalization. */
export function toConsentModeUpdate(c: ConsentChoices) {
  return {
    analytics_storage: grant(c.analytics),
    ad_storage: grant(c.marketing),
    ad_user_data: grant(c.marketing),
    ad_personalization: grant(c.marketing),
    functionality_storage: grant(c.preferences),
    personalization_storage: grant(c.preferences),
  };
}

export function shouldUseConsentMode(win: GcmWindow, mode: "auto" | "on" | "off" | undefined): boolean {
  if (mode === "off") return false;
  return mode === "on" || typeof win.gtag === "function" || Array.isArray(win.dataLayer);
}

/** A `gtag` that works without gtag.js: it queues `arguments` objects, as gtag.js expects. */
export function ensureGtag(win: GcmWindow): Gtag {
  if (typeof win.gtag === "function") return win.gtag;
  const layer = (win.dataLayer = win.dataLayer || []);
  const gtag: Gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  };
  win.gtag = gtag;
  return gtag;
}

export type ConsentMode = {
  setDefault(): void;
  update(c: ConsentChoices): void;
};

export function createConsentMode(win: GcmWindow, mode: "auto" | "on" | "off" | undefined): ConsentMode | null {
  if (!shouldUseConsentMode(win, mode)) return null;
  const gtag = ensureGtag(win);
  return {
    setDefault: () => gtag("consent", "default", { ...GCM_DEFAULT }),
    update: (c) => gtag("consent", "update", toConsentModeUpdate(c)),
  };
}
