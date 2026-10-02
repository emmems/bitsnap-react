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
const params = new URLSearchParams(window.location.search);

installCheckoutMocks({
  unavailableProducts: params.get("unavailable") === "1",
  latencyMs: Number(params.get("latency") ?? 0) || undefined,
});

if (params.get("cart") === "empty") {
  localStorage.removeItem("checkout");
} else {
  seedCart();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App initialScenario={(params.get("scenario") as never) ?? "default"} />
  </StrictMode>,
);
