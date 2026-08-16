import { getAllowedReturnOrigins } from "./config";

const RETURN_URL_PARAM = "return_url";
const RETURN_URL_STORAGE_KEY = "__return_url";
const ACCESS_TOKEN_PARAM = "accessToken";

export function getReturnURLFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get(RETURN_URL_PARAM);
  if (!raw) return null;
  return validateReturnURL(raw);
}

export function persistReturnURL(returnURL: string | null): void {
  if (typeof window === "undefined") return;
  if (returnURL) {
    window.sessionStorage.setItem(RETURN_URL_STORAGE_KEY, returnURL);
  } else {
    window.sessionStorage.removeItem(RETURN_URL_STORAGE_KEY);
  }
}

export function readPersistedReturnURL(): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.sessionStorage.getItem(RETURN_URL_STORAGE_KEY);
  if (!stored) return null;
  return validateReturnURL(stored);
}

function validateReturnURL(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!getAllowedReturnOrigins().includes(u.origin)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function buildAccessTokenRedirect(
  returnURL: string,
  accessToken: string,
): string {
  const u = new URL(returnURL);
  u.searchParams.set(ACCESS_TOKEN_PARAM, accessToken);
  return u.toString();
}
