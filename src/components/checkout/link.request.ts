/**
 * The body of `/buy`: what `createPaymentURL` and `createCheckout` send, and
 * the public `LinkRequest` type. Plain types (before 1.32.0 they were
 * `z.infer` of a zod schema that was never parsed at runtime, and the schema
 * made the package's `.d.ts` import zod).
 *
 * The shape is the schema's output type, field for field: `delivery[].price`
 * is in major units (the cart multiplies by 100 on the way out), and
 * `additionalAgreements[].required` is a plain `boolean`.
 */

export type LinkAddress = {
  name?: string | undefined;
  line1?: string | undefined;
  line2?: string | undefined;
  city?: string | undefined;
  zipCode?: string | undefined;
  country?: string | undefined;
};

export type LinkBillingAddress = {
  nip?: string | undefined;
  name?: string | undefined;
  line1?: string | undefined;
  line2?: string | undefined;
  city?: string | undefined;
  zipCode?: string | undefined;
};

export enum BillingPeriod {
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
  QUARTERLY = "quarterly",
  SEMI_ANNUALLY = "semi-annually",
  ANNUALLY = "annually",
}

export type CheckoutAgreement = {
  id?: string | undefined;
  name: string;
  description?: string | undefined;
  required: boolean;
  answer?: boolean | undefined;
};

export type LinkRequest = {
  locale?: string | undefined;
  askForAddress?: boolean | undefined;
  askForPhone?: boolean | undefined;
  askForNote?: boolean | undefined;
  askForNip?: boolean | undefined;
  delivery?:
    | {
        name: string;
        desc?: string | undefined;
        min: number;
        max: number;
        price: number;
      }[]
    | undefined;
  deliveryMethod?: string | undefined;
  details?:
    | {
        email?: string | undefined;
        name?: string | undefined;
        lastName?: string | undefined;
        phone?: string | undefined;
        address?: LinkAddress | undefined;
        billingAddress?: LinkBillingAddress | undefined;
      }
    | undefined;
  countries?: string[] | undefined;
  items: {
    id: string;
    quantity: number;
    priceVersion?: string | undefined;
    /** Buyer-chosen pay-what-you-want amount, in minor units per item. */
    amount?: number | undefined;
    name?: string | undefined;
    description?: string | undefined;
    imageURL?: string | undefined;
    price?: number | undefined;
    currency?: string | undefined;
    recurring?:
      | {
          billingPeriod: BillingPeriod;
          trialDays?: number | undefined;
          subscriptionSchedule?: number | undefined;
        }
      | undefined;
  }[];
  metadata?: Record<string, string> | undefined;
  additionalAgreements?: CheckoutAgreement[] | undefined;
  blikCode?: string | undefined;
  /**
   * The buyer's pick when the cart offered a choice (`payment-methods`):
   * `manual` is a transfer / BLIK to the seller's phone, `cod` cash on
   * delivery, `online` the regular gateway. Omitted when no choice was shown.
   */
  paymentMethod?: "online" | "manual" | "cod" | undefined;
  couponCode?: string | undefined;
  redirect?:
    | {
        successURL?: string | undefined;
        cancelURL?: string | undefined;
      }
    | undefined;
};
