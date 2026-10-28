import { resetTracker } from "./core";
import type { ClientEvent } from "./contract";
import { setupPage, teardownPage } from "./testing";

/** A valid project key (the hashed project id) for tests. */
export const TEST_KEY = "tstProj123";

const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/**
 * Installs a jsdom page as the global window, the way React DOM tests need it
 * (`IS_REACT_ACT_ENVIRONMENT`, element classes). Call before React DOM is imported.
 */
export function setupReactPage(url = "https://shop.example.test/products?utm_source=news") {
  const page = setupPage(url);
  const win = page.win as unknown as Record<string, unknown>;
  Object.assign(globalThis, {
    HTMLElement: win.HTMLElement,
    HTMLVideoElement: win.HTMLVideoElement,
    Element: win.Element,
    Node: win.Node,
    Event: win.Event,
    MouseEvent: win.MouseEvent,
    CustomEvent: win.CustomEvent,
    KeyboardEvent: win.KeyboardEvent,
    FocusEvent: win.FocusEvent,
    getComputedStyle: (win.getComputedStyle as typeof getComputedStyle).bind(win),
    MutationObserver: win.MutationObserver,
    NodeFilter: win.NodeFilter,
    localStorage: win.localStorage,
    sessionStorage: win.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  // DOM classes the page's libraries use (HTMLInputElement, ...), where Node has none of its own.
  for (const key of Object.getOwnPropertyNames(win)) {
    if (/^[A-Z]/.test(key) && !(key in globalThis)) {
      Object.defineProperty(globalThis, key, { value: win[key], configurable: true, writable: true });
    }
  }
  if (!("ResizeObserver" in globalThis)) {
    Object.assign(globalThis, {
      ResizeObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
  }
  const media = (win.HTMLMediaElement as { prototype: { load: () => void } } | undefined)?.prototype;
  if (media) media.load = () => {};
  (win.Element as { prototype: { scrollIntoView: () => void } }).prototype.scrollIntoView = () => {};
  return page;
}

export function teardownReactPage() {
  resetTracker();
  for (const name of ["localStorage", "sessionStorage"]) {
    delete (globalThis as Record<string, unknown>)[name];
  }
  teardownPage();
}

/** Collects what a component forwards through `analytics={{ onEvent }}`. */
export function collector() {
  const events: ClientEvent[] = [];
  return {
    events,
    onEvent: (event: ClientEvent) => void events.push(event),
    names: () => events.map((e) => e.event),
    named: (name: string) => events.filter((e) => e.event === name),
  };
}

/** Everything a visitor's device holds: cookies and both storages. */
export function deviceState(win: Window): string {
  const dump = (storage: Storage) =>
    JSON.stringify(Array.from({ length: storage.length }, (_, i) => storage.key(i)).sort());
  return [win.document.cookie, dump(win.localStorage), dump(win.sessionStorage)].join("|");
}

/**
 * Returns a description of every email-like string in the events, empty when
 * there is none. (`sdk` is `bitsnap-react@1.2.3`, which only looks like one.)
 */
export function findPII(events: ClientEvent[]): string[] {
  return events.flatMap((event) => {
    const { sdk: _sdk, ...rest } = event;
    return JSON.stringify(rest)
      .split(/"/)
      .filter((part) => EMAIL_LIKE.test(part))
      .map((part) => `${event.event}: ${part}`);
  });
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
