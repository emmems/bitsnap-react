/**
 * Bitsnap merchant analytics: the wire contract.
 *
 * SOURCE OF TRUTH: instapay `apps/collector/src/contract.ts` (prose version:
 * `docs/merchant-analytics-contract.md`). This file is a verbatim copy of it
 * (everything below the next comment block). Do not edit it here: change
 * instapay's file and copy it over. `computeVisitorId` is pure but needs the
 * server secret; the browser never calls it, so bundlers drop it.
 */

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const LIMITS = {
  /** Events in one POST /e. */
  maxBatchEvents: 50,
  /** Body of one POST /e or /consent, in bytes. */
  maxBodyBytes: 64 * 1024,
  /** `JSON.stringify(props)` of one event, in UTF-16 code units. */
  maxPropsChars: 4096,
  maxPropString: 200,
  maxPropArray: 50,
  host: 253,
  path: 512,
  referrerHost: 253,
  utm: 100,
  refCode: 64,
  id: 64,
  sdk: 64,
  pageId: 32,
  region: 64,
  osBrowser: 32,
  /** Collector replaces a client `ts` farther than this from `received_at`. */
  tsSkewMs: 24 * 60 * 60 * 1000,
} as const;

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const STREAMS = [
  "storefront_events",
  "app_events",
  "business_events",
] as const;
export type Stream = (typeof STREAMS)[number];

export const ENVS = ["live", "test"] as const;
export type Env = (typeof ENVS)[number];

export const SOURCES = [
  "storefront",
  "sdk_react",
  "script",
  "server",
  "dashboard",
] as const;
export type Source = (typeof SOURCES)[number];

export const CHANNELS = [
  "hosted",
  "custom_domain",
  "embed",
  "api",
  "panel",
] as const;
export type Channel = (typeof CHANNELS)[number];

