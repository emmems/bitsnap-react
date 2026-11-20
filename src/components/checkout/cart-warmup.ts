import type { QueryClient } from "@tanstack/react-query";
import {
  getCheckoutMethods,
  getProjectID,
  readCheckoutCountry,
  readLocalCartLines,
  readLocalCartSignature,
} from "./CartProvider";
import {
  cartCountriesQuery,
  cartPaymentMethodsQuery,
  cartProductsQuery,
} from "./cart-queries";

/**
 * Fills the drawer's query cache before the buyer opens it (plan part 1,
 * slice 4). It only fetches: nothing is charged, the price gate still asks the
 * server after the drawer opens, and no analytics event is sent.
 */

/** The `QueryClient` and locale of the mounted cart: what the drawer reads. */
type Target = { queryClient: QueryClient; locale: string };

let target: Target | undefined;

/** The mounted cart tells where to warm. Returns the way to forget it. */
export function registerWarmTarget(next: Target): () => void {
  target = next;
  return () => {
    if (target === next) target = undefined;
  };
}

/**
 * Prefetches what the first open needs for a non-empty cart: the products and
 * the countries, and with `full` also the payment options (a POST, so only on
 * intent). Cached and running queries are not asked again. Does nothing without
 * a mounted cart (so never on the server) or with an empty cart.
 */
export function warmCart(full = false): void {
  // Without a mounted cart (the server) there is no `document` to read.
  if (!target) return;
  const projectID = getProjectID();
  const lines = readLocalCartLines();
  if (!projectID || !lines.length) return;
  const { queryClient: client, locale } = target;
  const methods = getCheckoutMethods(projectID, locale);
  const country = full && readCheckoutCountry();
  void client.prefetchQuery(
    cartProductsQuery(projectID, locale, lines.map((l) => l.productID)),
  );
  void client.prefetchQuery(cartCountriesQuery(methods.getAvailableCountries));
  if (country) {
    void client.prefetchQuery(
      cartPaymentMethodsQuery(
        projectID,
        locale,
        country,
        readLocalCartSignature(),
        methods.getPaymentMethodChoice,
      ),
    );
  }
}

/** Runs `run` at the first idle moment (500 ms at the latest). Returns the way to cancel. */
export function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback == "function") {
    const id = requestIdleCallback(run, { timeout: 500 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(run, 500);
  return () => clearTimeout(id);
}
