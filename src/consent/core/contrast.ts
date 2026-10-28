function parse(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.replace(/./g, "$&$&");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two `#rgb` / `#rrggbb` colors. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white text, whichever reads better on `background`. */
export function onColor(background: string): string {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#111111")
    ? "#ffffff"
    : "#111111";
}
