import { needsClickToLoad } from "./constants";

/**
 * Downloads a display copy with byte progress (no three here; `Viewer3D`
 * parses the buffer). The total comes from Content-Length, else from the size
 * the server reported (`previewSize`).
 */
export async function fetchModel(
  url: string,
  options: {
    signal?: AbortSignal;
    expectedSize?: number;
    onProgress?: (loaded: number, total: number) => void;
  } = {},
): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    signal: options.signal,
    credentials: "omit",
  });
  if (!response.ok)
    throw new Error(`model download failed: ${response.status}`);
  const header = Number(response.headers.get("content-length"));
  const total =
    Number.isFinite(header) && header > 0
      ? header
      : (options.expectedSize ?? 0);
  if (response.body == null) {
    const buffer = await response.arrayBuffer();
    options.onProgress?.(buffer.byteLength, buffer.byteLength);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  options.onProgress?.(0, total);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    options.onProgress?.(loaded, Math.max(total, loaded));
  }
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer.buffer;
}

const prefetched = new Set<string>();

/**
 * Warms the HTTP cache with another variant's model when the buyer points at
 * its chip (plan N5: on hover/focus only, never on idle). Models over the
 * click-to-load limit are never prefetched.
 */
export function prefetchModel(url: string | undefined, size: number): void {
  if (url == null || prefetched.has(url) || needsClickToLoad(size)) return;
  if (typeof window === "undefined") return;
  // Save-Data and slow connections skip it.
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? ""))
    return;
  prefetched.add(url);
  fetch(url, { credentials: "omit", priority: "low" } as RequestInit).catch(
    () => {
      prefetched.delete(url);
    },
  );
}
