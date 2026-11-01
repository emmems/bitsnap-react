import {
  InPostPayButton,
  RevolutPayButton,
  BitsnapCheckout,
  setProjectID,
  type ExpressItem,
  type InPostPayButtonProps,
  type RevolutPayButtonProps,
  type RevolutPaymentOutcome,
} from "bitsnap-react";

/**
 * Type-level check of the express checkout API, compiled by
 * `pnpm test:types` against the built declarations.
 */

const projectID = "project-id";
setProjectID(projectID);

const cart: ExpressItem[] = [
  { id: "prodv2_1", quantity: 1 },
  { id: "prodv2_2", quantity: 3 },
];

const productPage = (
  <div>
    <InPostPayButton
      projectID={projectID}
      productId="prodv2_1"
      quantity={2}
      locale="pl"
      bindingPlace="PRODUCT_CARD"
      texts={{ expressPending: "Czekamy na potwierdzenie" }}
      onOrderCreated={({ providerOrderId }) => console.log(providerOrderId)}
      analytics={false}
    />
    <RevolutPayButton projectID={projectID} productId="prodv2_1" quantity={2} locale="pl" />
  </div>
);

const cartPage = (
  <div>
    <InPostPayButton projectID={projectID} items={cart} locale="en" />
    <RevolutPayButton
      projectID={projectID}
      items={cart}
      locale="en"
      buttonStyle={{ size: "large", variant: "light" }}
      onPaymentResult={(outcome: RevolutPaymentOutcome) => console.log(outcome.status)}
    />
    <BitsnapCheckout projectID={projectID} locale="en" />
  </div>
);

const inpostProps: InPostPayButtonProps = { projectID, items: cart };
const revolutProps: RevolutPayButtonProps = { projectID, items: cart };

export { cartPage, inpostProps, productPage, revolutProps };
