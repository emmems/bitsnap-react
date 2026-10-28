export function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}