export const PAGE_TYPES = [
  "shop",
  "catalog",
  "product",
  "cart",
  "checkout",
  "payment",
  "panel",
  "course",
  "custom_page",
  "order",
  "returns",
  "app",
  "other",
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const DEVICE_TYPES = ["desktop", "mobile", "tablet", "other"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

/** Sources a browser may claim, per stream. `business_events` is server-only. */
export const SOURCES_FOR_STREAM: Record<Stream, readonly Source[]> = {
  storefront_events: ["storefront", "sdk_react", "script"],
  app_events: ["dashboard"],
  business_events: ["server"],
};

// ---------------------------------------------------------------------------
// Event catalogue
//
// Each prop is `<type>[?]`: type is `string`, `number`, `boolean`, `string[]`,
// `number[]` or `enum:a|b|c`; a trailing `?` makes the prop optional.
// Money is always integer minor units (`*_minor`, grosze/cents) + `currency`
// (ISO 4217, upper case). `product_id`, `variant_id` and `order_ref` live in
// the envelope, never in props. Strings never hold PII (see the prose doc).
// ---------------------------------------------------------------------------

const MONEY = { value_minor: "number", currency: "string" } as const;

/** Browser events from hosted pages (H), bitsnap-react (R) and the script (S). */
export const STOREFRONT_EVENT_SPEC = {
  page_view: { landing: "boolean" },
  product_list_viewed: { list_id: "string?", item_count: "number" },
  product_impression: {
    list_id: "string?",
    product_ids: "string[]",
    positions: "number[]",
  },
  product_clicked: { list_id: "string?", position: "number?" },
  product_view: {
    price_minor: "number",
    currency: "string",
    availability: "enum:in_stock|out_of_stock|preorder",
  },
  variant_selected: {},
  add_to_cart: { qty: "number", ...MONEY },
  remove_from_cart: { qty: "number", ...MONEY },
  cart_opened: { item_count: "number", ...MONEY },
  checkout_started: {
    item_count: "number",
    checkout_type: "enum:single|cart|link",
    ...MONEY,
  },
  checkout_step_completed: {
    step: "enum:contact|delivery|invoice|consents",
  },
  checkout_validation_error: { field: "string", rule: "string" },
  coupon_applied: { coupon_id: "string" },
  coupon_rejected: { coupon_id: "string?", reason: "string" },
  delivery_method_selected: { method: "string" },
  payment_method_selected: { gateway: "string", method: "string" },
  payment_submitted: { gateway: "string", method: "string" },
  apple_pay_clicked: {},
  apple_pay_result: { outcome: "enum:success|fail|cancel" },
  payment_returned: {
    gateway: "string",
    method: "string?",
    outcome: "enum:success|fail|cancel|pending",
    error_code: "string?",
  },
  availability_signup: {},
  panel_login: {},
  panel_order_viewed: {},
  panel_download: {},
  return_started: {},
  return_submitted: { reason_code: "string", item_count: "number" },
  course_opened: { course_id: "string" },
  lesson_started: {
    course_id: "string",
    lesson_id: "string",
    position: "number",
  },
  lesson_completed: {
    course_id: "string",
    lesson_id: "string",
    position: "number",
  },
  video_progress: {
    course_id: "string",
    lesson_id: "string",
    /** 25, 50, 75 or 100. */
    milestone: "number",
  },
  test_submitted: {
    course_id: "string",
    lesson_id: "string",
    score_bucket: "enum:0-24|25-49|50-74|75-99|100",
  },
  lesson_rated: {
    course_id: "string",
    lesson_id: "string",
    /** 1..5. */
    rating: "number",
  },
  /** Written by the collector's POST /consent, never sent to POST /e. */
  consent_updated: {
    consent_id: "string",
    action: "enum:accept_all|reject_all|custom|withdraw",
    analytics: "boolean",
    marketing: "boolean",
    preferences: "boolean",
    banner_version: "number",
  },
} as const;

/** Merchant behaviour in /app, sent through the same tracker core. */
export const APP_EVENT_SPEC = {
  app_page_view: { route: "string", previous_route: "string?" },
  insight_shown: { insight_type: "string", rank: "number", category: "string" },
  insight_clicked: {
    insight_type: "string",
    rank: "number",
    category: "string",
  },
  insight_dismissed: {
    insight_type: "string",
    rank: "number",
    category: "string",
  },
  checklist_step_viewed: { step: "string" },
  checklist_step_completed: { step: "string" },
  gateway_connect_started: { gateway: "string", step: "string?" },
  gateway_connect_completed: { gateway: "string", step: "string?" },
  gateway_connect_failed: {
    gateway: "string",
    step: "string?",
    error_code: "string?",
  },
  domain_connect_started: {},
  domain_connect_verified: {},
  domain_connect_failed: { error_code: "string?" },
  product_created: { product_type: "string?" },
  product_published: { product_type: "string?" },
  product_editor_section_opened: { section: "string" },
  feature_enabled: { feature: "string" },
  stats_viewed: { tab: "string" },
  stats_filter_changed: { tab: "string", filter: "string" },
  report_exported: { report: "string", format: "string?" },
  search_performed: { result_count: "number" },
  error_shown: { code: "string", route: "string" },
  help_opened: { topic: "string?" },
  ai_assistant_used: { topic: "string?" },
  member_invited: { role: "string" },
} as const;

const TX = {
  gateway: "string?",
  method: "string?",
  value_minor: "number?",
  currency: "string?",
} as const;
const SUB = {
  subscription_id: "string?",
  value_minor: "number?",
  currency: "string?",
} as const;

/**
 * Emitted by instapay only. The lower-cased `EventType` of
 * server/event-system/event.list.ts maps 1:1 to the first group.
 */
export const BUSINESS_EVENT_SPEC = {
  // Mirror of the event bus (EventType.X -> x.toLowerCase()).
  transaction_created: TX,
  transaction_success: TX,
  transaction_failure: { ...TX, error_code: "string?" },
  transaction_expired: TX,
  transaction_charge: TX,
  subscription_created: SUB,
  subscription_paused: SUB,
  subscription_resumed: SUB,
  subscription_updated: SUB,
  subscription_deleted: SUB,
  subscription_charge_paid: SUB,
  subscription_charge_failed: { ...SUB, error_code: "string?" },
  subscription_past_due: SUB,
  subscription_canceled: SUB,
  access_expires_in_3_days: {},
  access_expired: {},
  cart_recovery: { value_minor: "number?", currency: "string?" },
  testimonial_email_send: {},
  testimonial_fulfilled: {},
  partner_commission_earned: {
    partner_id: "string",
    commission_minor: "number",
    currency: "string",
  },
  // Added by the analytics work.
  checkout_session_created: {
    item_count: "number",
    checkout_type: "enum:single|cart|link",
    gateway: "string?",
    ...MONEY,
  },
  order_paid: {
    gateway: "string",
    method: "string?",
    item_count: "number?",
    /** UTC date (`YYYY-MM-DD`) the envelope `visitor_id` was computed for. */
    visitor_day: "string?",
    /** Every line of the order (public hashed product ids), at most 50. */
    items: "line_items?",
    ...MONEY,
  },
  refund_issued: {
    gateway: "string?",
    reason: "string?",
    ...MONEY,
  },
  return_requested: { item_count: "number", reason_code: "string?" },
  automation_run_completed: {
    automation_id: "string",
    status: "string",
    trigger: "string?",
  },
  notification_sent: { medium: "string", template: "string?" },
  notification_failed: {
    medium: "string",
    template: "string?",
    error_code: "string?",
  },
  recovery_email_sent: { step: "number?" },
  recovery_link_clicked: {},
  api_request: {
    /** Route template without ids or query, e.g. `/api/rpc/public.v1.PublicApiService/ListProducts`. */
    endpoint: "string",
    /** `X-Bitsnap-Client` value, absent when the caller sent none. */
    client: "string?",
    status: "number",
    latency_bucket: "enum:lt_50|lt_200|lt_1000|gte_1000",
    /** 1 for errors, <1 for sampled successes; rollups divide counts by it. */
    sample_rate: "number",
  },
} as const;

export const EVENT_SPEC_BY_STREAM = {
  storefront_events: STOREFRONT_EVENT_SPEC,
  app_events: APP_EVENT_SPEC,
  business_events: BUSINESS_EVENT_SPEC,
} as const;

export const EVENT_SPEC = {
  ...STOREFRONT_EVENT_SPEC,
  ...APP_EVENT_SPEC,
  ...BUSINESS_EVENT_SPEC,
} as const;

export type StorefrontEventName = keyof typeof STOREFRONT_EVENT_SPEC;
export type AppEventName = keyof typeof APP_EVENT_SPEC;
export type BusinessEventName = keyof typeof BUSINESS_EVENT_SPEC;
export type EventName = StorefrontEventName | AppEventName | BusinessEventName;

export const EVENT_NAMES = {
  storefront_events: Object.keys(STOREFRONT_EVENT_SPEC) as StorefrontEventName[],
  app_events: Object.keys(APP_EVENT_SPEC) as AppEventName[],
  business_events: Object.keys(BUSINESS_EVENT_SPEC) as BusinessEventName[],
} as const;

export const STREAM_FOR_EVENT: Record<EventName, Stream> = Object.fromEntries(
  STREAMS.flatMap((stream) =>
    (EVENT_NAMES[stream] as string[]).map((name) => [name, stream] as const),
  ),
) as Record<EventName, Stream>;

/** True for a catalogue event name; own keys only (`constructor`, `toString` are not events). */
export function isEventName(name: unknown): name is EventName {
  return typeof name === "string" && Object.hasOwn(STREAM_FOR_EVENT, name);
}

// -- props types, derived from the spec ------------------------------------

type PropPrimitives = {
  string: string;
  number: number;
  boolean: boolean;
  "string[]": string[];
  "number[]": number[];
  line_items: Array<{ product_id: string; qty: number; value_minor: number }>;
};
type SplitEnum<S extends string> = S extends `${infer H}|${infer R}`
  ? H | SplitEnum<R>
  : S;
type StripOpt<S extends string> = S extends `${infer B}?` ? B : S;
type ResolveProp<S extends string> =
  StripOpt<S> extends `enum:${infer E}`
    ? SplitEnum<E>
    : StripOpt<S> extends keyof PropPrimitives
      ? PropPrimitives[StripOpt<S>]
      : never;
type PropsFromSpec<S extends Record<string, string>> = {
  [K in keyof S as S[K] extends `${string}?` ? never : K]: ResolveProp<S[K]>;
} & {
  [K in keyof S as S[K] extends `${string}?` ? K : never]?: ResolveProp<S[K]>;
};

export type EventProps<E extends EventName> = PropsFromSpec<
  (typeof EVENT_SPEC)[E]
>;

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

/** Fields the emitter fills in. Everything else is derived by the collector. */
export interface ClientEvent<E extends EventName = EventName> {
  /** UUIDv7, generated by the emitter. Dedupe key. */
  event_id: string;
  event: E;
  /** Client clock, unix ms. */
  ts: number;
  schema_version: typeof SCHEMA_VERSION;
  env: Env;
  source: Source;
  channel: Channel;
  /** `<package>@<version>`, e.g. `bitsnap-react@1.9.0`. */
  sdk?: string | null;
  /** Random per page load, in memory only. */
  page_id?: string | null;
  page_type?: PageType | null;
  host?: string | null;
  /** Path without query string and fragment, already run through `sanitizePath`. */
  path?: string | null;
  referrer_host?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  ref_code?: string | null;
  product_id?: string | null;
  variant_id?: string | null;
  order_ref?: string | null;
  /** Object on the wire; the collector stores `JSON.stringify(props)`. */
  props: EventProps<E>;
  /**
   * Only honoured for `source: "dashboard"`: the hashed Clerk user id computed
   * by instapay and handed to the dashboard tracker. Ignored for every other
   * source (the collector computes `visitor_id` itself).
   */
  visitor_id?: string | null;
}

/** One row as stored in Basin (all three streams share this shape). */
export interface StoredEvent {
  event_id: string;
  event: EventName;
  /** Unix ms, client clock after `clampTs`. */
  ts: number;
  /** Unix ms, collector clock. */
  received_at: number;
  schema_version: number;
  /** Numeric database id. Resolved by the collector, never taken from the client. */
  project_id: number;
  env: Env;
  source: Source;
  channel: Channel;
  sdk: string | null;
  visitor_id: string | null;
  page_id: string | null;
  page_type: PageType | null;
  host: string | null;
  path: string | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  ref_code: string | null;
  country: string | null;
  region: string | null;
  device_type: DeviceType | null;
  os: string | null;
  browser: string | null;
  product_id: string | null;
  variant_id: string | null;
  order_ref: string | null;
  /** `JSON.stringify` of the props object. */
  props: string;
}

/** POST /e body. */
export interface IngestBody {
  /** Project key, see `normalizeProjectKey`. */
  k: string;
  events: ClientEvent[];
}

// ---------------------------------------------------------------------------
// Consent shapes
// ---------------------------------------------------------------------------

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
export type ConsentTextKey = (typeof CONSENT_TEXT_KEYS)[number];
export type ConsentTexts = Record<ConsentTextKey, string>;

export type ConsentCategory = "analytics" | "marketing" | "preferences";
export type ConsentChoice = Record<ConsentCategory, boolean>;

export type ConsentConfig = {
  version: number;
  theme: "auto" | "light" | "dark";
  accentColor?: string;
  position: "bottom" | "bottom-left" | "bottom-right";
  privacyPolicyUrl?: string;
  categories: { analytics: boolean; marketing: boolean; preferences: boolean };
  services: Array<{
    name: string;
    category: "analytics" | "marketing" | "preferences";
    cookies?: string[];
  }>;
  texts?: Partial<Record<"pl" | "en", Partial<ConsentTexts>>>;
  poweredBy: true;
};

/** Value of the consent cookie, JSON then base64url. */
export interface ConsentCookie {
  v: 1;
  /** Random consent id (also sent to POST /consent). */
  id: string;
  /** Unix seconds. */
  ts: number;
  /** Banner version (`ConsentConfig.version`) the visitor answered. */
  bv: number;
  c: ConsentChoice;
}

export const CONSENT_COOKIE_NAME = "bitsnap_consent";
export const CONSENT_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
export const CONSENT_ACTIONS = [
  "accept_all",
  "reject_all",
  "custom",
  "withdraw",
] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

/** POST /consent body. */
export interface ConsentLogBody {
  k: string;
  /** Same random id as `ConsentCookie.id`. 16 to 64 chars of `[A-Za-z0-9_-]`. */
  consent_id: string;
  action: ConsentAction;
  c: ConsentChoice;
  /** Banner version. */
  bv: number;
  /** Hostname the banner ran on. Collector overwrites it with the Origin host. */
  host: string;
  /** Unix SECONDS (like the cookie), not ms. */
  ts: number;
}

/** `bitsnap_consent`, or `bitsnap_consent_<projectKey>` for `data-scope="project"`. */
export function consentCookieName(scope: "site" | "project", projectKey?: string): string {
  if (scope === "project") {
    if (!projectKey) throw new Error("projectKey required for project scope");
    return `${CONSENT_COOKIE_NAME}_${normalizeProjectKey(projectKey)}`;
  }
  return CONSENT_COOKIE_NAME;
}

// ---------------------------------------------------------------------------
// Project key
// ---------------------------------------------------------------------------

/**
 * The project key is the existing public hashed project id
 * (`hashId(projectId)` in apps/bitsnap/queries/hashids.ts, the `projectID`
 * of bitsnap-react). A leading `pk_` is accepted and dropped so the
 * documented `pk_…` snippets work too. Returns null when it is not a plausible
 * key (hashids default alphabet).
 */
export function normalizeProjectKey(key: string): string | null {
  const bare = key.startsWith("pk_") ? key.slice(3) : key;
  return /^[A-Za-z0-9]{1,32}$/.test(bare) ? bare : null;
}

// ---------------------------------------------------------------------------
// X-Bitsnap-Client
// ---------------------------------------------------------------------------

const CLIENT_RE = /^([a-z][a-z0-9-]{0,39})@(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]{1,20})?)$/;

