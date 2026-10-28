import { domainCandidates } from "../consent/core/cookie";
import { clientIdCookieName } from "./contract";
import { randomBytes } from "./random";

/** The part of `window.BitsnapConsent` (`bitsnap-react/consent`) the tracker reads. */
export type ConsentLike = {
  /** Absent on a consent script older than 1.9.0, which never counts as the project's banner. */
  scope?: "global" | "project";
  projectKey?: string | null;
  get(): { c: { analytics?: boolean } } | null;
  /** Also true for a refusal made on an older banner version, which `get()` no longer returns. */
  denied?(category: "analytics"): boolean;
  ready?: Promise<unknown>;
};

/** Sent to the Bitsnap server on the requests that create a checkout or payment link. */
export const VISITOR_HEADER = "X-Bitsnap-Visitor";
// 390 days, under the 13 months CNIL allows. Set once, never extended.
const MAX_AGE_SECONDS = 390 * 24 * 60 * 60;
const VISITOR_ID_RE = /^[A-Za-z0-9_-]{22}$/;

export function consentApi(win: Window): ConsentLike | undefined {
  return (win as unknown as { BitsnapConsent?: ConsentLike }).BitsnapConsent;
}

function readCookie(doc: Document, name: string): string | null {
  for (const part of doc.cookie.split(";")) {
    const index = part.indexOf("=");
    if (index !== -1 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/** bitsnap.pl and its subdomains: many merchants share them, and the site-wide choice is bitsnap's own. */
function isBitsnapHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "bitsnap.pl" || host.endsWith(".bitsnap.pl");
}

/**
 * Whether the page's consent banner speaks for `projectKey`: a project-scope banner of that
 * key, or a site-scope banner on a merchant's own site. On bitsnap.pl a site-scope choice is
 * bitsnap's own, so only a project-scope one counts.
 */
export function consentBelongsTo(win: Window, projectKey: string): boolean {
  try {
    const api = consentApi(win);
    if (!api) return false;
    if (api.scope === "project") return api.projectKey === projectKey;
    const onBitsnap = isBitsnapHost(win.location.hostname);
    if (api.scope === "global") return !onBitsnap;
    // A consent script from before the scope info: it cannot be told apart from another project's banner.
    return false;
  } catch {
    return false;
  }
}

/** `true` only while a banner that speaks for `projectKey` holds a valid choice that grants `analytics`. */
export function analyticsGranted(win: Window, projectKey: string): boolean {
  try {
    return consentApi(win)?.get()?.c.analytics === true && consentBelongsTo(win, projectKey);
  } catch {
    return false;
  }
}

/** 16 random bytes as 22 base64url characters. */
export function newVisitorId(): string {
  let binary = "";
  randomBytes(16).forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Value of the `bs_vid_<projectKey>` cookie, whatever it holds; `null` when it is absent. */
function rawVisitorCookie(doc: Document, projectKey: string): string | null {
  try {
    return readCookie(doc, clientIdCookieName(projectKey));
  } catch {
    return null;
  }
}

/** The project's client id from its first-party cookie (`bs_vid_<projectKey>`), or `null` if absent or malformed. */
export function readVisitorCookie(doc: Document, projectKey: string): string | null {
  const value = rawVisitorCookie(doc, projectKey);
  return value !== null && VISITOR_ID_RE.test(value) ? value : null;
}

/**
 * Sets the cookie on the widest registrable domain the browser accepts
 * (shortest suffix with two labels first, so `shop.example.co.uk` skips the
 * refused `co.uk`), host-only where no domain sticks (localhost, IP hosts).
 */
export function writeVisitorCookie(win: Window, projectKey: string, id: string): void {
  try {
    const doc = win.document;
    const base =
      `${clientIdCookieName(projectKey)}=${id}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax` +
      (win.location.protocol === "https:" ? "; Secure" : "");
    for (const domain of domainCandidates(win.location.hostname).reverse()) {
      doc.cookie = `${base}; Domain=${domain}`;
      if (readVisitorCookie(doc, projectKey) === id) return;
    }
    doc.cookie = base;
  } catch {
    // cookies blocked (sandboxed frame)
  }
}

/** Expires the cookie on the host and on every parent domain it may have been set on. */
export function deleteVisitorCookie(win: Window, projectKey: string): void {
  try {
    const doc = win.document;
    // Present under any value: a malformed one must go too.
    if (rawVisitorCookie(doc, projectKey) === null) return;
    const base =
      `${clientIdCookieName(projectKey)}=; Max-Age=0; Path=/; SameSite=Lax` +
      (win.location.protocol === "https:" ? "; Secure" : "");
    doc.cookie = base;
    for (const domain of domainCandidates(win.location.hostname)) doc.cookie = `${base}; Domain=${domain}`;
  } catch {
    // best effort
  }
}

/**
 * The project's client id to send, or `null`: analytics consent is granted,
 * Global Privacy Control is off, the browser is not automated and the cookie exists.
 */
export function readVisitorId(win: Window, projectKey: string): string | null {
  try {
    const nav = win.navigator as { globalPrivacyControl?: boolean; webdriver?: boolean } | undefined;
    if (nav?.globalPrivacyControl === true || nav?.webdriver === true) return null;
    return analyticsGranted(win, projectKey) ? readVisitorCookie(win.document, projectKey) : null;
  } catch {
    return null;
  }
}
