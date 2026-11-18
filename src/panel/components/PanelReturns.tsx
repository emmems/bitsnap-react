import { AlertCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { getLocale } from "../../components/checkout/locale";
import {
  ReturnsConfirmation,
  ReturnsOrderDetail,
  ReturnsResult,
} from "../../components/returns/OrderSteps";
import { ReturnsMyReturnDetail } from "../../components/returns/MyReturns";
import {
  ReturnsProvider,
  useReturnsContext,
} from "../../components/returns/ReturnsProvider";
import { useReturnOrders } from "../../components/returns/hooks";
import { SkeletonRows } from "../../components/returns/internal";
import { isSessionExpiredError, mapReturnsError } from "../../components/returns/errors";
import { useReturnsText } from "../../components/returns/texts.context";
import type { SelectedReturnLine } from "../../components/returns/state-machine";
import type { ReturnsAppearance } from "../../components/returns/appearance";
import type { ReturnsTexts } from "../../components/returns/texts";
import { Button } from "../../ui/button";
import { clearPanelSession } from "../session-storage";
import { getPanelTexts, type PanelTexts } from "../texts";
import type { PanelScreen } from "../types";
import {
  MyReturnsPanel,
  RETURNS_PAGE_SIZE,
  ReturnOrdersPanel,
} from "./returns-panel/ReturnsLists";
import { ReturnsTabs, type ReturnsTab } from "./returns-panel/ReturnsTabs";
import { PanelEmptyState } from "./shared/PanelEmptyState";

/** URL params the Returns screen reads and writes. */
export type PanelReturnsParams = {
  state?: PanelScreen;
  orderId?: string;
  returnId?: string;
  /** `"mine"`: the "Moje zwroty" tab (survives a reload and the back button). */
  returnsTab?: "mine";
};

type Props = {
  projectID: string;
  host?: string;
  accessToken: string;
  loginURL: string;
  appearance?: ReturnsAppearance;
  texts?: Partial<ReturnsTexts>;
  screen: PanelScreen;
  params: PanelReturnsParams;
  setParams: (params: Partial<PanelReturnsParams>) => void;
  setActiveScreen: (screen: PanelScreen) => void;
  /** "Zobacz zamówienia" of the empty state. */
  openOrders?: () => void;
};

type Draft = { items: SelectedReturnLine[]; note: string };

function redirectToLogin(
  loginURL: string,
  dropToken: boolean,
  projectID: string,
  host?: string,
) {
  if (typeof window === "undefined") return;
  if (dropToken) {
    clearPanelSession(projectID, host);
  }
  window.location.href = loginURL;
}

/** Count badge of "Do zwrotu" once the orders are loaded. */
function OrdersTabLabel({ label }: { label: string }) {
  const orders = useReturnOrders({ pageSize: RETURNS_PAGE_SIZE });
  return (
    <>
      {label}
      {!orders.isLoading && orders.total > 0 && (
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-(--panel-surface-2) px-1.5 text-[11px] tabular-nums">
          {orders.total}
        </span>
      )}
    </>
  );
}

/** Title, description, the two tabs and the list of the chosen tab. */
function ReturnsHome({
  tab,
  panelTexts,
  onTab,
  onSelectOrder,
  onSelectReturn,
  openOrders,
}: {
  tab: ReturnsTab;
  panelTexts: PanelTexts;
  onTab: (tab: ReturnsTab) => void;
  onSelectOrder: (orderId: string) => void;
  onSelectReturn: (returnId: string) => void;
  openOrders?: () => void;
}) {
  const text = useReturnsText();
  const idBase = useId().replace(/:/g, "");
  const orders = useReturnOrders({ pageSize: RETURNS_PAGE_SIZE });
  const description =
    tab === "mine"
      ? text("myReturnsDescription")
      : orders.orders.length > 0
        ? text("ordersDescription")
        : null;
  return (
    <section className="flex w-full max-w-[720px] flex-col gap-4" data-bitsnap-panel-returns="">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{panelTexts.returnsTitle}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-(--panel-muted)">{description}</p>
        )}
      </header>
      <ReturnsTabs
        value={tab}
        onChange={onTab}
        label={panelTexts.returnsTabsLabel}
        idBase={idBase}
        labels={{
          orders: <OrdersTabLabel label={panelTexts.returnsTabOrders} />,
          mine: panelTexts.returnsTabMine,
        }}
      />
      <div
        role="tabpanel"
        id={`${idBase}-panel-${tab}`}
        aria-labelledby={`${idBase}-tab-${tab}`}
      >
        {tab === "orders" ? (
          <ReturnOrdersPanel
            texts={panelTexts}
            onSelectOrder={onSelectOrder}
            onOpenOrders={openOrders}
          />
        ) : (
          <MyReturnsPanel texts={panelTexts} onSelectReturn={onSelectReturn} />
        )}
      </div>
    </section>
  );
}

