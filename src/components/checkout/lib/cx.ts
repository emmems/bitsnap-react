/**
 * Joins the truthy class names. The cart's own classes are `bsc-*` rules in an
 * unlayered sheet, with no Tailwind utility to resolve, so the cart needs no
 * `tailwind-merge` (plan part 2 step 11): a merchant's slot class is appended
 * as given.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
