import type { SelectedReturnLine } from "./state-machine";

/** Keeps a typed quantity inside `0..max`. Non-numeric input becomes `0`. */
export function clampQuantity(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.trunc(value)), Math.max(0, max));
}

/** A line can be selected only when it is eligible and has quantity left. */
export function isLineSelectable(line: {
  eligible: boolean;
  availableQuantity: number;
}): boolean {
  return line.eligible && line.availableQuantity > 0;
}

/** Lines with a positive quantity, in the order of the order's lines. */
export function toSelectedLines(
  lineIds: readonly string[],
  quantities: Readonly<Record<string, number>>,
): SelectedReturnLine[] {
  return lineIds
    .map((lineId) => ({ lineId, quantity: quantities[lineId] ?? 0 }))
    .filter((line) => line.quantity > 0);
}