function ReturnsScreens({
  projectID,
  host,
  loginURL,
  screen,
  params,
  setParams,
  setActiveScreen,
  openOrders,
}: Omit<Props, "accessToken" | "appearance" | "texts">) {
  const { status, exchangeError } = useReturnsContext("PanelReturns");
  const text = useReturnsText();
  const panelTexts = getPanelTexts(getLocale());

  // The panel token is the login, so there is no email or code step. A failed
  // exchange or a dropped session means the panel session is no longer valid.
  const expired =
    status === "anonymous" &&
    (exchangeError == null || isSessionExpiredError(exchangeError));
  useEffect(() => {
    if (expired) {
      redirectToLogin(loginURL, exchangeError != null, projectID, host);
    }
  }, [expired, loginURL, exchangeError, projectID, host]);

  // The draft and the step after "Dalej" live in memory only.
  const [step, setStep] = useState<"select" | "confirmation" | "result">("select");
  const [draft, setDraft] = useState<Draft>({ items: [], note: "" });
  const [createdReturnId, setCreatedReturnId] = useState<string>();

  if (status === "anonymous" && !expired) {
    return (
      <PanelEmptyState
        role="alert"
        icon={<AlertCircle />}
        title={panelTexts.returnsUnavailableTitle}
        description={text(mapReturnsError(exchangeError))}
        action={
          <Button className="min-h-11" onClick={() => window.location.reload()}>
            {text("errorRetry")}
          </Button>
        }
        className="w-full max-w-[720px]"
      />
    );
  }

  if (status !== "authenticated") {
    return <SkeletonRows />;
  }

  const openTab = (tab: ReturnsTab) => {
    setStep("select");
    setParams({
      state: "returns",
      orderId: undefined,
      returnId: undefined,
      returnsTab: tab === "mine" ? "mine" : undefined,
    });
    setActiveScreen("returns");
  };

  if (screen === "return-details" && params.returnId) {
    return (
      <div className="w-full max-w-[720px]">
        <ReturnsMyReturnDetail
          returnId={params.returnId}
          onBack={() => openTab("mine")}
        />
      </div>
    );
  }

  if (step === "result" && createdReturnId != null) {
    return (
      <div className="w-full max-w-[720px]">
        <ReturnsResult
          returnId={createdReturnId}
          onContinue={() => openTab("orders")}
          onOpenMyReturns={() => openTab("mine")}
        />
      </div>
    );
  }

  if (params.orderId) {
    const orderId = params.orderId;
    return (
      <div className="w-full max-w-[720px]">
        {step === "confirmation" ? (
          <ReturnsConfirmation
            orderId={orderId}
            items={draft.items}
            note={draft.note}
            onBack={() => setStep("select")}
            onSubmitted={(returnId) => {
              setCreatedReturnId(returnId);
              setDraft({ items: [], note: "" });
              setStep("result");
              setParams({ orderId: undefined });
            }}
          />
        ) : (
          <ReturnsOrderDetail
            orderId={orderId}
            initialItems={draft.items.length > 0 ? draft.items : undefined}
            initialNote={draft.note}
            onBack={() => {
              setDraft({ items: [], note: "" });
              setParams({ orderId: undefined });
            }}
            onContinue={(selection) => {
              setDraft(selection);
              setStep("confirmation");
            }}
          />
        )}
      </div>
    );
  }

  return (
    <ReturnsHome
      tab={params.returnsTab === "mine" ? "mine" : "orders"}
      panelTexts={panelTexts}
      onTab={openTab}
      openOrders={openOrders}
      onSelectOrder={(orderId) => {
        setDraft({ items: [], note: "" });
        setStep("select");
        setParams({ orderId, returnsTab: undefined });
      }}
      onSelectReturn={(returnId) => {
        setParams({ state: "return-details", returnId, orderId: undefined });
        setActiveScreen("return-details");
      }}
    />
  );
}

/**
 * Panel Returns screen (option A): "Do zwrotu | Moje zwroty" tabs, a real
 * empty state, and the library's return steps, under a `ReturnsProvider`
 * that exchanges the panel access token for a returns session and takes the
 * panel's theme.
 */
export default function PanelReturns({
  accessToken,
  appearance,
  texts,
  ...rest
}: Props) {
  return (
    <ReturnsProvider
      projectID={rest.projectID}
      host={rest.host}
      appearance={appearance}
      texts={texts}
      panelAccessToken={accessToken}
    >
      <ReturnsScreens {...rest} />
    </ReturnsProvider>
  );
}
