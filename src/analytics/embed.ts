import { createTracker, isPageType, noopTracker, startAutoPageViews, type Tracker } from "./core";
import { sanitizePath, type Channel, type PageType, type Source } from "./contract";

/** What the `<script>` tag may claim with `data-source` and `data-channel` (a subset of the contract's enums). */
const EMBED_SOURCES = ["storefront", "dashboard", "script"] as const satisfies readonly Source[];
const EMBED_CHANNELS = ["hosted", "custom_domain", "embed", "panel"] as const satisfies readonly Channel[];
const VISITOR_ID_RE = /^[A-Za-z0-9_-]{22}$/;

function oneOf<T extends string>(allowed: readonly T[], value: string | undefined, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

type QueuedCall = ArrayLike<unknown>;

type BitsnapGlobal = {
  track: Tracker["track"];
  page: Tracker["page"];
  /** Calls made before the script loaded. Pushing after load runs the call at once. */
  q?: QueuedCall[] | { push(...calls: QueuedCall[]): number };
  loaded?: boolean;
};

declare global {
  interface Window {
    bitsnap?: Partial<BitsnapGlobal>;
  }
}

/** Starts the tracker from the `data-*` attributes of the embed `<script>` tag. */
export function init(script: HTMLElement | null): BitsnapGlobal | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const existing = window.bitsnap;
    if (existing?.loaded) return existing as BitsnapGlobal;

    const get = (name: string) => script?.getAttribute(`data-${name}`) || undefined;
    const env = get("env");
    const source = oneOf(EMBED_SOURCES, get("source"), "script");
    const channel = oneOf(EMBED_CHANNELS, get("channel"), "embed");
    const dashboard = source === "dashboard";
    // Only the dashboard brings its own visitor id (the hashed user id); anywhere else the collector computes it.
    const visitorId = get("visitor-id");
    const tracker = get("project")
      ? createTracker({
          projectKey: get("project")!,
          env: env === "live" || env === "test" ? env : undefined,
          endpoint: get("endpoint"),
          source,
          channel,
          visitorId: dashboard && visitorId && VISITOR_ID_RE.test(visitorId) ? visitorId : undefined,
        })
      : noopTracker;
    // Fixed route to report for every page_view of this script (otherwise derived from the URL).
    const routeTemplate = get("route-template");
    const pageType = get("page-type");
    const type: PageType | undefined = isPageType(pageType) ? pageType : undefined;

    let api: BitsnapGlobal;
    if (dashboard) {
      // `page_view` belongs to the storefront stream; the dashboard reports `app_page_view` with the route.
      const defaultType: PageType = type ?? "app";
      let previousRoute: string | undefined;
      api = {
        track: (event, props, extra) =>
          tracker.track(event, props, { ...extra, page_type: extra?.page_type ?? defaultType }),
        page: (pageTypeArg, extra) => {
          const route = sanitizePath((extra?.path ?? routeTemplate ?? dashboardRoute(location.pathname)).split(/[?#]/)[0]);
          tracker.track(
            "app_page_view",
            previousRoute && previousRoute !== route ? { route, previous_route: previousRoute } : { route },
            { ...extra, page_type: pageTypeArg ?? extra?.page_type ?? defaultType, path: route },
          );
          previousRoute = route;
        },
        loaded: true,
      };
    } else {
      api = {
        track: (event, props, extra) => tracker.track(event, props, extra),
        page: (pageTypeArg, extra) => tracker.page(pageTypeArg !== undefined ? pageTypeArg : type, extra),
        loaded: true,
      };
    }

    const run = (call: QueuedCall) => {
      try {
        const [method, ...args] = Array.prototype.slice.call(call) as [string, ...never[]];
        if (method === "track" || method === "page") (api[method] as (...a: unknown[]) => void)(...args);
      } catch {}
    };
    const queued = Array.isArray(existing?.q) ? existing!.q : [];
    window.bitsnap = api;
    queued.forEach(run);
    api.q = {
      push(...calls) {
        calls.forEach(run);
        return 0;
      },
    };

    // One page_view per path change for the whole page, also when the React provider runs too.
    if (get("auto") !== "off") startAutoPageViews(() => api.page(type ?? null));
    return api;
  } catch {
    return undefined;
  }
}

/** Dashboard sections whose next path segment is a record id. */
const COLLECTIONS = new Set([
  "products", "orders", "customers", "coupons", "discounts", "projects", "users", "members", "invoices",
  "returns", "carts", "subscriptions", "pages", "posts", "courses", "lessons", "notifications",
  "automations", "webhooks", "integrations", "themes", "newsletters", "campaigns", "forms", "categories",
  "collections", "variants", "tags", "reviews", "templates", "payments", "shipping", "tests", "partners",
]);
/** Segments that follow a collection but are views, not records. */
const ACTIONS = new Set([
  "new", "create", "add", "edit", "import", "export", "list", "settings", "stats", "overview", "all",
  "archive", "archived", "drafts", "preview", "duplicate", "bulk", "search",
]);
const HASHID_RE = /^[A-Za-z0-9_]{3,24}$/;

/**
 * The route of a dashboard page: the path with record ids folded into `:id`.
 * That is numeric segments, any segment containing a digit, and hashid-like
 * segments right after a known collection (`/app/orders/aB3xK9` -> `/app/orders/:id`).
 */
export function dashboardRoute(pathname: string): string {
  const segments = sanitizePath(pathname).split("/");
  return segments
    .map((segment, i) => {
      if (!segment || segment.startsWith(":")) return segment;
      if (/\d/.test(segment)) return ":id";
      const previous = segments[i - 1]?.toLowerCase();
      if (previous && COLLECTIONS.has(previous) && !ACTIONS.has(segment.toLowerCase()) && HASHID_RE.test(segment)) {
        return ":id";
      }
      return segment;
    })
    .join("/");
}

if (typeof document !== "undefined") {
  init(document.currentScript as HTMLElement | null);
}
