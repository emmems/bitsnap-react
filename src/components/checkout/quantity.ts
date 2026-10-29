export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 99;

/** Keeps a quantity a whole number in 1..99. */
export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_QUANTITY;
  }
  return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.trunc(value)));
}

/**
 * The quantity a typed value stands for. An empty or non-numeric value keeps
 * the `current` one; anything else is clamped to 1..99.
 */
export function quantityFromInput(raw: string, current: number): number {
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? current : clampQuantity(parsed);
}
