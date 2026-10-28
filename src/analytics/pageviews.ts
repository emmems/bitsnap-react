/**
 * Page-wide state of the automatic page views. It lives on `window`, so the
 * npm package, a second copy of it and the `analytics.js` script agree on who
 * reports a path and the history is patched once.
 */
type Registry = {
  /** Last path some starter reported. */
  path: string | null;
  starters: Set<() => void>;
  watching: boolean;
};

const REGISTRY = Symbol.for("bitsnap.pageViews");

function registry(win: Window): Registry {
  const holder = win as unknown as Record<symbol, Registry | undefined>;
  return (holder[REGISTRY] ??= { path: null, starters: new Set(), watching: false });
}

/** Calls `onChange` when the path changes through `history.pushState`/`replaceState` or Back/Forward. */
function watchNavigation(win: Window, onChange: () => void) {
  const check = () => {
    try {
      onChange();
    } catch {}
  };
  for (const name of ["pushState", "replaceState"] as const) {
    const original = win.history[name];
    win.history[name] = function (this: History, ...args: Parameters<History[typeof name]>) {
      const result = original.apply(this, args);
      check();
      return result;
    };
  }
  win.addEventListener("popstate", check);
}

/**
 * Calls `send` for the current path and again on every path change, unless
 * another starter on the page already reported that path: the page gets one
 * `page_view` per path change however many providers, components and embeds
 * start it. Returns the function that stops this starter.
 */
export function startAutoPageViews(send: () => void, win: Window = window): () => void {
  try {
    const reg = registry(win);
    const starter = () => send();
    if (!reg.watching) {
      reg.watching = true;
      watchNavigation(win, () => {
        const path = win.location.pathname;
        // Nobody listening: leave the path unreported so the next starter sends it.
        if (path === reg.path || reg.starters.size === 0) return;
        reg.path = path;
        reg.starters.values().next().value?.();
      });
    }
    reg.starters.add(starter);
    const path = win.location.pathname;
    if (path !== reg.path) {
      reg.path = path;
      starter();
    }
    return () => void reg.starters.delete(starter);
  } catch {
    return () => {};
  }
}

/** Forgets the reported path and the starters (tests, hot reload). The history patch stays. */
export function resetAutoPageViews(win: Window = window) {
  const reg = registry(win);
  reg.path = null;
  reg.starters.clear();
}
