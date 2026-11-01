import { cn } from "@/src/lib/utils";
import { useCheckoutSlot } from "@/src/components/checkout/appearance.context";
import { useCheckoutTextResolver } from "@/src/components/checkout/texts.context";
import type { CheckoutTextKey } from "@/src/components/checkout/texts";

/** What an express button is doing, for the status line under it. */
export type ExpressPhase =
  | "idle"
  | "pending"
  | "confirmed"
  | "failed"
  | "cancelled"
  | "load-failed"
  | "cart-unavailable"
  | "cart-conflict"
  | "price-changed"
  | "product-unavailable";

const PHASE_TEXT: Record<Exclude<ExpressPhase, "idle">, CheckoutTextKey> = {
  pending: "expressPending",
  confirmed: "expressConfirmed",
  failed: "expressFailed",
  cancelled: "expressCancelled",
  "load-failed": "expressLoadFailed",
  "cart-unavailable": "expressCartUnavailable",
  "cart-conflict": "expressCartConflict",
  "price-changed": "expressPriceChanged",
  "product-unavailable": "expressProductUnavailable",
};

const ALERT_PHASES: ExpressPhase[] = [
  "failed",
  "cancelled",
  "load-failed",
  "cart-unavailable",
  "cart-conflict",
  "price-changed",
  "product-unavailable",
];

/**
 * The accessible line under an express button. Confirmations and "confirming"
 * are polite statuses; failures interrupt (`role="alert"`). The cart is never
 * cleared or claimed paid here.
 */
export function ExpressStatus({ phase }: { phase: ExpressPhase }) {
  const resolve = useCheckoutTextResolver();
  const errorSlot = useCheckoutSlot("error");
  if (phase === "idle") {
    return null;
  }
  const isAlert = ALERT_PHASES.includes(phase);
  return (
    <p
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      data-bitsnap-express-status={phase}
      className={cn(
        "w-full px-2 text-center text-sm",
        isAlert && "opacity-90",
        errorSlot.className,
      )}
      style={errorSlot.style}
    >
      {resolve(PHASE_TEXT[phase])}
    </p>
  );
}
