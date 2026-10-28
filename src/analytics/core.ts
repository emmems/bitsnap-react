import {
  LIMITS,
  PAGE_TYPES,
  SCHEMA_VERSION,
  normalizeProjectKey,
  parseUrl,
  referrerHost,
  sanitizeProps,
  sanitizePath,
  validateEnvelope,
  type AppEventName,
  type Channel,
  type ClientEvent,
  type Env,
  type EventProps,
  type PageType,
  type Source,
  type StorefrontEventName,
} from "./contract";
import { SDK_VERSION } from "../version";
import { resetAutoPageViews } from "./pageviews";
import { randomBytes } from "./random";
import {
  analyticsGranted,
  consentApi,
  consentBelongsTo,
  deleteVisitorCookie,
  newVisitorId,
  readVisitorCookie,
  readVisitorId,
  VISITOR_HEADER,
  writeVisitorCookie,
  type ConsentLike,
} from "./visitor";

export { startAutoPageViews } from "./pageviews";

/** Events a browser may send. `consent_updated` is written by the consent log only. */
export type BrowserEventName = Exclude<StorefrontEventName, "consent_updated"> | AppEventName;

export type TrackerOptions = {
  /** Public project key (the hashed project id). `pk_` prefix is accepted. */
  projectKey: string;
  /** Defaults to `live`, or `test` when the page URL has the `?test=` test-mode parameter. */
  env?: Env;
  /** Collector origin. Default `https://collect.bitsnap.pl`. */
  endpoint?: string;
  /** `false` turns tracking off. Default `true`. */
  enabled?: boolean;
  /** Default `embed`. */
  channel?: Channel;
  /** Default `sdk_react`. */
  source?: Source;
  /** Only honoured by the collector for `source: "dashboard"` (hashed user id). */
  visitorId?: string;
  /** Receives every valid envelope before it is queued, e.g. to forward it to the merchant's own tools. */
  onEvent?: (event: ClientEvent) => void;
  /** `console.warn` dropped events. */
  debug?: boolean;
};

/** Envelope fields a call site may set per event. */
export type TrackExtra = {
  page_type?: PageType | null;
  product_id?: string | null;
  variant_id?: string | null;
  order_ref?: string | null;
  /** Route template for pages whose URL path is not the path to report (the dashboard). */
  path?: string;
  /**
   * Deterministic UUIDv7 for events another system reports too (e.g. hosted
   * `payment_returned`), so the collector dedupes them. An invalid value is
   * ignored and a fresh id is used.
   */
  event_id?: string;
};

export interface Tracker {
  track<E extends BrowserEventName>(event: E, props: EventProps<E>, extra?: TrackExtra): void;
  /**
   * Sends `page_view` and makes `pageType` the page type of the following events
   * (`null` clears it, `undefined` keeps the current one).
   */
  page(pageType?: PageType | null, extra?: TrackExtra): void;
  /**
   * The visitor's `bs_vid_<projectKey>` client id, only while this tracker is on
   * (enabled, no Global Privacy Control, not automated, analytics not denied) and
   * Bitsnap Consent grants analytics. `projectKey` must match the tracker's, if given.
   */
  clientId(projectKey?: string): string | null;
  /** Sends the queue now. */
  flush(): void;
  setEnabled(enabled: boolean): void;
  /** Returns an unsubscribe function. */
  onEvent(fn: (event: ClientEvent) => void): () => void;
  /** Updates `env` and `endpoint` of a running tracker. Other options are fixed at creation. */
  configure(patch: { env?: Env; endpoint?: string }): void;
  /** Removes the page listeners and drops the queue. */
  destroy(): void;
}

export const DEFAULT_ENDPOINT = "https://collect.bitsnap.pl";

