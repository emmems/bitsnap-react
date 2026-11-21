import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import {
  EXPRESS_PRODUCT_IDS,
  MANY_PRODUCT_IDS,
  installCheckoutMocks,
  seedCart,
} from "./mocks";

// Query parameters make every state reproducible:
//   ?scenario=default|light|tokens|elements|external-css|custom
//   ?cart=empty  -> empty cart
//   ?cart=many -> ten lines: the list scrolls, header and footer stay
//   ?host=preflight -> a host page with Tailwind v3 preflight and generic element rules
//   ?font=latin -> a host font with latin glyphs only (Polish letters fall back)
//   ?express=1 -> Apple Pay, Google Pay, InPost Pay and Revolut Pay answer "available"
//   ?css=cart -> only `bitsnap-react/cart/cart.css` instead of `dist/index.css`
//   ?consent=1 -> the Bitsnap consent banner (preview mode), hidden while the cart is open
//   ?unavailable=1 -> the checkout action answers with item-ids-not-found
//   ?latency=1500 -> loading state
//   ?fail=1 -> the products cannot be loaded
//   ?priceChange=1 -> the first price went up (open the cart once without it first)
//   ?missing=1 -> the last product is no longer sold (unavailable row)
//   ?buy=pending -> "Go to checkout" stays busy
//   ?country=none&countriesLatency=4000 -> no country yet: the hint under the button
//   ?presentation=drawer|dialog -> the right drawer (default) or the centred dialog (a bottom sheet on phones)
//   ?locale=pl -> the cart's locale (texts and country names)
//   ?open=1 -> opens the cart after the first render (screenshots)
//   ?theme=host -> a host page with its own variables; the cart follows them
//   ?theme=host&dark=1 -> the same page in its dark mode (class on <html>)
//   ?theme=shadcn(&dark=1) -> a shadcn/ui site; tokens are var(--background), ...
const params = new URLSearchParams(window.location.search);

// The package stylesheet: the whole one (default) or the cart's own.
const stylesheet =
  params.get("css") === "cart"
    ? import("bitsnap-react/cart/cart.css")
    : import("bitsnap-react/dist/index.css");
const theme = params.get("theme");
const hostTheme = theme === "host" || theme === "shadcn";
if (hostTheme) {
  document.documentElement.classList.add(theme === "shadcn" ? "shadcn-site" : "host-site");
  document.documentElement.classList.toggle("dark", params.get("dark") === "1");
}

if (params.get("host") === "preflight") {
  // Loaded after the package stylesheet: the host's rules come later, the harder case.
  void stylesheet.then(() => import("./preflight.css"));
}

if (params.get("font") === "latin") {
  // Only the printable ASCII glyphs of the font (Google Fonts `text=` subset):
  // "ą", "ż", "ł" ... must come from the fallback font.
  const ascii = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join("");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap&text=${encodeURIComponent(ascii)}`;
  document.head.appendChild(link);
  document.documentElement.classList.add("latin-font");
}

const express = params.get("express") === "1";
if (express && !("ApplePaySession" in window)) {
  // Only Safari has ApplePaySession. A stub that says "can pay", so Chromium
  // shows Apple's own button (drawn by Apple's script); a click does nothing.
  Object.assign(window, {
    ApplePaySession: class {
      static STATUS_SUCCESS = 0;
      static STATUS_FAILURE = 1;
      static canMakePayments() {
        return true;
      }
      static supportsVersion() {
        return true;
      }
    },
  });
}

installCheckoutMocks({
  unavailableProducts: params.get("unavailable") === "1",
  latencyMs: Number(params.get("latency") ?? 0) || undefined,
  failProducts: params.get("fail") === "1",
  priceChange: params.get("priceChange") === "1",
  missingProduct: params.get("missing") === "1",
  pendingBuy: params.get("buy") === "pending",
  countriesLatencyMs: Number(params.get("countriesLatency") ?? 0) || undefined,
  paymentLogos: params.get("logos") === "1",
  express,
});

if (params.get("cart") === "empty") {
  localStorage.removeItem("checkout");
} else {
  seedCart(
    params.get("cart") === "many" ? MANY_PRODUCT_IDS : express ? EXPRESS_PRODUCT_IDS : undefined,
    params.get("country") === "none" ? "" : "PL",
  );
}

void stylesheet.then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App
        initialScenario={hostTheme ? (theme as "host" | "shadcn") : ((params.get("scenario") as never) ?? "default")}
        initialPresentation={params.get("presentation") === "dialog" ? "dialog" : "drawer"}
        locale={params.get("locale") ?? undefined}
        openOnLoad={params.get("open") === "1"}
        consent={params.get("consent") === "1"}
      />
    </StrictMode>,
  ),
);
