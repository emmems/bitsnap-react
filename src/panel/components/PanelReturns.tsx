import { useEffect, useState } from "react";
import {
  ReturnsConfirmation,
  ReturnsOrderDetail,
  ReturnsOrderList,
  ReturnsResult,
} from "../../components/returns/OrderSteps";
import {
  ReturnsMyReturnDetail,
  ReturnsMyReturnsList,
} from "../../components/returns/MyReturns";
import {
  ReturnsProvider,
  useReturnsContext,
} from "../../components/returns/ReturnsProvider";
import { SkeletonRows } from "../../components/returns/internal";
import { isSessionExpiredError, mapReturnsError } from "../../components/returns/errors";
import { useReturnsText } from "../../components/returns/texts.context";
import type { SelectedReturnLine } from "../../components/returns/state-machine";
import type { ReturnsAppearance } from "../../components/returns/appearance";
import type { ReturnsTexts } from "../../components/returns/texts";
import { Button } from "../../ui/button";
import { clearPanelSession } from "../session-storage";
import type { PanelScreen, PanelSearchParamsType } from "../types";

type Props = {
  projectID: string;
  host?: string;
  accessToken: string;
  loginURL: string;
  appearance?: ReturnsAppearance;
  texts?: Partial<ReturnsTexts>;
  screen: PanelScreen;
  params: PanelSearchParamsType;
  setParams: (params: Partial<PanelSearchParamsType>) => void;
  setActiveScreen: (screen: PanelScreen) => void;
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

function ReturnsScreens({
  projectID,
  host,
  loginURL,
  screen,
  params,
  setParams,
  setActiveScreen,
}: Pick<
  Props,
  | "projectID"
  | "host"
  | "loginURL"
  | "screen"
  | "params"
  | "setParams"
  | "setActiveScreen"
>) {
  const { status, exchangeError } = useReturnsContext("PanelReturns");
  const text = useReturnsText();

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

  const [view, setView] = useState<"orders" | "myReturns" | "confirmation" | "result">(
    "orders",
  );
  const [draft, setDraft] = useState<Draft>({ items: [], note: "" });
  const [createdReturnId, setCreatedReturnId] = useState<string>();

  if (status === "anonymous" && !expired) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm">{text(mapReturnsError(exchangeError))}</p>
        <Button type="button" onClick={() => window.location.reload()}>
          {text("errorRetry")}
        </Button>
      </div>
    );
  }

  if (status !== "authenticated") {
    return <SkeletonRows />;
  }

  const openReturns = (next: "orders" | "myReturns") => {
    setView(next);
    setParams({ state: "returns", orderId: undefined, returnId: undefined });
    setActiveScreen("returns");
  };

  if (screen === "return-details" && params.returnId) {
    return (
      <ReturnsMyReturnDetail
        returnId={params.returnId}
        onBack={() => openReturns("myReturns")}
      />
    );
  }

  if (view === "myReturns") {
    return (
      <ReturnsMyReturnsList
        onBack={() => openReturns("orders")}
        onSelectReturn={(returnId) => {
          setParams({ state: "return-details", returnId, orderId: undefined });
          setActiveScreen("return-details");
        }}
      />
    );
  }

  if (view === "result" && createdReturnId != null) {
    return (
      <ReturnsResult
        returnId={createdReturnId}
        onContinue={() => openReturns("orders")}
        onOpenMyReturns={() => openReturns("myReturns")}
      />
    );
  }

  if (params.orderId) {
    const orderId = params.orderId;

    if (view === "confirmation") {
      return (
        <ReturnsConfirmation
          orderId={orderId}
          items={draft.items}
          note={draft.note}
          onBack={() => setView("orders")}
          onSubmitted={(returnId) => {
            setCreatedReturnId(returnId);
            setDraft({ items: [], note: "" });
            setView("result");
            setParams({ orderId: undefined });
          }}
        />
      );
    }

    return (
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
          setView("confirmation");
        }}
      />
    );
  }

  return (
    <ReturnsOrderList
      showLogout={false}
      onSelectOrder={(orderId) => {
        setDraft({ items: [], note: "" });
        setView("orders");
        setParams({ orderId });
      }}
      onOpenMyReturns={() => openReturns("myReturns")}
    />
  );
}

/**
 * Panel Returns screen: the exported returns step components under a
 * `ReturnsProvider` that exchanges the panel access token for a returns
 * session.
 */
export default function PanelReturns({
  projectID,
  host,
  accessToken,
  appearance,
  texts,
  ...rest
}: Props) {
  return (
    <ReturnsProvider
      projectID={projectID}
      host={host}
      appearance={appearance}
      texts={texts}
      panelAccessToken={accessToken}
    >
      <ReturnsScreens projectID={projectID} host={host} {...rest} />
    </ReturnsProvider>
  );
}
