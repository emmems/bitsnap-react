/**
 * New idempotency key for one return submission. Uses `crypto.randomUUID`
 * where available and falls back to random bytes (or `Math.random` as the last
 * resort) so older browsers and non-secure contexts keep working. Keys stay
 * well below the 128 character backend limit.
 */
export function createIdempotencyKey(): string {
  const cryptoObject: Crypto | undefined =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  if (typeof cryptoObject?.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoObject?.getRandomValues === "function") {
    cryptoObject.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
