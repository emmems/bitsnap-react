import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useEffect, useState } from "react";
import { rpcProvider, useMutation } from "../../rpc-provider";
import { useUrlSearchParams } from "../hooks/useUrlSearchParams";
import { InstrumentProvider, useInstrument } from "../../analytics/instrument";
import { usePanelConfig } from "../PanelProvider";
import { resolvePanelReturnsAppearance } from "../returns-appearance";
import { usePanelRoot } from "../theme";
import type { PanelProps } from "../types";
import {
  buildAccessTokenRedirect,
  getReturnURLFromSearch,
  persistReturnURL,
  readPersistedReturnURL,
} from "../return-url";

import PanelNotificationsComponent from "./PanelNotifications";
import PanelLoyaltyComponent from "./PanelLoyalty";
import PanelOrderHistoryComponent from "./PanelOrderHistory";
import PanelPlansComponent from "./PanelPlans";
import PanelReturnsComponent from "./PanelReturns";
import PanelProductGridComponent from "./PanelProductGrid";
import PanelProductHeaderComponent from "./PanelProductHeader";
import PanelProfileComponent from "./PanelProfile";
import LazyPanelCourse from "./LazyPanelCourse";
import LazyPanelMessages from "./LazyPanelMessages";
import { usePanelChat } from "../chat-visibility";
import PublicOrderPage from "./PublicOrderPage";
import { clearPanelSession, getPanelEmail, getPanelSession } from "../session-storage";
import { clearQrCache } from "./products/ticket/qr-cache";

export type PanelScreen =
  | "products"
  | "notifications"
  | "profile"
  | "plans"
  | "orders"
  | "order-details"
  | "returns"
  | "return-details"
  | "loyalty"
  | "course"
  | "messages";

/**
 * `?orderId=""` (an old order with no id) opens nothing, and a reload would
 * keep it. Returns the search string without an empty `orderId`, an
 * `order-details` state without an id becoming the order list, or `null` when
 * there is nothing to fix.
 */
export function dropEmptyOrderId(search: string): string | null {
  const params = new URLSearchParams(search);
  const raw = params.get("orderId");
  const state = params.get("state");
  const readJSON = (value: string | null) => {
    if (value == null) return undefined;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  };
  const orderId = readJSON(raw);
  const hasId = typeof orderId === "string" ? orderId.trim() !== "" : orderId != null;
  const opensDetails = readJSON(state) === "order-details";
  const hasOrderProject = params.has("orderProject");
  if (hasId || (raw == null && !opensDetails && !hasOrderProject)) return null;
  params.delete("orderId");
  params.delete("orderProject");
  if (opensDetails) params.set("state", JSON.stringify("orders"));
  const next = params.toString();
  return next === "" ? "" : `?${next}`;
}

/** Runs `dropEmptyOrderId` on the address bar once, before the params are read. */
function useCleanOrderIdOnLoad() {
  useState(() => {
    if (typeof window === "undefined") return null;
    const next = dropEmptyOrderId(window.location.search);
    if (next != null) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
    return null;
  });
}

export type PanelSearchParamsType = {
  product?: string;
  state: PanelScreen;
  orderId?: string;
  /** `state: "order-details"` on the global panel: hashed id of the order's shop. */
  orderProject?: string;
  /** Global panel shop filter pill (hashed project id). Shared by Library and Orders. */
  shop?: string;
  returnId?: string;
  /** `state: "course"`: `UserProduct.accessId` of the open course. */
  course?: string;
  /** `state: "course"`: id of the open lesson or test. */
  item?: string;
  /** `state: "messages"`: project of the open conversation. */
  chatProject?: string;
  /** `state: "messages"`: id of the open pack thread. */
  thread?: string;
  /** `state: "messages"`: id of the open channel. */
  channel?: string;
  /** `state: "returns"`: `"mine"` opens the "Moje zwroty" tab. */
  returnsTab?: "mine";
};

const RAW_STRING_PARAM_KEYS = ["shop", "orderProject"] as const;

