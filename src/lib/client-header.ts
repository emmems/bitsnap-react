import type { Interceptor } from "@connectrpc/connect";
import { SDK_VERSION } from "../version";

export const CLIENT_HEADER_NAME = "X-Bitsnap-Client";
export const CLIENT_HEADER_VALUE = `bitsnap-react@${SDK_VERSION}`;

export const CLIENT_QUERY_PARAM = "bs_client";

/**
 * Spread into the `headers` of a fetch that already triggers a CORS preflight
 * (JSON POST, Connect RPC). Never use it on a simple cross-origin GET: the
 * custom header would force a preflight that older servers and merchant
 * proxies do not allow. Use `withClientParam` there.
 */
export const clientHeaders: Record<string, string> = {
  [CLIENT_HEADER_NAME]: CLIENT_HEADER_VALUE,
};

/** Connect interceptor adding the client header to every RPC. */
export const clientHeaderInterceptor: Interceptor = (next) => (req) => {
  req.header.set(CLIENT_HEADER_NAME, CLIENT_HEADER_VALUE);
  return next(req);
};

/** Adds `bs_client=<pkg>@<ver>` to a URL, for simple GETs that must stay preflight-free. */
export function withClientParam(url: string): string {
  const hash = url.indexOf("#");
  const base = hash === -1 ? url : url.slice(0, hash);
  const fragment = hash === -1 ? "" : url.slice(hash);
  const separator = base.includes("?") ? (/[?&]$/.test(base) ? "" : "&") : "?";
  return `${base}${separator}${CLIENT_QUERY_PARAM}=${encodeURIComponent(CLIENT_HEADER_VALUE)}${fragment}`;
}