/** `<package>@<version>`, e.g. `bitsnap-react@1.9.0`. Also the shape of `sdk`. */
export function parseClientHeader(
  value: string | null | undefined,
): { package: string; version: string } | null {
  if (!value || value.length > LIMITS.sdk) return null;
  const m = CLIENT_RE.exec(value);
  return m ? { package: m[1], version: m[2] } : null;
}

// ---------------------------------------------------------------------------
// URL stripping
// ---------------------------------------------------------------------------

const MAX_QUERY_VALUE = LIMITS.utm;

/**
 * Campaign/ref value: trimmed, capped, null when empty or when it holds an "@"
 * (someone put an email in a tag). The collector runs every client-supplied
 * `utm_*` and `ref_code` through it again.
 */
export function cleanValue(v: string | null | undefined, max: number): string | null {
  if (v == null) return null;
  const t = v.trim();
  // An "@" means someone put an email in a campaign tag: drop the value.
  if (t.length === 0 || t.includes("@")) return null;
  return t.slice(0, max);
}

/**
 * Path sanitiser: no query, no fragment, capped. Opaque segments (24+ chars of
 * `[A-Za-z0-9_-]`, i.e. tokens in order/panel links) become `:token` and
 * segments containing `@` become `:email`.
 */
export function sanitizePath(pathname: string): string {
  const segments = pathname.split("/").map((seg) => {
    if (seg.includes("@") || seg.includes("%40")) return ":email";
    if (/^[A-Za-z0-9_-]{24,}$/.test(seg)) return ":token";
    return seg;
  });
  const joined = segments.join("/") || "/";
  return (joined.startsWith("/") ? joined : `/${joined}`).slice(0, LIMITS.path);
}

