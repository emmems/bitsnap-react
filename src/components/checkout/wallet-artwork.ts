import { colorSchemeFor, type ResolvedCheckoutAppearance } from "./appearance";

/**
 * Artwork of the express buttons for the cart's panel (step 20 review S1).
 *
 * The panel colour is known only when the cart can read it:
 * - a hex `background` token (also the light preset's `#ffffff`): its
 *   luminance, the same guess as the `color-scheme` (`colorSchemeFor`);
 * - else a literal `colorScheme` token, `"light"` or `"dark"`;
 * - else, with no `background` token at all, the theme (default dark).
 *
 * Any other background token (`var()`, `rgb()`, a colour name) can be light
 * or dark, so the buttons take their outlined variants, which read on both.
 * A background set only in host CSS (no token) is invisible here and follows
 * the theme. A `colorScheme` such as `"light dark"` is not read as literal.
 * Google Pay has no outlined variant: its white button keeps a thin border of
 * its own, so it stays white there as on the dark panel.
 */
export type WalletArtwork = {
  applePay: "black" | "white" | "white-outline";
  googlePay: "black" | "white";
  revolutPay: "dark" | "light" | "light-outlined";
};

export function panelToneFor(
  appearance: Pick<ResolvedCheckoutAppearance, "theme" | "tokens">,
): "dark" | "light" | undefined {
  const { background, colorScheme } = appearance.tokens;
  const fromBackground = colorSchemeFor(background);
  if (fromBackground != null) {
    return fromBackground;
  }
  const scheme = colorScheme?.trim().toLowerCase();
  if (scheme === "light" || scheme === "dark") {
    return scheme;
  }
  return background == null ? appearance.theme : undefined;
}

export function walletArtworkFor(
  appearance: Pick<ResolvedCheckoutAppearance, "theme" | "tokens">,
): WalletArtwork {
  switch (panelToneFor(appearance)) {
    case "light":
      return { applePay: "black", googlePay: "black", revolutPay: "dark" };
    case "dark":
      return { applePay: "white", googlePay: "white", revolutPay: "light" };
    default:
      return {
        applePay: "white-outline",
        googlePay: "white",
        revolutPay: "light-outlined",
      };
  }
}
