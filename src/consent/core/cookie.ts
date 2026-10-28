import type { ConsentChoices, ConsentService, ConsentState } from "./types";

export const COOKIE_NAME = "bitsnap_consent";
export const COOKIE_MAX_AGE = 31536000;

/** `bitsnap_consent`, or `bitsnap_consent_<projectKey>` when the cookie is scoped to a project. */
export function cookieName(projectKey?: string, scope?: "global" | "project"): string {
  if (scope === "project" && projectKey) {
    return `${COOKIE_NAME}_${projectKey.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  }
  return COOKIE_NAME;
}

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

export function encodeState(state: ConsentState): string {
  return toBase64Url(
    JSON.stringify({ v: 1, id: state.id, ts: state.ts, bv: state.bv, c: state.c }),
  );
}

export function decodeState(value: string): ConsentState | null {
  try {
    const raw = JSON.parse(fromBase64Url(value));
    if (
      !raw ||
      raw.v !== 1 ||
      typeof raw.id !== "string" ||
      raw.id === "" ||
      typeof raw.ts !== "number" ||
      typeof raw.bv !== "number" ||
      !raw.c ||
      typeof raw.c.analytics !== "boolean" ||
      typeof raw.c.marketing !== "boolean" ||
      typeof raw.c.preferences !== "boolean"
    ) {
      return null;
    }
    return {
      id: raw.id,
      ts: raw.ts,
      bv: raw.bv,
      c: {
        analytics: raw.c.analytics,
        marketing: raw.c.marketing,
        preferences: raw.c.preferences,
      },
    };
  } catch {
    return null;
  }
}

/** The `Set-Cookie`-style string for `document.cookie`. */
export function serializeCookie(name: string, state: ConsentState, secure: boolean): string {
  return (
    `${name}=${encodeState(state)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax` +
    (secure ? "; Secure" : "")
  );
}

export function cookieNames(header: string): string[] {
  return header
    .split(";")
    .map((part) => part.split("=")[0].trim())
    .filter(Boolean);
}

/** Reads the consent from a `document.cookie` header. */
export function parseCookie(header: string, name: string): ConsentState | null {
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeState(part.slice(index + 1).trim());
    }
  }
  return null;
}

export function newConsentId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the random fallback
  }
  let id = "";
  for (let i = 0; i < 32; i++) id += Math.floor(Math.random() * 16).toString(16);
  return id;
}

export function readConsent(doc: Document, name: string): ConsentState | null {
  try {
    return parseCookie(doc.cookie, name);
  } catch {
    return null;
  }
}

export function writeConsent(doc: Document, name: string, state: ConsentState): void {
  try {
    doc.cookie = serializeCookie(name, state, doc.location?.protocol === "https:");
  } catch {
    // cookies blocked (sandboxed frame)
  }
}

export function clearConsent(doc: Document, name: string): void {
  try {
    doc.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // ignore
  }
}

/** `a.b.example.com` -> the host and every parent with at least two labels. */
export function domainCandidates(hostname: string): string[] {
  if (!hostname || /^[\d.]+$/.test(hostname) || hostname.includes(":")) return [];
  const labels = hostname.split(".");
  const result: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) result.push(labels.slice(i).join("."));
  return result;
}

/**
 * Best-effort deletion of cookies the withdrawn categories declared, on the
 * current host and its parent domains. A trailing `*` matches a name prefix.
 */
export function deleteServiceCookies(
  doc: Document,
  services: ConsentService[],
  categories: (keyof ConsentChoices)[],
): void {
  try {
    const wanted = services
      .filter((service) => categories.includes(service.category))
      .flatMap((service) => service.cookies ?? []);
    if (wanted.length === 0) return;
    const present = cookieNames(doc.cookie);
    const names = new Set<string>();
    for (const pattern of wanted) {
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1);
        for (const name of present) if (name.startsWith(prefix)) names.add(name);
      } else {
        names.add(pattern);
      }
    }
    const domains = domainCandidates(doc.location?.hostname ?? "");
    for (const name of names) {
      const base = `${encodeURIComponent(name)}=; Max-Age=0; Path=/`;
      doc.cookie = base;
      for (const domain of domains) {
        doc.cookie = `${base}; Domain=${domain}`;
        doc.cookie = `${base}; Domain=.${domain}`;
      }
    }
  } catch {
    // best effort
  }
}
