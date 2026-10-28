import { normalizeProjectKey } from "../../analytics/contract";
import { activateScripts } from "./activate";
import {
  DEFAULT_API_HOST,
  DEFAULT_COLLECT_HOST,
  fetchRemoteConfig,
  mergeConfig,
} from "./config";
import {
  clearConsent,
  cookieName,
  deleteServiceCookies,
  newConsentId,
  readConsent,
  writeConsent,
} from "./cookie";
import { createConsentMode } from "./gcm";
import { mergeTexts, resolveLocale } from "./texts";
import { createUI, type ConsentUI } from "./ui";
import {
  CONSENT_CATEGORIES,
  type BitsnapConsentApi,
  type ConsentAction,
  type ConsentCategory,
  type ConsentChangeDetail,
  type ConsentChoices,
  type ConsentConfig,
  type ConsentOptions,
  type ConsentState,
  type ConsentTexts,
} from "./types";

const none = (): ConsentChoices => ({ analytics: false, marketing: false, preferences: false });

const copy = (state: ConsentState | null): ConsentState | null =>
  state && { id: state.id, ts: state.ts, bv: state.bv, c: { ...state.c } };

/** Sync `get()`-style API with no DOM until a layer is shown. Never throws into the page. */
export function createConsent(options: ConsentOptions = {}): BitsnapConsentApi {
  const win = typeof window !== "undefined" ? window : undefined;
  const doc = win?.document;
  const listeners = new Set<(detail: ConsentChangeDetail) => void>();
  const apiHost = options.apiHost || DEFAULT_API_HOST;
  const collectHost = options.collectHost || DEFAULT_COLLECT_HOST;
  // The contract uses the bare key (no `pk_`) for the cookie name, the config URL and the log.
  const projectKey = options.projectKey ? normalizeProjectKey(options.projectKey) : null;
  const name = cookieName(projectKey ?? undefined, options.scope);
  const preview = !!options.preview;

  let config: ConsentConfig = mergeConfig(localLayer());
  let state: ConsentState | null = null;
  /** A stored choice made on an older banner version: it asks again, but its id is reused. */
  let stale: ConsentState | null = null;
  let ui: ConsentUI | null = null;
  let loaded = false;
  let destroyed = false;
  let removeOpenListener: (() => void) | undefined;
  /** Choices made before `ready`: they run inside it, before anyone waiting on `ready` is released. */
  const pending: Array<() => void> = [];

  // Consent Mode default has to be set before anything else, config or not.
  // A preview touches nothing outside its own banner: no dataLayer, no cookie.
  const mode = win && !preview ? safe(() => createConsentMode(win, options.gcm), null) : null;
  safe(() => mode?.setDefault(), undefined);
  // The stored choice is read now but only applied once the config is known: it has to match
  // the banner version and the categories on offer. Until then Consent Mode stays denied.
  const initial = doc && !preview ? readConsent(doc, name) : null;

  function localLayer(extra?: Partial<ConsentConfig>): Partial<ConsentConfig> {
    const own: Partial<ConsentConfig> = { ...options.config };
    if (options.theme) own.theme = options.theme;
    if (options.position) own.position = options.position;
    if (options.privacyPolicyUrl) own.privacyPolicyUrl = options.privacyPolicyUrl;
    return { ...extra, ...own };
  }

  function safe<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch {
      return fallback;
    }
  }

  function enabled(choices: Partial<ConsentChoices> | undefined): ConsentChoices {
    const result = none();
    for (const category of CONSENT_CATEGORIES) {
      result[category] = !!choices?.[category] && config.categories[category];
    }
    return result;
  }

  function emit(detail: ConsentChangeDetail) {
    listeners.forEach((fn) => safe(() => fn({ ...detail, c: { ...detail.c } }), undefined));
    safe(() => {
      win?.dispatchEvent(new win.CustomEvent("bitsnap:consent", { detail: { ...detail, c: { ...detail.c } } }));
    }, undefined);
  }

  function log(action: ConsentAction, record: ConsentState) {
    if (preview || !projectKey || typeof fetch !== "function") return;
    safe(() => {
      const body = JSON.stringify({
        k: projectKey,
        consent_id: record.id,
        action,
        c: record.c,
        bv: record.bv,
        host: win?.location?.hostname ?? "",
        ts: record.ts,
      });
      fetch(`${collectHost.replace(/\/+$/, "")}/consent`, {
        method: "POST",
        keepalive: true,
        credentials: "omit",
        body,
      }).catch(() => {});
    }, undefined);
  }

  /** Granted categories the current config still offers. */
  function granted(c: ConsentChoices): ConsentCategory[] {
    return CONSENT_CATEGORIES.filter((category) => c[category] && config.categories[category]);
  }

  function commit(choices: ConsentChoices, requested: ConsentAction) {
    if (!doc || destroyed) return;
    if (preview) {
      ui?.hide();
      return;
    }
    const previous = state ?? stale;
    const dropped = previous ? granted(previous.c).filter((category) => !choices[category]) : [];
    const action: ConsentAction = dropped.length > 0 ? "withdraw" : requested;
    const next: ConsentState = {
      id: previous?.id ?? newConsentId(),
      ts: Math.floor(Date.now() / 1000),
      bv: config.version,
      c: choices,
    };
    writeConsent(doc, name, next);
    state = next;
    stale = null;
    applyChoices(next.c);
    if (dropped.length > 0) deleteServiceCookies(doc, config.services, dropped);
    ui?.hide();
    emit({ ...next, action });
    log(action, next);
    if (dropped.length > 0 && options.reloadOnWithdraw) reload();
  }

  function applyChoices(c: ConsentChoices) {
    safe(() => mode?.update(c), undefined);
    if (doc) activateScripts(doc, c);
  }

  function reload() {
    setTimeout(() => safe(() => win?.location.reload(), undefined), 50);
  }

  function ensureUI(): ConsentUI | null {
    if (!doc || !loaded || destroyed) return null;
    if (!ui) {
      const locale = resolveLocale(options.locale, win?.navigator?.language);
      ui = createUI({
        doc,
        config,
        locale,
        texts: localTexts(mergeTexts(locale, config.texts)),
        getChoices: () => state?.c ?? null,
        hasChoice: () => state !== null,
        onAcceptAll: () => commit(enabled({ analytics: true, marketing: true, preferences: true }), "accept_all"),
        onRejectAll: () => commit(none(), "reject_all"),
        onSave: (choices) => commit(enabled(choices), "custom"),
      });
    }
    return ui;
  }

  /** `data-title` / `data-description` win over the remote and default texts. */
  function localTexts(texts: ConsentTexts): ConsentTexts {
    const title = options.title?.trim();
    const description = options.description?.trim();
    return { ...texts, ...(title && { title }), ...(description && { description }) };
  }

  function onClick(event: Event) {
    const target = event.target as Element | null;
    if (target?.closest?.("[data-bitsnap-consent-open]")) {
      event.preventDefault();
      api.open();
    }
  }

  const ready: Promise<ConsentState | null> = (async () => {
    if (!doc || !win) return null;
    const remote = projectKey && !preview ? await fetchRemoteConfig(apiHost, projectKey) : null;
    if (destroyed) return null;
    const categories = remote?.config ? undefined : options.categories;
    config = mergeConfig(
      remote?.config,
      categories ? { categories: { ...none(), ...categories } } : undefined,
      localLayer(),
    );
    if (doc.readyState === "loading") {
      await new Promise<void>((resolve) => doc.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
    }
    if (destroyed) return null;
    loaded = true;
    doc.addEventListener("click", onClick);
    removeOpenListener = () => doc.removeEventListener("click", onClick);

    // A project whose config could not be loaded has an unknown banner version: keep the
    // stored choice instead of asking again on every network failure.
    const versionKnown = !projectKey || remote?.config != null;
    const bannerOff = remote?.enabled === false;
    if (preview) {
      ensureUI()?.showBanner();
    } else if (initial && (bannerOff || !versionKnown || initial.bv === config.version)) {
      state = initial;
      applyChoices(enabled(state.c));
    } else {
      if (initial) stale = initial;
      // A disabled banner is never shown, but the API (open, accept, ...) keeps working.
      if (!bannerOff) ensureUI()?.showBanner();
    }
    // A tracker that waits on `ready` has to see the final state, rejection included.
    pending.splice(0).forEach((fn) => safe(fn, undefined));
    safe(() => win.dispatchEvent(new win.CustomEvent("bitsnap:consent:ready")), undefined);
    return copy(state);
  })().catch(() => null);

  function afterReady(fn: () => void) {
    if (loaded) fn();
    else pending.push(fn);
  }

  const api: BitsnapConsentApi = {
    get: () => copy(state),
    // A choice made on an older banner version has no `get()`, but a refusal in it still holds.
    denied: (category) => (state ?? stale)?.c[category] === false,
    on(event, fn) {
      if (event !== "change" || typeof fn !== "function") return () => {};
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    open() {
      if (loaded) ensureUI()?.showSettings();
      else void ready.then(() => ensureUI()?.showSettings());
    },
    close() {
      ui?.hide();
    },
    // Called before `ready`, a choice waits for the merged config so it is stored with the right
    // banner version and only for categories on offer.
    accept: (categories) => afterReady(() => commit(enabled(categories), "custom")),
    acceptAll: () =>
      afterReady(() => commit(enabled({ analytics: true, marketing: true, preferences: true }), "accept_all")),
    rejectAll: () => afterReady(() => commit(none(), "reject_all")),
    reset() {
      if (!doc || destroyed) return;
      if (preview) {
        ensureUI()?.showBanner();
        return;
      }
      const previous = state ?? stale;
      const was = previous ? granted(previous.c) : [];
      clearConsent(doc, name);
      state = null;
      stale = previous;
      safe(() => mode?.update(none()), undefined);
      if (was.length > 0) deleteServiceCookies(doc, config.services, was);
      emit({
        id: previous?.id ?? "",
        ts: Math.floor(Date.now() / 1000),
        bv: config.version,
        c: none(),
        action: "reset",
      });
      if (previous && was.length > 0) {
        log("withdraw", { id: previous.id, ts: Math.floor(Date.now() / 1000), bv: config.version, c: none() });
      }
      ensureUI()?.showBanner(true);
      if (was.length > 0 && options.reloadOnWithdraw) reload();
    },
    ready,
    destroy() {
      destroyed = true;
      removeOpenListener?.();
      ui?.destroy();
      ui = null;
      listeners.clear();
    },
  };

  return wrapSafe(api);
}

/** Every method of the public API swallows its own errors. */
function wrapSafe(api: BitsnapConsentApi): BitsnapConsentApi {
  const wrapped = { ...api } as Record<string, unknown>;
  for (const key of Object.keys(api) as (keyof BitsnapConsentApi)[]) {
    const original = api[key];
    if (typeof original === "function") {
      wrapped[key] = (...args: unknown[]) => {
        try {
          return (original as (...a: unknown[]) => unknown)(...args);
        } catch {
          return key === "get" ? null : key === "on" ? () => {} : undefined;
        }
      };
    }
  }
  return wrapped as BitsnapConsentApi;
}
