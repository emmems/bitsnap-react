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
 * Anything else (a `var()` or `rgb()` background, a host's
 * `--bitsnap-checkout-background` in CSS read through `var()`) can be light or
 * dark, so the buttons take their outlined variants, which read on both.
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