export interface UrlParts {
  host: string;
  /** Sanitised path, no query. */
  path: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  /** The `ref` query parameter. */
  ref_code: string | null;
}

/**
 * Parses a URL and keeps only what may leave the browser: host, sanitised path
 * and the `utm_*` and `ref` query parameters. Returns null for non-http(s) or
 * unparseable input. `base` resolves relative URLs.
 */
export function parseUrl(url: string, base?: string): UrlParts | null {
  let u: URL;
  try {
    u = new URL(url, base);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const q = u.searchParams;
  return {
    host: u.hostname.toLowerCase().slice(0, LIMITS.host),
    path: sanitizePath(u.pathname),
    utm_source: cleanValue(q.get("utm_source"), MAX_QUERY_VALUE),
    utm_medium: cleanValue(q.get("utm_medium"), MAX_QUERY_VALUE),
    utm_campaign: cleanValue(q.get("utm_campaign"), MAX_QUERY_VALUE),
    utm_content: cleanValue(q.get("utm_content"), MAX_QUERY_VALUE),
    utm_term: cleanValue(q.get("utm_term"), MAX_QUERY_VALUE),
    ref_code: cleanValue(q.get("ref"), LIMITS.refCode),
  };
}

/**
 * Returns the URL with userinfo, fragment and every query parameter removed
 * except `utm_*` and `ref`. Null when `url` is not a usable http(s) URL.
 */
export function stripUrl(url: string, base?: string): string | null {
  let u: URL;
  try {
    u = new URL(url, base);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const keep = new URLSearchParams();
  for (const [key, value] of u.searchParams) {
    if (key !== "ref" && !key.startsWith("utm_")) continue;
    const cleaned = cleanValue(value, MAX_QUERY_VALUE);
    if (cleaned != null) keep.append(key, cleaned);
  }
  const qs = keep.toString();
  return `${u.protocol}//${u.host}${sanitizePath(u.pathname)}${qs ? `?${qs}` : ""}`;
}

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/** A plain DNS hostname (lower-cased), or null: no scheme, port, path, userinfo or "@". */
export function cleanHostname(
  v: string | null | undefined,
  max: number = LIMITS.referrerHost,
): string | null {
  if (typeof v !== "string") return null;
  const h = v.trim().toLowerCase();
  return h.length > 0 && h.length <= max && HOSTNAME_RE.test(h) ? h : null;
}

/** Public hashed ids (`product_id`, `variant_id`, `order_ref`): URL-safe, at most `LIMITS.id`. */
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function cleanId(v: string | null | undefined): string | null {
  return typeof v === "string" && ID_RE.test(v) ? v : null;
}

/** Host of a referrer URL, or null (also null for non-http(s) referrers). */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.toLowerCase().slice(0, LIMITS.referrerHost);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Bot rule
// ---------------------------------------------------------------------------

const BOT_UA =
  /bot\b|crawl|spider|slurp|facebookexternalhit|bingpreview|headless|phantomjs|lighthouse|pagespeed|gtmetrix|pingdom|uptime|statuscake|monitor|preview|scrapy|curl\/|wget|python-|go-http-client|java\/|okhttp|axios|node-fetch|undici|libwww|httpclient|aiohttp|postman|insomnia/i;

/** True when the User-Agent is empty or looks automated. Such events are dropped. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.trim().length === 0) return true;
  return BOT_UA.test(ua);
}

// ---------------------------------------------------------------------------
// visitor_id
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

async function hmacSha256(
  key: Uint8Array,
  message: string,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)),
  );
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `YYYY-MM-DD` of a unix-ms timestamp in UTC. */
export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * IP as hashed: lower-case; IPv4 unchanged; IPv4-mapped IPv6 (`::ffff:1.2.3.4`
 * or `::ffff:102:304`) becomes plain IPv4; any other IPv6, including one with
 * an embedded dotted quad (`64:ff9b::1.2.3.4`), is cut to its /64 (first four
 * hextets, canonical form `a:b:c:d::`). Both the Worker and the instapay
 * server MUST call this on the client IP before `computeVisitorId`.
 */
export function normalizeIp(ip: string): string {
  let s = ip.trim().toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (!s.includes(":")) return s; // plain IPv4 (or not an IP at all)

  // Embedded dotted quad in the last 32 bits: turn it into two hextets.
  const quad = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (quad) {
    const o = [quad[2], quad[3], quad[4], quad[5]].map(Number);
    if (o.some((n) => n > 255)) return s;
    const hex = (hi: number, lo: number) => (hi * 256 + lo).toString(16);
    s = `${quad[1]}${hex(o[0], o[1])}:${hex(o[2], o[3])}`;
  }

  const [head, tail] = s.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const fill =
    tail === undefined ? 0 : Math.max(0, 8 - headParts.length - tailParts.length);
  const groups = [...headParts, ...Array<string>(fill).fill("0"), ...tailParts];
  if (groups.length !== 8) return s;
  const h = groups.map((g) => Number.parseInt(g, 16) || 0);

  // ::ffff:a.b.c.d in hex form.
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    return `${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`;
  }
  return `${h
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::`;
}

/**
 * Cookieless visitor id, identical in the Worker and the instapay server.
 *
 *   day_secret = HMAC-SHA256(key = utf8(masterSecret), msg = utf8("YYYY-MM-DD"))   // 32 raw bytes
 *   visitor_id = base64url(HMAC-SHA256(key = day_secret, msg = utf8(ip + "\n" + ua + "\n" + projectId))).slice(0, 22)
 *
 * `dateUtc` is the UTC date of the request; `ip` is `normalizeIp(<client IP>)`;
 * `ua` is the raw `User-Agent` request header; `projectId` is the decimal
 * numeric project id.
 */
export async function computeVisitorId(
  masterSecret: string,
  dateUtc: string,
  ip: string,
  ua: string,
  projectId: number | string,
): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateUtc)) {
    throw new Error(`dateUtc must be YYYY-MM-DD, got ${dateUtc}`);
  }
  const daySecret = await hmacSha256(encoder.encode(masterSecret), dateUtc);
  const mac = await hmacSha256(daySecret, `${ip}\n${ua}\n${projectId}`);
  return base64url(mac).slice(0, 22);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_ID_RE = /^[A-Za-z0-9_-]{8,32}$/;
