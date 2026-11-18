import { Code, ConnectError } from "@connectrpc/connect";
import { keepPreviousData } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInstrument, type AnalyticsOption } from "../../analytics/instrument";
import { getLocale } from "../../components/checkout/locale";
import { rpcProvider, useQuery } from "../../rpc-provider";
import type { PublicOrderDetails } from "../../gen/proto/public/v1/public_api_pb";
import { usePanelConfig } from "../PanelProvider";
import { clearPanelSession, getPanelSession } from "../session-storage";
import { getPanelTexts } from "../texts";
import { usePanelRoot } from "../theme";
import type { PanelColorScheme } from "../types";
import {
  OrderDetailsSkeleton,
  OrderDetailsView,
  OrderProblem,
} from "./orders/OrderDetailsView";
import { useOrderTimeline } from "./orders/useOrderTimeline";

interface Props {
  /**
   * Order to show. Without it (an old order with no id) the page explains
   * that the order cannot be opened instead of rendering nothing.
   */
  orderID?: string;
  initialEmail?: string;
  /**
   * Panel session of the buyer. When omitted, the session stored by the
   * panel login is used. With a session the buyer sees their own data.
   */
  accessToken?: string;
  onBack?: () => void;
  /**
   * Usage statistics for your Bitsnap dashboard (order viewed). Inside
   * `<Panel>` or `<PanelProvider>` their setting applies unless this is given.
   */
  analytics?: AnalyticsOption;
  /**
   * `"standalone"` (default): a full page with the shop logo and its own
   * light/dark theme boundary. `"panel"`: inside `<Panel>`, without the page
   * chrome.
   */
  variant?: "standalone" | "panel";
  /**
   * Standalone page only. `"inherit"` (default) follows a `.dark` class on
   * the host page; `"system"` follows the operating system.
   */
  colorScheme?: PanelColorScheme;
}

/** Answers that mean "this order does not exist (for you)", not a failure. */
function isNotFound(error: unknown): boolean {
  const code = ConnectError.from(error).code;
  return (
    code === Code.NotFound ||
    code === Code.InvalidArgument ||
    code === Code.PermissionDenied
  );
}

/** An expired or rejected panel session. */
function isUnauthenticated(error: unknown): boolean {
  return error != null && ConnectError.from(error).code === Code.Unauthenticated;
}