const FLUSH_INTERVAL_MS = 5000;
const FLUSH_AT = 20;
// Half the collector's 64 KB body limit, measured in UTF-8 bytes of the whole body.
const MAX_BODY_BYTES = 32 * 1024;
// Browsers share ~64 KB of in-flight keepalive requests; stay under it on pagehide.
const KEEPALIVE_BUDGET_BYTES = 60 * 1024;
const EVENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function byteLength(text: string): number {
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

export const noopTracker: Tracker = {
  track() {},
  page() {},
  clientId: () => null,
  flush() {},
  setEnabled() {},
  onEvent: () => () => {},
  configure() {},
  destroy() {},
};

/** UUIDv7: 48-bit unix ms, version 7, variant 10, 74 random bits. */
export function uuidv7(now = Date.now()): string {
  const b = randomBytes(16);
  let t = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const PAGE_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function newPageId(): string {
  return Array.from(randomBytes(16), (x) => PAGE_ID_ALPHABET[x % PAGE_ID_ALPHABET.length]).join("");
}

export function isPageType(value: unknown): value is PageType {
  return typeof value === "string" && (PAGE_TYPES as readonly string[]).includes(value);
}

export type PackedBody = { body: string; bytes: number; count: number };

/**
 * Splits events into `POST /e` bodies of at most `MAX_BODY_BYTES` UTF-8 bytes
 * (wrapper included) and `maxBatchEvents` events. With `leaving` (pagehide)
 * only the newest bodies that fit the shared keepalive quota are kept.
 */
export function packEvents(projectKey: string, events: ClientEvent[], leaving = false): PackedBody[] {
  const wrapper = byteLength(JSON.stringify({ k: projectKey, events: [] }));
  let bodies: PackedBody[] = [];
  let batch: ClientEvent[] = [];
  let size = wrapper;
  const close = () => {
    if (batch.length > 0) bodies.push({ body: JSON.stringify({ k: projectKey, events: batch }), bytes: size, count: batch.length });
    batch = [];
    size = wrapper;
  };
  for (const event of events) {
    const own = byteLength(JSON.stringify(event));
    if (wrapper + own > MAX_BODY_BYTES) continue; // a single event that can never fit
    // +1 for the comma that joins it to the previous event.
    if (batch.length >= LIMITS.maxBatchEvents || size + own + (batch.length > 0 ? 1 : 0) > MAX_BODY_BYTES) close();
    size += own + (batch.length > 0 ? 1 : 0);
    batch.push(event);
  }
  close();
  if (leaving) {
    let total = 0;
    let keep = bodies.length;
    while (keep > 0 && total + bodies[keep - 1].bytes <= KEEPALIVE_BUDGET_BYTES) {
      total += bodies[keep - 1].bytes;
      keep--;
    }
    bodies = bodies.slice(keep);
  }
  return bodies;
}

/**
 * In-memory event tracker. It never throws into the host page and touches no
 * cookie or Web Storage, except the `bs_vid_<projectKey>` client id cookie, which it keeps
 * only while Bitsnap Consent grants analytics. On the server it returns a no-op.
 */
export function createTracker(options: TrackerOptions): Tracker {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return noopTracker;
    return build(options, window);
  } catch {
    return noopTracker;
  }
}

function build(options: TrackerOptions, win: Window & typeof globalThis): Tracker {
  const projectKey = normalizeProjectKey(options.projectKey ?? "");
  const debug = !!options.debug;
  const warn = (...args: unknown[]) => {
    if (debug) console.warn("[bitsnap analytics]", ...args);
  };
  if (!projectKey) {
    warn("invalid projectKey, tracking is off");
    return noopTracker;
  }
  const key: string = projectKey;

  const endpointUrl = (endpoint: string | undefined) => `${(endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, "")}/e`;
  let url = endpointUrl(options.endpoint);
  const source = options.source ?? "sdk_react";
  const channel = options.channel ?? "embed";
  const sdk = `bitsnap-react@${SDK_VERSION}`;
  const pageId = newPageId();
  const landing = parseUrl(win.location.href);
  let env: Env = options.env ?? "live";
  if (!options.env) {
    try {
      if (new URLSearchParams(win.location.search).has("test")) env = "test";
    } catch {}
  }
  const refHost = referrerHost(document.referrer);

  let enabled = options.enabled !== false;
  let pageType: PageType | null = null;
  let pageViews = 0;
  let queue: ClientEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<(event: ClientEvent) => void>();
  if (options.onEvent) listeners.add(options.onEvent);
  /** Events the listeners have not seen yet because consent was still loading. */
  let held: ClientEvent[] = [];

  // -- consent: respect a rejection, wait for the stored choice to load -----

  let attached: ConsentLike | undefined;
  let consentReady = true;

  function attachConsent() {
    const api = consentApi(win);
    if (!api || api === attached) return;
    attached = api;
    consentReady = !api.ready;
    api.ready?.then(
      () => {
        if (attached !== api) return;
        consentReady = true;
        afterConsentChange();
      },
      () => {
        if (attached === api) consentReady = true;
      },
    );
  }

  function consentDenied(): boolean {
    attachConsent();
    try {
      if (!attached) return false;
      const state = attached.get();
      return (!!attached.denied && attached.denied("analytics")) || (!!state && state.c.analytics === false);
    } catch {
      return false;
    }
  }

  function notify(event: ClientEvent) {
    listeners.forEach((fn) => {
      try {
        fn(event);
      } catch {}
    });
  }

  /**
   * Keeps the `bs_vid_<projectKey>` cookie in line with the consent: set while analytics is granted, deleted once
   * it is not. Before the stored choice has loaded `get()` is empty, so nothing is deleted then.
   * Without Bitsnap Consent on the page the tracker is cookieless.
   */
  function syncVisitorCookie(final: boolean) {
    try {
      attachConsent();
      if (!attached) return;
      // A banner of another project, or bitsnap's own on bitsnap.pl, neither grants nor withdraws this id.
      if (!consentBelongsTo(win, key)) return;
      if (analyticsGranted(win, key)) {
        if (active() && readVisitorCookie(win.document, key) === null) writeVisitorCookie(win, key, newVisitorId());
      } else if (final) {
        deleteVisitorCookie(win, key);
      }
    } catch {}
  }

  function afterConsentChange() {
    syncVisitorCookie(true);
    if (consentDenied()) {
      queue = [];
      held = [];
      clearTimer();
    } else {
      if (consentReady && held.length > 0) {
        const release = held;
        held = [];
        release.forEach(notify);
      }
      if (queue.length > 0) flush();
    }
  }

  // -- state ----------------------------------------------------------------

  function active(): boolean {
    if (!enabled) return false;
    const nav = win.navigator;
    if (nav && ((nav as { globalPrivacyControl?: boolean }).globalPrivacyControl === true || nav.webdriver === true)) {
      return false;
    }
    return !consentDenied();
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, FLUSH_INTERVAL_MS);
    (timer as { unref?: () => void }).unref?.();
  }

  // -- sending --------------------------------------------------------------

  function send(body: string) {
    // fetch keepalive first (no size cap below the shared quota); sendBeacon only as a fallback.
    try {
      if (typeof fetch === "function") {
        fetch(url, {
          method: "POST",
          body,
          keepalive: true,
          credentials: "omit",
          headers: { "Content-Type": "text/plain" },
        }).catch(() => {});
        return;
      }
    } catch {}
    try {
      const nav = win.navigator;
      if (nav && typeof nav.sendBeacon === "function") {
        nav.sendBeacon(url, new Blob([body], { type: "text/plain" }));
      }
    } catch {}
  }

  function flush(leaving = false) {
    try {
      clearTimer();
      if (queue.length === 0) return;
      if (!active()) {
        queue = [];
        return;
      }
      // Hold events until Bitsnap Consent has loaded the stored choice.
      if (!consentReady) return;
      // The client id is added on the way out, so events held for the stored choice carry it too.
      syncVisitorCookie(consentReady);
      const clientId = readVisitorId(win, key);
      const pending = clientId ? queue.map((event) => ({ ...event, client_id: clientId })) : queue;
      queue = [];
      packEvents(key, pending, leaving).forEach((entry) => send(entry.body));
    } catch {}
  }

  // -- building -------------------------------------------------------------

  function emit(name: string, props: unknown, extra: TrackExtra | undefined) {
    if (!active()) return;
    const cleaned = sanitizeProps(name, props);
    if (!cleaned.ok) {
      warn("dropped", name, cleaned.reason);
      return;
    }
    const here = parseUrl(win.location.href);
    const event: Record<string, unknown> = {
      event_id: extra?.event_id && EVENT_ID_RE.test(extra.event_id) ? extra.event_id : uuidv7(),
      event: name,
      ts: Date.now(),
      schema_version: SCHEMA_VERSION,
      env,
      source,
      channel,
      sdk,
      page_id: pageId,
      page_type: extra?.page_type !== undefined ? extra.page_type : pageType,
      host: here?.host ?? null,
      path: extra?.path ? sanitizePath(extra.path.split(/[?#]/)[0]) : (here?.path ?? null),
      referrer_host: refHost,
      utm_source: landing?.utm_source ?? null,
      utm_medium: landing?.utm_medium ?? null,
      utm_campaign: landing?.utm_campaign ?? null,
      utm_content: landing?.utm_content ?? null,
      utm_term: landing?.utm_term ?? null,
      ref_code: landing?.ref_code ?? null,
      product_id: extra?.product_id ?? null,
      variant_id: extra?.variant_id ?? null,
      order_ref: extra?.order_ref ?? null,
      props: cleaned.props,
    };
    if (extra?.event_id && !EVENT_ID_RE.test(extra.event_id)) warn("ignored invalid event_id", name);
    if (source === "dashboard" && options.visitorId) event.visitor_id = options.visitorId;

    const verdict = validateEnvelope(event);
    if (!verdict.ok) {
      warn("dropped", name, verdict.reason);
      return;
    }
    const valid = event as unknown as ClientEvent;
    // Listeners (the merchant's own tools) only see events once consent is known and not denied.
    if (consentReady) notify(valid);
    else held.push(valid);
    queue.push(valid);
    if (queue.length >= FLUSH_AT) flush();
    else schedule();
  }

  // -- page lifecycle -------------------------------------------------------

  const onHide = () => flush(true);
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush(true);
  };
  const onConsent = () => afterConsentChange();
  win.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("bitsnap:consent", onConsent);
  win.addEventListener("bitsnap:consent:ready", onConsent);
  attachConsent();
  syncVisitorCookie(consentReady);

  return {
    track(event, props, extra) {
      try {
        emit(event, props, extra);
      } catch {}
    },
    page(type, extra) {
      try {
        if (type !== undefined) pageType = type;
        emit("page_view", { landing: pageViews++ === 0 }, extra);
      } catch {}
    },
    clientId(projectKey) {
      try {
        if (projectKey !== undefined && normalizeProjectKey(projectKey) !== key) return null;
        return active() ? readVisitorId(win, key) : null;
      } catch {
        return null;
      }
    },
    flush: () => flush(),
    setEnabled(value) {
      enabled = !!value;
      if (!enabled) {
        queue = [];
        held = [];
        clearTimer();
      }
    },
    configure(patch) {
      try {
        if (patch.env === "live" || patch.env === "test") env = patch.env;
        if (typeof patch.endpoint === "string" && patch.endpoint) url = endpointUrl(patch.endpoint);
      } catch {}
    },
    onEvent(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    destroy() {
      queue = [];
      held = [];
      clearTimer();
      listeners.clear();
      win.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      win.removeEventListener("bitsnap:consent", onConsent);
      win.removeEventListener("bitsnap:consent:ready", onConsent);
    },
  };
}

// -- singleton ----------------------------------------------------------------

let instance: Tracker | undefined;
let instanceKey: string | null = null;

/**
 * Creates the page's tracker on the first call and returns that same tracker
 * afterwards. A later call with another `projectKey` is ignored (warns in
 * debug mode); a later call with `env`, `endpoint` or `enabled` updates the
 * running tracker. A malformed key is not remembered, so a later valid call still works.
 */
export function initTracker(options: TrackerOptions): Tracker {
  if (!instance) {
    const created = createTracker(options);
    if (created === noopTracker) return created;
    instance = created;
    instanceKey = normalizeProjectKey(options.projectKey ?? "");
    return created;
  }
  try {
    const key = normalizeProjectKey(options.projectKey ?? "");
    if (key !== instanceKey && options.debug) {
      console.warn("[bitsnap analytics]", "tracker already started for another projectKey, ignoring", options.projectKey);
    }
    if (key === instanceKey) {
      if (options.env || options.endpoint) instance.configure({ env: options.env, endpoint: options.endpoint });
      if (options.enabled != null) instance.setEnabled(options.enabled);
    }
  } catch {}
  return instance;
}

/** The tracker made by `initTracker`, if any. */
export function getTracker(): Tracker | undefined {
  return instance;
}

/** Destroys the singleton so that `initTracker` can build a fresh one (tests, hot reload). */
export function resetTracker() {
  if (typeof window !== "undefined") resetAutoPageViews(window);
  instance?.destroy();
  instance = undefined;
  instanceKey = null;
}

/**
 * `X-Bitsnap-Visitor` for a request that creates a checkout or payment link:
 * the client id of `projectKey` (default: the running tracker's project), only
 * while tracking is on and Bitsnap Consent grants analytics. Empty otherwise.
 */
export function visitorHeaders(projectKey?: string): Record<string, string> {
  try {
    if (typeof window === "undefined") return {};
    const tracker = instance;
    let id: string | null = null;
    if (tracker) {
      id = tracker.clientId(projectKey);
    } else {
      // No tracker of this bundle (e.g. only the analytics.js script runs): read the cookie it set.
      const key = projectKey ? normalizeProjectKey(projectKey) : null;
      id = key ? readVisitorId(window, key) : null;
    }
    return id ? { [VISITOR_HEADER]: id } : {};
  } catch {
    return {};
  }
}
