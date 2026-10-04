import {
  BitsnapReturns,
  ReturnsCodeStep,
  ReturnsEmailStep,
  ReturnsOrderList,
  ReturnsProvider,
  useCreateReturn,
  useMyReturns,
  useReturnableOrder,
  useReturnOrders,
  useReturnSession,
  type ReturnsAppearance,
  type ReturnsTexts,
} from "bitsnap-react";

/** Consumer fixture for the returns API of this package. */

const appearance: ReturnsAppearance = {
  theme: "dark",
  tokens: { buttonBackground: "#111827", focusRing: "#111827" },
  elements: { root: { className: "max-w-xl" } },
};
const texts: Partial<ReturnsTexts> = { emailStepTitle: "Return a product" };

export function ReadyMade() {
  return (
    <BitsnapReturns
      projectID="project"
      environment="test"
      appearance={appearance}
      texts={texts}
      locale="en-US"
    />
  );
}

export function Composed() {
  return (
    <ReturnsProvider projectID="project" appearance={appearance} texts={texts}>
      <ReturnsEmailStep onSubmitted={() => undefined} />
      <ReturnsCodeStep onVerified={() => undefined} onBack={() => undefined} />
      <ReturnsOrderList
        showLogout
        onSelectOrder={(orderId: string) => void orderId}
        onOpenMyReturns={() => undefined}
      />
    </ReturnsProvider>
  );
}

export function Hooks() {
  const session = useReturnSession();
  const orders = useReturnOrders({ pageSize: 5 });
  const order = useReturnableOrder("order-id");
  const mine = useMyReturns({ pageSize: 5 });
  const create = useCreateReturn();

  async function run() {
    await session.start("a@b.c");
    await session.verify("123456");
    const request = await create.submit({
      orderId: "order-id",
      items: [{ lineId: "line", quantity: 1 }],
    });
    return [request?.reference, orders.orders, orders.hasNext, order.order, mine.returns];
  }

  return <button onClick={() => void run()}>{session.status}</button>;
}
