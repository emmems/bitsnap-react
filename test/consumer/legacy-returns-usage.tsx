import {
  BitsnapReturns,
  BitsnapReturnsProvider,
  Environment,
  useCreateReturn,
  useMyReturns,
  useReturnableOrder,
  useReturnOrders,
  useReturnSession,
  type BitsnapReturnsProps,
  type BitsnapReturnsProviderProps,
} from "bitsnap-react";
import {
  BitsnapReturns as SubpathBitsnapReturns,
  BitsnapReturnsProvider as SubpathProvider,
  Environment as SubpathEnvironment,
  useCreateReturn as subpathUseCreateReturn,
  useMyReturns as subpathUseMyReturns,
  useReturnableOrder as subpathUseReturnableOrder,
  useReturnOrders as subpathUseReturnOrders,
  useReturnSession as subpathUseReturnSession,
  type BitsnapReturnsProps as SubpathProps,
  type BitsnapReturnsProviderProps as SubpathProviderProps,
} from "bitsnap-react/returns";

/**
 * The exact bitsnap-react 1.6.0 returns usage patterns, compiled against the
 * built declarations from both import paths.
 */

const props: BitsnapReturnsProps = {
  projectID: "project",
  host: "https://bitsnap.pl",
  environment: Environment.TEST,
};
const subpathProps: SubpathProps = props;
const providerProps: BitsnapReturnsProviderProps = {
  projectID: "project",
  environment: Environment.PRODUCTION,
  children: null,
};
const subpathProviderProps: SubpathProviderProps = providerProps;
void [subpathProps, subpathProviderProps];

export function LegacyWidget() {
  return (
    <>
      <BitsnapReturns
        projectID="project"
        host="https://bitsnap.pl"
        environment={Environment.TEST}
        texts={{
          title: "Returns",
          email: "Email",
          sendCode: "Send code",
          code: "Code",
          verify: "Verify",
          orders: "Orders",
          submit: "Submit",
          note: "Note",
          loading: "Loading",
          history: "History",
        }}
        theme={{ brandColor: "#111827" }}
        className="x"
      />
      <SubpathBitsnapReturns
        projectID="project"
        host="https://bitsnap.pl"
        environment={SubpathEnvironment.TEST}
        texts={{ title: "Returns", email: "Email", history: "History" }}
        theme={{ brandColor: "#111827" }}
        className="x"
      />
    </>
  );
}

export function LegacyProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BitsnapReturnsProvider
        projectID="project"
        host="https://bitsnap.pl"
        environment={Environment.PRODUCTION}
      >
        {children}
      </BitsnapReturnsProvider>
      <SubpathProvider projectID="project" environment={SubpathEnvironment.TEST}>
        {children}
      </SubpathProvider>
    </>
  );
}

export function LegacyFlow() {
  const s = useReturnSession();
  const orders = useReturnOrders(20, "");
  const order = useReturnableOrder("order-id");
  const none = useReturnableOrder();
  const create = useCreateReturn();
  const mine = useMyReturns();

  async function run(email: string, code: string) {
    const r = await s.startSession(email);
    const challengeId: string = r.challengeId;
    await s.verifySession({ challengeId, code });
    const starting: boolean = s.starting;
    const verifying: boolean = s.verifying;
    const authenticated: boolean = s.isAuthenticated;
    s.logout();
    const message: string | undefined = s.error?.message;

    const list = orders.data?.orders;
    const nextPageToken: string | undefined = orders.data?.nextPageToken;
    const loading: boolean = orders.isLoading;
    const lines = order.data?.order?.lines;
    const noneOrder = none.data?.order;

    const res = await create.mutateAsync({
      canonicalOrderID: "order-id",
      items: [{ lineId: "line", quantity: 1 }],
      note: "note",
      idempotencyKey: "key",
    });
    const reference: string | undefined = res.request?.reference;
    const pending: boolean = create.isPending;
    const failure: string | undefined = create.error?.message;
    create.mutate({ canonicalOrderID: "order-id", items: [] });
    create.reset();

    return [
      starting, verifying, authenticated, message, list, nextPageToken,
      loading, lines, noneOrder, reference, pending, failure,
      mine.data?.returns, void orders.refetch(),
    ];
  }

  return <button onClick={() => void run("a@b.c", "123456")}>go</button>;
}

export function SubpathHooks() {
  const s = subpathUseReturnSession();
  const orders = subpathUseReturnOrders(20, "");
  const order = subpathUseReturnableOrder("order-id");
  const create = subpathUseCreateReturn();
  const mine = subpathUseMyReturns();
  void s.startSession("a@b.c");
  void create.mutateAsync({ canonicalOrderID: "id", items: [] });
  return (
    <>
      {orders.data?.orders.length}
      {order.data?.order?.lines.length}
      {mine.data?.returns.length}
    </>
  );
}