function OrderPageContent({
  orderID,
  initialEmail,
  onBack,
  accessToken: accessTokenProp,
  analytics,
  variant,
  lead,
}: Props & { lead?: ReactNode }) {
  const { projectID, host, loginURL } = usePanelConfig();
  const instrument = useInstrument(projectID, analytics, "order");
  const locale = getLocale();
  const texts = getPanelTexts(locale);
  const orderId = orderID?.trim() || undefined;
  // Standalone: a session the server rejected is dropped, so the page falls
  // back to the e-mail check instead of failing on every retry.
  const [sessionRejected, setSessionRejected] = useState(false);
  const accessToken = sessionRejected
    ? undefined
    : accessTokenProp || getPanelSession(projectID, host) || undefined;

  const [verifyEmail, setVerifyEmail] = useState(initialEmail || "");

  const query = useQuery(
    rpcProvider.publicApi.getPublicOrderDetails,
    {
      projectId: projectID ?? "",
      orderId: orderId ?? "",
      email: verifyEmail || undefined,
      // The server checks a valid session before the e-mail, so a typed
      // e-mail is sent on its own: it also works when the stored session is
      // somebody else's.
      accessToken: verifyEmail ? undefined : accessToken,
    },
    {
      enabled: orderId != null,
      // The order stays on screen while an e-mail is being checked.
      placeholderData: keepPreviousData,
    },
  );

  const fetched =
    query.data?.result.case === "order" ? query.data.result.value : null;
  // Last order shown for this id: a failed e-mail check keeps it on screen.
  const shown = useRef<{ id: string; order: PublicOrderDetails } | null>(null);
  if (fetched != null && orderId != null) {
    shown.current = { id: orderId, order: fetched };
  }
  const previous =
    shown.current != null && shown.current.id === orderId
      ? shown.current.order
      : null;
  const checking = verifyEmail !== "" && query.isPlaceholderData;
  const verifyFailed =
    verifyEmail !== "" &&
    !checking &&
    !query.isFetching &&
    (fetched == null || !fetched.isVerified);
  const order = fetched ?? (verifyEmail !== "" ? previous : null);

  const timeline = useOrderTimeline({
    projectID,
    accessToken,
    orderId,
    locale,
  });

  // Guard only: today the server answers an expired token with masked data,
  // not Unauthenticated, so the always-on e-mail check covers that case.
  const unauthenticated = isUnauthenticated(query.error);
  useEffect(() => {
    if (!unauthenticated) return;
    if (variant === "panel") {
      // Same as the library and returns: an expired session signs out.
      clearPanelSession(projectID, host);
      if (typeof window !== "undefined") {
        window.location.href = loginURL ?? "/panel/login";
      }
    } else {
      setSessionRejected(true);
    }
  }, [unauthenticated, variant, projectID, host, loginURL]);

  const viewedOrder = order != null;
  useEffect(() => {
    if (viewedOrder) {
      // The id in the URL may be an access token: report no order reference.
      instrument.track("panel_order_viewed", {}, { order_ref: null });
    }
  }, [instrument, viewedOrder]);

  if (orderId == null) {
    return <OrderProblem kind="unavailable" texts={texts} onBack={onBack} />;
  }
  if (query.isPending || (unauthenticated && order == null)) {
    return <OrderDetailsSkeleton label={texts.orderLoading} />;
  }
  if (order == null) {
    const notFound =
      query.data?.result.case === "failure" ||
      (query.error != null && isNotFound(query.error)) ||
      (query.error == null && query.data != null);
    return (
      <OrderProblem
        kind={notFound ? "not-found" : "error"}
        texts={texts}
        onBack={onBack}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <OrderDetailsView
      order={order}
      texts={texts}
      locale={locale}
      timeline={timeline}
      // Masked data always offers the e-mail check: the stored session may
      // have expired or belong to someone else. Verified data never shows it.
      canVerify
      onVerify={setVerifyEmail}
      verifying={checking}
      verifyError={verifyFailed ? texts.orderVerifyFailed : undefined}
      onBack={onBack}
      lead={lead}
    />
  );
}

/** Shop logo of the standalone page, light and dark. */
function StandaloneLogo() {
  const { theme } = usePanelConfig();
  if (!theme?.logoURL) return null;
  return (
    <div className="mb-6">
      <img
        src={theme.logoURL}
        alt=""
        className={`h-10 w-auto ${theme.logoDarkURL ? "dark:hidden" : ""}`}
      />
      {theme.logoDarkURL && (
        <img src={theme.logoDarkURL} alt="" className="hidden h-10 w-auto dark:block" />
      )}
    </div>
  );
}

function StandaloneOrderPage(props: Props) {
  const { theme } = usePanelConfig();
  const { rootProps } = usePanelRoot(theme, props.colorScheme);
  return (
    <div
      {...rootProps}
      className={`min-h-screen w-full bg-(--panel-bg) px-4 py-8 text-(--panel-fg) sm:px-6${
        rootProps.className ? ` ${rootProps.className}` : ""
      }`}
    >
      <div className="mx-auto flex w-full max-w-[960px] flex-col">
        <OrderPageContent
          key={props.orderID?.trim() ?? ""}
          {...props}
          lead={<StandaloneLogo />}
        />
      </div>
    </div>
  );
}

/**
 * Order page of the buyer. In `<Panel>` it renders with `variant="panel"`;
 * on its own it is a themed full page (`colorScheme`, brand colour from the
 * panel config).
 */
function PublicOrderPage(props: Props) {
  if (props.variant === "panel") {
    return <OrderPageContent key={props.orderID?.trim() ?? ""} {...props} />;
  }
  return <StandaloneOrderPage {...props} />;
}
export default PublicOrderPage;
