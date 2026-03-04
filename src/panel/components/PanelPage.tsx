import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useEffect, useState, type CSSProperties } from "react";
import { rpcProvider, useMutation } from "../../rpc-provider";
import { useUrlSearchParams } from "../hooks/useUrlSearchParams";
import { usePanelConfig } from "../PanelProvider";

import PanelNotificationsComponent from "./PanelNotifications";
import PanelOrderHistoryComponent from "./PanelOrderHistory";
import PanelPlansComponent from "./PanelPlans";
import PanelProductGridComponent from "./PanelProductGrid";
import PanelProductHeaderComponent from "./PanelProductHeader";
import PanelProfileComponent from "./PanelProfile";
import PublicOrderPage from "./PublicOrderPage";

export type PanelScreen =
  | "products"
  | "notifications"
  | "profile"
  | "plans"
  | "orders"
  | "order-details";

export type PanelSearchParamsType = {
  product?: string;
  state: PanelScreen;
  orderId?: string;
};

const PanelPage = () => {
  const { projectID, theme, loginURL } = usePanelConfig();

  let accessToken: string | null = null;
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem("__access_token");
  }
  const email =
    typeof window !== "undefined" ? localStorage.getItem("__user-email") : null;

  const { mutateAsync: logoutUserAsync } = useMutation(
    rpcProvider.publicApi.userPanelLogout,
  );

  async function logout() {
    if (accessToken) {
      await logoutUserAsync({
        accessToken: accessToken as string,
      });
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("__access_token");
      localStorage.removeItem("__user-email");
      window.location.reload();
    }
  }

  const [panelParentRef] = useAutoAnimate();
  const isScreen = (value: unknown): value is PanelScreen =>
    [
      "products",
      "notifications",
      "profile",
      "plans",
      "orders",
      "order-details",
    ].includes(value as string);

  const [params, setParams] = useUrlSearchParams<PanelSearchParamsType>({
    product: undefined,
    state: "products",
    orderId: undefined,
  });

  const [activeScreen, setActiveScreen] = useState<PanelScreen>(
    isScreen(params.state) ? params.state : "products",
  );

  const handleOpenOrderDetails = (orderID: string) => {
    setParams({
      state: "order-details",
      orderId: orderID,
    });
    setActiveScreen("order-details");
  };

  const handleBackToOrders = () => {
    setParams({
      state: "orders",
      orderId: undefined,
    });
    setActiveScreen("orders");
  };

  const styles = {
    "--button-background-color": theme?.colors?.brand ?? "#000000",
    "--button-background-color-dark": theme?.colors?.brandDark ?? "#ffffff",
    "--button-text-color": theme?.colors?.brandDark ?? "#000000",
    "--button-text-color-dark": theme?.colors?.brand ?? "#000000",
  } as CSSProperties;

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

  return (
    <div
      ref={panelParentRef}
      className="font-inter relative min-h-screen w-screen bg-beige-100 text-black dark:bg-black dark:text-white md:flex"
    >
      <PanelProductHeaderComponent
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        setParams={setParams}
        styles={styles}
        theme={theme}
        logout={logout}
      />

      <main className="flex h-[calc(100vh-80px)] flex-col overflow-y-auto w-full p-5 md:h-screen">
        {activeScreen === "products" && (
          <PanelProductGridComponent
            accessToken={accessToken!}
            loginURL={loginURL ?? "/panel/login"}
            styles={styles}
            activeScreen={activeScreen}
            params={params as PanelSearchParamsType}
            setParams={setParams}
          />
        )}

        {activeScreen === "notifications" && <PanelNotificationsComponent />}

        {activeScreen === "plans" && (
          <PanelPlansComponent projectID={projectID ?? ""} />
        )}

        {activeScreen === "orders" && (
          <PanelOrderHistoryComponent
            projectID={projectID ?? ""}
            openOrderDetails={handleOpenOrderDetails}
          />
        )}

        {activeScreen === "order-details" && params.orderId && (
          <PublicOrderPage
            orderID={params.orderId}
            onBack={handleBackToOrders}
          />
        )}

        {activeScreen === "profile" && (
          <PanelProfileComponent email={email} logout={logout} />
        )}
      </main>
    </div>
  );
};

export default PanelPage;