const PanelPage = ({
  returnsAppearance,
  returnsTexts,
  analytics,
  colorScheme,
}: Pick<
  PanelProps,
  "returnsAppearance" | "returnsTexts" | "analytics" | "colorScheme"
> = {}) => {
  const { projectID, theme, loginURL, host } = usePanelConfig();
  const { rootProps, mode } = usePanelRoot(theme, colorScheme);
  const [, refreshLocale] = useState(0);
  const instrument = useInstrument(projectID, analytics, "panel");

  const accessToken = getPanelSession(projectID, host);
  const email = getPanelEmail(projectID, host);

  const { mutateAsync: logoutUserAsync } = useMutation(
    rpcProvider.publicApi.userPanelLogout,
  );

  async function logout() {
    try {
      if (accessToken) {
        await logoutUserAsync({
          accessToken: accessToken as string,
        });
      }
    } finally {
      // Clear local state even when the logout call fails (e.g. offline).
      if (typeof window !== "undefined") {
        clearPanelSession(projectID, host);
        clearQrCache();
        window.location.reload();
      }
    }
  }

  const isGlobal = !projectID;
  const [panelParentRef] = useAutoAnimate();
  const isScreen = (value: unknown): value is PanelScreen =>
    [
      "products",
      "notifications",
      "profile",
      "plans",
      "orders",
      "order-details",
      ...(isGlobal ? [] : ["returns", "return-details", "loyalty"]),
      "course",
      "messages",
    ].includes(value as string);
  const resolveScreen = (value: unknown): PanelScreen =>
    isScreen(value) ? value : "products";

  useCleanOrderIdOnLoad();
  const [params, setParams] = useUrlSearchParams<PanelSearchParamsType>(
    {
      product: undefined,
      state: "products",
      orderId: undefined,
      orderProject: undefined,
      shop: undefined,
      returnId: undefined,
      course: undefined,
      item: undefined,
      chatProject: undefined,
      thread: undefined,
      channel: undefined,
      returnsTab: undefined,
    },
    { rawStringKeys: RAW_STRING_PARAM_KEYS },
  );

  const [activeScreen, setActiveScreen] = useState<PanelScreen>(() =>
    resolveScreen(params.state),
  );

  const handleOpenOrderDetails = (orderID: string, orderProject?: string) => {
    // An old order without an id has no details page; stay on the list.
    if (!orderID.trim()) return;
    setParams({
      state: "order-details",
      orderId: orderID,
      orderProject: isGlobal ? orderProject?.trim() || undefined : undefined,
    });
    setActiveScreen("order-details");
  };

  const handleBackToOrders = () => {
    setParams({
      state: "orders",
      orderId: undefined,
      orderProject: undefined,
    });
    setActiveScreen("orders");
  };

  // Navigation starts a screen from scratch, so ids of the previous screen
  // must not leak into it. `shop` is kept so the pill selection survives
  // switching between Library and Orders.
  const navigate = (next: { product?: string; state: PanelScreen }) =>
    setParams({
      orderId: undefined,
      orderProject: undefined,
      returnId: undefined,
      course: undefined,
      item: undefined,
      chatProject: undefined,
      thread: undefined,
      channel: undefined,
      returnsTab: undefined,
      ...next,
    });

  const handleOpenCourse = (accessId: string) => {
    setParams({
      state: "course",
      course: accessId,
      item: undefined,
      product: undefined,
    });
    setActiveScreen("course");
  };

  const handleLeaveCourse = () => {
    setParams({
      state: "products",
      course: undefined,
      item: undefined,
      product: undefined,
    });
    setActiveScreen("products");
  };

  const handleOpenMessages = () => {
    setParams({
      state: "messages",
      product: undefined,
      chatProject: undefined,
      thread: undefined,
      channel: undefined,
    });
    setActiveScreen("messages");
  };

  const chat = usePanelChat(accessToken, projectID ?? "");

  // The browser's back and forward buttons move between the lessons of a
  // course and in and out of it, between conversations, between the order
  // list and an order, and between the returns tabs and a return.
  const historyScreens: PanelScreen[] = [
    "course",
    "messages",
    "orders",
    "order-details",
    "returns",
    "return-details",
  ];
  useEffect(() => {
    if (isGlobal && (params.state === "returns" || params.state === "return-details")) {
      setActiveScreen("products");
      return;
    }
    if (!isScreen(params.state)) return;
    if (
      historyScreens.includes(params.state) ||
      historyScreens.includes(activeScreen)
    ) {
      setActiveScreen(params.state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.state, isGlobal]);

  const openScreen = (state: PanelScreen) => {
    const target = resolveScreen(state);
    navigate({ state: target, product: undefined });
    setActiveScreen(target);
  };

  const orderId = params.orderId?.trim() || undefined;

  useEffect(() => {
    if (accessToken == null || accessToken.length === 0) {
      window.location.href = loginURL ?? "/panel/login";
      return;
    }
  }, []);

  useEffect(() => {
    if (accessToken == null || accessToken.length === 0) {
      window.location.href = loginURL ?? "/panel/login";
      return;
    }
  }, [activeScreen]);

useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent !== window) return;
    if (!accessToken) return;

    const queryReturnURL = getReturnURLFromSearch(window.location.search);
    if (queryReturnURL) {
      persistReturnURL(queryReturnURL);
    }

    const returnURL = queryReturnURL ?? readPersistedReturnURL();
    if (!returnURL) return;

    window.location.href = buildAccessTokenRedirect(returnURL, accessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <InstrumentProvider value={instrument}>
    <div
      ref={panelParentRef}
      {...rootProps}
      className={`relative flex h-dvh w-full flex-col bg-(--panel-bg) text-(--panel-fg) md:flex-row${
        rootProps.className ? ` ${rootProps.className}` : ""
      }`}
    >
      <PanelProductHeaderComponent
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        setParams={navigate}
        theme={theme}
        logout={logout}
        email={email}
        projectID={projectID}
        showMessages={chat.visible || activeScreen === "messages"}
        showReturns={!isGlobal}
        showLoyalty={!isGlobal}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto w-full p-5 pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-5">
        {activeScreen === "products" && (
          <PanelProductGridComponent
            projectID={projectID ?? ""}
            accessToken={accessToken!}
            loginURL={loginURL ?? "/panel/login"}
            activeScreen={activeScreen}
            params={params as PanelSearchParamsType}
            setParams={setParams}
            openCourse={handleOpenCourse}
            openMessages={handleOpenMessages}
          />
        )}

        {activeScreen === "messages" && accessToken && (
          <LazyPanelMessages
            accessToken={accessToken}
            products={chat.products}
            chatApiUrl={chat.chatApiUrl}
            projectID={projectID}
            host={host}
            selection={{
              chatProject: params.chatProject,
              thread: params.thread,
              channel: params.channel,
            }}
            onSelect={(selection) =>
              setParams({
                chatProject: selection.chatProject,
                thread: selection.thread,
                channel: selection.channel,
              })
            }
          />
        )}

        {activeScreen === "course" && params.course && accessToken && (
          <LazyPanelCourse
            accessId={params.course}
            accessToken={accessToken}
            theme={theme}
            itemId={params.item}
            onItemChange={(item) => setParams({ item })}
            onBack={handleLeaveCourse}
          />
        )}

        {activeScreen === "notifications" && <PanelNotificationsComponent />}

        {activeScreen === "plans" && (
          <PanelPlansComponent projectID={projectID ?? ""} />
        )}

        {activeScreen === "orders" && (
          <PanelOrderHistoryComponent
            projectID={projectID ?? ""}
            accessToken={accessToken ?? ""}
            openOrderDetails={handleOpenOrderDetails}
            openLibrary={() => openScreen("products")}
            shop={isGlobal ? params.shop : undefined}
            onShopChange={
              isGlobal
                ? (shop) => setParams({ shop }, { replace: true })
                : undefined
            }
          />
        )}

        {/* D1: every order-details screen renders; without an id it explains. */}
        {activeScreen === "order-details" && (
          <PublicOrderPage
            variant="panel"
            orderID={orderId}
            orderProjectID={
              projectID ? undefined : params.orderProject?.trim() || undefined
            }
            accessToken={accessToken ?? undefined}
            onBack={handleBackToOrders}
          />
        )}

        {!isGlobal &&
          (activeScreen === "returns" || activeScreen === "return-details") &&
          accessToken && (
            <PanelReturnsComponent
              projectID={projectID ?? ""}
              host={host}
              accessToken={accessToken}
              loginURL={loginURL ?? "/panel/login"}
              appearance={resolvePanelReturnsAppearance(
                returnsAppearance,
                mode,
              )}
              texts={returnsTexts}
              screen={activeScreen}
              params={params as PanelSearchParamsType}
              setParams={setParams}
              setActiveScreen={setActiveScreen}
              openOrders={() => openScreen("orders")}
            />
          )}

        {!isGlobal && activeScreen === "loyalty" && accessToken && (
          <PanelLoyaltyComponent
            projectID={projectID ?? ""}
            accessToken={accessToken}
          />
        )}

        {activeScreen === "profile" && (
          <PanelProfileComponent
            email={email}
            logout={logout}
            onLocaleChange={() => refreshLocale(value => value + 1)}
          />
        )}
      </main>
    </div>
    </InstrumentProvider>
  );
};

export default PanelPage;