/** A letter TLD is required: `bitsnap-react@1.9.0` and `v@1.2` are not addresses. */
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[A-Za-z]{2,}\b/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nullableString(
  e: Record<string, unknown>,
  key: string,
  max: number,
): string | null {
  const v = e[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return `bad_${key}`;
  return v.length > max ? `too_long_${key}` : null;
}

function checkPropValue(spec: string, value: unknown): boolean {
  const optional = spec.endsWith("?");
  const type = optional ? spec.slice(0, -1) : spec;
  if (type.startsWith("enum:")) {
    return typeof value === "string" && type.slice(5).split("|").includes(value);
  }
  switch (type) {
    case "string":
      return typeof value === "string" && value.length <= LIMITS.maxPropString;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "string[]":
      return (
        Array.isArray(value) &&
        value.length <= LIMITS.maxPropArray &&
        value.every((x) => typeof x === "string" && x.length <= LIMITS.maxPropString)
      );
    case "number[]":
      return (
        Array.isArray(value) &&
        value.length <= LIMITS.maxPropArray &&
        value.every((x) => typeof x === "number" && Number.isFinite(x))
      );
    case "line_items":
      return (
        Array.isArray(value) &&
        value.length <= LIMITS.maxPropArray &&
        value.every(
          (x) =>
            isRecord(x) &&
            typeof x.product_id === "string" &&
            ID_RE.test(x.product_id) &&
            isNonNegativeSafeInteger(x.qty) &&
            isNonNegativeSafeInteger(x.value_minor),
        )
      );
    default:
      return false;
  }
}

function isNonNegativeSafeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** True when `value` looks like an email address (also exported for the collector's re-checks). */
export function looksLikeEmail(value: string): boolean {
  // A well-formed `<package>@<version>` client id is never an address.
  if (parseClientHeader(value) !== null) return false;
  return EMAIL_LIKE.test(value);
}

function hasEmailLike(value: unknown): boolean {
  if (typeof value === "string") return looksLikeEmail(value);
  if (Array.isArray(value)) return value.some(hasEmailLike);
  if (isRecord(value)) return Object.values(value).some(hasEmailLike);
  return false;
}

/**
 * Validates `props` against the catalogue and returns a copy without keys the
 * catalogue does not know (forward compatibility: a newer SDK adding an
 * optional prop must not get its events dropped by an older collector).
 * Fails on missing required props, wrong types, bad enum values, oversize
 * props and string values that look like an email address.
 */
export function sanitizeProps(
  event: string,
  props: unknown,
): { ok: true; props: Record<string, unknown> } | { ok: false; reason: string } {
  if (!isEventName(event)) return { ok: false, reason: "unknown_event" };
  const spec = (EVENT_SPEC as Record<string, Record<string, string>>)[event];
  if (!spec) return { ok: false, reason: "unknown_event" };
  if (!isRecord(props)) return { ok: false, reason: "bad_props" };
  const out: Record<string, unknown> = {};
  for (const [key, type] of Object.entries(spec)) {
    const value = props[key];
    if (value === undefined || value === null) {
      if (!type.endsWith("?")) return { ok: false, reason: `props_missing_${key}` };
      continue;
    }
    if (!checkPropValue(type, value)) return { ok: false, reason: `props_bad_${key}` };
    if (hasEmailLike(value)) return { ok: false, reason: `props_pii_${key}` };
    out[key] =
      type.startsWith("line_items") && Array.isArray(value)
        ? value.map((x) => ({ product_id: x.product_id, qty: x.qty, value_minor: x.value_minor }))
        : value;
  }
  if (JSON.stringify(out).length > LIMITS.maxPropsChars) {
    return { ok: false, reason: "props_too_large" };
  }
  return { ok: true, props: out };
}

export interface ValidateOptions {
  /**
   * Who sent it. `browser` (default) is POST /e: the event must belong to
   * `storefront_events` or `app_events`, `consent_updated` is refused (only
   * POST /consent writes it) and `source` must fit the stream. `server` is the
   * instapay emitter: any stream, `source` must fit the stream.
   */
  from?: "browser" | "server";
}

/**
 * Validates the emitter-controlled part of an event: names, types, enums,
 * lengths, the event/source/stream pairing and `props`. It does not check
 * that `ts` is plausible (use `clampTs`), origins or project keys.
 */
export function validateEnvelope(
  e: unknown,
  options: ValidateOptions = {},
): ValidationResult {
  const from = options.from ?? "browser";
  const fail = (reason: string): ValidationResult => ({ ok: false, reason });
  if (!isRecord(e)) return fail("not_object");

  if (typeof e.event_id !== "string" || !UUID_V7.test(e.event_id)) {
    return fail("bad_event_id");
  }
  if (!isEventName(e.event)) return fail("unknown_event");
  const stream = STREAM_FOR_EVENT[e.event as EventName];
  if (from === "browser") {
    if (stream === "business_events") return fail("server_only_event");
    if (e.event === "consent_updated") return fail("consent_via_consent_endpoint");
  }
  if (
    typeof e.ts !== "number" ||
    !Number.isInteger(e.ts) ||
    e.ts <= 0 ||
    e.ts > 4e12
  ) {
    return fail("bad_ts");
  }
  if (e.schema_version !== SCHEMA_VERSION) return fail("bad_schema_version");
  if (!ENVS.includes(e.env as Env)) return fail("bad_env");
  if (!SOURCES.includes(e.source as Source)) return fail("bad_source");
  if (!SOURCES_FOR_STREAM[stream].includes(e.source as Source)) {
    return fail("source_not_allowed_for_event");
  }
  if (!CHANNELS.includes(e.channel as Channel)) return fail("bad_channel");

  if (e.sdk != null) {
    if (typeof e.sdk !== "string" || parseClientHeader(e.sdk) === null) {
      return fail("bad_sdk");
    }
  }
  if (e.page_id != null) {
    if (typeof e.page_id !== "string" || !PAGE_ID_RE.test(e.page_id)) {
      return fail("bad_page_id");
    }
  }
  if (e.page_type != null && !PAGE_TYPES.includes(e.page_type as PageType)) {
    return fail("bad_page_type");
  }
  if (from === "browser") {
    if (typeof e.host !== "string" || e.host.length === 0) return fail("bad_host");
    if (typeof e.path !== "string" || !e.path.startsWith("/")) return fail("bad_path");
  }
  if (typeof e.path === "string" && e.path.includes("?")) return fail("path_has_query");
  if (typeof e.path === "string" && e.path.includes("#")) return fail("path_has_fragment");

  const lengths: Array<[string, number]> = [
    ["host", LIMITS.host],
    ["path", LIMITS.path],
    ["referrer_host", LIMITS.referrerHost],
    ["utm_source", LIMITS.utm],
    ["utm_medium", LIMITS.utm],
    ["utm_campaign", LIMITS.utm],
    ["utm_content", LIMITS.utm],
    ["utm_term", LIMITS.utm],
    ["ref_code", LIMITS.refCode],
    ["product_id", LIMITS.id],
    ["variant_id", LIMITS.id],
    ["order_ref", LIMITS.id],
  ];
  for (const [key, max] of lengths) {
    const problem = nullableString(e, key, max);
    if (problem) return fail(problem);
  }
  if (e.visitor_id != null) {
    if (typeof e.visitor_id !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(e.visitor_id)) {
      return fail("bad_visitor_id");
    }
  }

  const props = sanitizeProps(e.event, e.props);
  if (!props.ok) return fail(props.reason);
  return { ok: true };
}

/** Client `ts` as stored: replaced by `receivedAt` when more than 24 h away from it. */
export function clampTs(ts: number, receivedAt: number): number {
  return Math.abs(ts - receivedAt) > LIMITS.tsSkewMs ? receivedAt : ts;
}
