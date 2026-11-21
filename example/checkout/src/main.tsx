import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "bitsnap-react/dist/index.css";
import App from "./App";
import { installCheckoutMocks, seedCart } from "./mocks";

// Query parameters make every state reproducible:
//   ?scenario=default|light|tokens|elements|external-css
//   ?cart=empty  -> empty cart
//   ?unavailable=1 -> the checkout action answers with item-ids-not-found
//   ?latency=1500 -> loading state
//   ?fail=1 -> the products cannot be loaded
//   ?priceChange=1 -> the first price went up (open the cart once without it first)
//   ?missing=1 -> the last product is no longer sold (unavailable row)
//   ?buy=pending -> "Go to checkout" stays busy
//   ?country=none&countriesLatency=4000 -> no country yet: the hint under the button
//   ?presentation=dialog -> the centred dialog (a bottom sheet on phones)
//   ?locale=pl -> the cart's locale (texts and country names)
//   ?open=1 -> opens the cart after the first render (screenshots)
//   ?theme=host -> a host page with its own variables; the cart follows them
//   ?theme=host&dark=1 -> the same page in its dark mode (class on <html>)
//   ?theme=shadcn(&dark=1) -> a shadcn/ui site; tokens are var(--background), ...
const params = new URLSearchParams(window.location.search);
const theme = params.get("theme");
const hostTheme = theme === "host" || theme === "shadcn";
if (hostTheme) {
  document.documentElement.classList.add(theme === "shadcn" ? "shadcn-site" : "host-site");
  document.documentElement.classList.toggle("dark", params.get("dark") === "1");
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
});

if (params.get("cart") === "empty") {
  localStorage.removeItem("checkout");
} else {
  seedCart(undefined, params.get("country") === "none" ? "" : "PL");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App
      initialScenario={hostTheme ? (theme as "host" | "shadcn") : ((params.get("scenario") as never) ?? "default")}
      initialPresentation={params.get("presentation") === "dialog" ? "dialog" : "drawer"}
      locale={params.get("locale") ?? undefined}
      openOnLoad={params.get("open") === "1"}
    />
  </StrictMode>,
);
