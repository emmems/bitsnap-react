/**
 * How the cart is presented. One `CartFrame` serves both; the differences are
 * CSS keyed on `data-bitsnap-checkout-presentation` (PLAN D7).
 */
export type CartPresentation = "drawer" | "dialog";

/**
 * The compact layout: phones, also in landscape (PLAN D8). The drawer is full
 * screen there, the dialog a bottom sheet. `cart.css` writes the same query.
 */
export const COMPACT_QUERY = "(max-width: 639.98px), (max-height: 500px)";

/**
 * `"dialog"` stays `"dialog"`; anything else (omitted, a typo, a value from
 * untyped code) is `"drawer"`. No warning for an unknown value: the cart-only
 * JS budget has no room for one, and the type already rejects it.
 */
export function resolvePresentation(value: unknown): CartPresentation {
  return value === "dialog" ? "dialog" : "drawer";
}
