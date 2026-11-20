/**
 * The hosts Bitsnap itself serves many merchants on. The one place that lists them.
 *
 * `bitsnap.site` is not on the Public Suffix List, so a browser accepts `Domain=bitsnap.site`
 * and would share the cookie between every seller. `sklep.bitsnap.pl` is the old shop address.
 */

/** Registrable domains Bitsnap runs: the site-wide consent choice on them (and their subdomains) is Bitsnap's own. */
export const BITSNAP_ROOTS: readonly string[] = ["bitsnap.pl", "bitsnap.site"];

/** Roots shared by many sellers: a cookie `Domain` on one of them, or on a host below one, would cross sellers. */
export const SHARED_COOKIE_ROOTS: readonly string[] = ["bitsnap.site", "sklep.bitsnap.pl"];

/** Lower case, without the one trailing dot of a fully qualified name (`nazwa.bitsnap.site.`). */
export function normalizeHost(hostname: string): string {
  const host = hostname.toLowerCase();
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

function isOrBelow(host: string, root: string): boolean {
  return host === root || host.endsWith(`.${root}`);
}

/** `bitsnap.pl`, `bitsnap.site` or a subdomain of either. */
export function isBitsnapHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  return BITSNAP_ROOTS.some((root) => isOrBelow(host, root));
}

/** A shared root itself or a host below one: a cookie `Domain` there is never written. */
export function isSharedCookieHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  return SHARED_COOKIE_ROOTS.some((root) => isOrBelow(host, root));
}
