import { useCallback, useRef, useSyncExternalStore } from "react";
import { useIsomorphicLayoutEffect } from "../lib/isomorphic-layout-effect";
import { createConsent } from "./core/controller";
import type {
  BitsnapConsentApi,
  ConsentChoices,
  ConsentConfig,
  ConsentOptions,
  ConsentState,
} from "./core/types";

declare global {
  interface Window {
    BitsnapConsent?: BitsnapConsentApi;
  }
}

export type BitsnapConsentProps = {
  /** Public project key: loads the project's banner config and logs choices. */
  projectKey?: string;
  theme?: ConsentOptions["theme"];
  locale?: ConsentOptions["locale"];
  position?: ConsentOptions["position"];
  privacyPolicyUrl?: string;
  /** `project` keeps the consent cookie per project key. */
  scope?: ConsentOptions["scope"];
  apiHost?: string;
  collectHost?: string;
  /** Local config, merged over the project config. */
  config?: Partial<ConsentConfig>;
  reloadOnWithdraw?: boolean;
  /** Google Consent Mode v2: `auto` (default) is on when `gtag` or `dataLayer` already exist. */
  gcm?: ConsentOptions["gcm"];
  /** Categories offered when no remote config is loaded. */
  categories?: ConsentOptions["categories"];
  /** Dashboard preview: shows the banner from the local options only; touches no cookie. */
  preview?: boolean;
  /** Replaces the banner title. */
  title?: string;
  /** Replaces the banner description. */
  description?: string;
};

/** Mounts Bitsnap Consent on the page. Renders nothing itself (the banner lives in a Shadow DOM). */
export function BitsnapConsent(props: BitsnapConsentProps): null {
  const {
    projectKey, theme, locale, position, privacyPolicyUrl, scope, apiHost, collectHost, reloadOnWithdraw,
    gcm, preview, title, description,
  } = props;
  const configKey = JSON.stringify(props.config ?? null);
  const configRef = useRef(props.config);
  configRef.current = props.config;
  const categoriesKey = JSON.stringify(props.categories ?? null);
  const categoriesRef = useRef(props.categories);
  categoriesRef.current = props.categories;

  // A layout effect: the page's passive effects (first events, tracker) must find the API already there.
  useIsomorphicLayoutEffect(() => {
    // A banner from the script tag or another instance already runs on this page.
    if (window.BitsnapConsent) return;
    const api = createConsent({
      projectKey,
      theme,
      locale,
      position,
      privacyPolicyUrl,
      scope,
      apiHost,
      collectHost,
      reloadOnWithdraw,
      gcm,
      preview,
      title,
      description,
      categories: categoriesRef.current,
      config: configRef.current,
    });
    window.BitsnapConsent = api;
    return () => {
      api.destroy();
      if (window.BitsnapConsent === api) delete window.BitsnapConsent;
    };
  }, [
    projectKey, theme, locale, position, privacyPolicyUrl, scope, apiHost, collectHost, reloadOnWithdraw,
    gcm, preview, title, description, categoriesKey, configKey,
  ]);

  return null;
}

let lastKey = "null";
let lastState: ConsentState | null = null;

function getSnapshot(): ConsentState | null {
  const current = typeof window === "undefined" ? null : (window.BitsnapConsent?.get() ?? null);
  const key = JSON.stringify(current);
  if (key !== lastKey) {
    lastKey = key;
    lastState = current;
  }
  return lastState;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("bitsnap:consent", onChange);
  window.addEventListener("bitsnap:consent:ready", onChange);
  return () => {
    window.removeEventListener("bitsnap:consent", onChange);
    window.removeEventListener("bitsnap:consent:ready", onChange);
  };
}

export type UseConsent = {
  /** The stored choice, or `null` while there is none (or on the server). */
  consent: ConsentState | null;
  /** `true` once the visitor has made a choice that is still valid. */
  decided: boolean;
  open: () => void;
  accept: (categories?: Partial<ConsentChoices>) => void;
  acceptAll: () => void;
  rejectAll: () => void;
  reset: () => void;
};

/** Current consent state of the page, kept up to date as the visitor chooses. */
export function useConsent(): UseConsent {
  const consent = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const open = useCallback(() => window.BitsnapConsent?.open(), []);
  const accept = useCallback((categories?: Partial<ConsentChoices>) => window.BitsnapConsent?.accept(categories), []);
  const acceptAll = useCallback(() => window.BitsnapConsent?.acceptAll(), []);
  const rejectAll = useCallback(() => window.BitsnapConsent?.rejectAll(), []);
  const reset = useCallback(() => window.BitsnapConsent?.reset(), []);
  return { consent, decided: consent !== null, open, accept, acceptAll, rejectAll, reset };
}
