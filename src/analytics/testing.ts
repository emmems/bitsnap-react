import { JSDOM } from "jsdom";
import type { ClientEvent } from "./contract";

const GLOBALS = ["window", "document", "location", "history", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

export type Beacon = { url: string; type: string; body: string; parsed: { k: string; events: ClientEvent[] } };

/**
 * Fresh jsdom page installed as the global window, with `sendBeacon` and
 * `fetch` recorded. Event posts made by either count as "beacons".
 */
export function setupPage(
  url = "https://shop.example.test/products/shoes?utm_source=news&secret=1#top",
  referrer = "https://www.google.com/search?q=shoes",
) {
  for (const name of GLOBALS) {
    if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url, referrer });
  const win = dom.window;
  const sent: Beacon[] = [];
  const fetches: Array<{ url: string; init: RequestInit }> = [];
  const waiting: Array<{ url: string; data: Blob }> = [];
  let beaconResult = true;

  Object.assign(globalThis, { window: win, document: win.document, location: win.location, history: win.history });
  (win.navigator as unknown as { sendBeacon: unknown }).sendBeacon = (target: string, data: Blob) => {
    waiting.push({ url: target, data });
    return beaconResult;
  };
  const recordedFetch = (async (target: string, init: RequestInit) => {
    fetches.push({ url: target, init });
    // The tracker posts events with fetch keepalive; they count like beacons.
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (target.endsWith("/e") && typeof init?.body === "string" && headers["Content-Type"] === "text/plain") {
      waiting.push({ url: target, data: new Blob([init.body], { type: "text/plain" }) });
    }
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  globalThis.fetch = recordedFetch;

  /** Beacons sent so far, decoded (Blob#text is asynchronous). */
  async function beacons(): Promise<Beacon[]> {
    for (const { url: target, data } of waiting.splice(0)) {
      const body = await data.text();
      sent.push({ url: target, type: data.type, body, parsed: JSON.parse(body) });
    }
    return sent;
  }

  return {
    dom,
    win,
    fetches,
    beacons,
    /** Number of event posts (beacon or fetch) not decoded yet. */
    pendingBeacons: () => waiting.length,
    async events(): Promise<ClientEvent[]> {
      return (await beacons()).flatMap((b) => b.parsed.events);
    },
    setBeaconResult(value: boolean) {
      beaconResult = value;
    },
    /** `false` removes `fetch`, so the tracker has to fall back to `sendBeacon`. */
    setFetchAvailable(value: boolean) {
      if (value) globalThis.fetch = recordedFetch;
      else (globalThis as { fetch?: unknown }).fetch = undefined;
    },
  };
}

export function teardownPage() {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  saved.clear();
}
