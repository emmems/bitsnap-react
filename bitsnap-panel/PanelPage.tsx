import { useUrlSearchParams } from "@/lib/use.search.params";
import type { UserProduct } from "@/queries/public-api/gen/public/v1/public_api_pb";
import { rpcProvider, RpcProvider, useMutation } from "@/queries/rpc-provider";
import { type GetThemeOutput } from "@/queries/trpcAstro.ts";
import PanelProductHeaderComponent from "@/src/pages/panel/PanelProductHeaderComponent.tsx";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useEffect, useState, type CSSProperties } from "react";

import PanelNotificationsComponent from "./PanelNotificationsComponent";
import PanelOrderHistoryComponent from "./PanelOrderHistoryComponent";
import PanelPlansComponent from "./PanelPlansComponent";
import PanelProductGridComponent from "./PanelProductGridComponent";
import PanelProfileComponent from "./PanelProfileComponent";

export type PanelScreen = "products" | "notifications" | "profile" | "plans" | "orders";

export type PanelSearchParamsType = {
  product?: UserProduct;
  state: PanelScreen;
};

interface Props {
  projectID: string;
  theme?: GetThemeOutput;
  loginURL: string;
}

const PanelPage = ({ projectID, theme, loginURL }: Props) => {
  let accessToken = localStorage.getItem("__access_token");
  const email = localStorage.getItem("__user-email");

  const { mutateAsync: logoutUserAsync } = useMutation(
    rpcProvider.publicApi.userPanelLogout,
  );

  async function logout() {
    await logoutUserAsync({
      accessToken: accessToken as string,
    });
    localStorage.removeItem("__access_token");
    localStorage.removeItem("__user-email");

    window.location.reload();
  }

  const [panelParentRef] = useAutoAnimate();
  const isScreen = (value: any): value is PanelScreen =>
    ["products", "notifications", "profile", "plans", "orders"].includes(value);

  const [params, setParams] = useUrlSearchParams({
    product: undefined,
    state: "products",
  } as PanelSearchParamsType);

  const [activeScreen, setActiveScreen] = useState<PanelScreen>(
    isScreen(params.state) ? params.state : "products",
  );

  const styles = {
    "--button-background-color": theme?.colors?.brand ?? "#000000",
    "--button-background-color-dark": theme?.colors?.brandDark ?? "#ffffff",
    "--button-text-color": theme?.colors?.brandDark ?? "#000000",
    "--button-text-color-dark": theme?.colors?.brand ?? "#000000",
  } as CSSProperties;

  useEffect(() => {
    if (accessToken == null || accessToken.length === 0) {
      window.location.href = loginURL;
      return;
    }

    return;
  }, []);

  useEffect(() => {
    if (accessToken == null || accessToken.length === 0) {
      window.location.href = loginURL;
      return;
    }

    return;
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

      <main className="flex h-[calc(100vh-80px)] flex-col overflow-y-auto p-5 md:h-screen">
        {activeScreen === "products" && (
          <PanelProductGridComponent
            accessToken={accessToken!}
            loginURL={loginURL}
            styles={styles}
            activeScreen={activeScreen}
            params={params as PanelSearchParamsType}
            setParams={setParams}
          />
        )}

        {activeScreen === "notifications" && <PanelNotificationsComponent />}

        {activeScreen === "plans" && (
          <PanelPlansComponent projectID={projectID} />
        )}

        {activeScreen === "orders" && (
          <PanelOrderHistoryComponent projectID={projectID} />
        )}

        {activeScreen === "profile" && (
          <PanelProfileComponent email={email} logout={logout} />
        )}
      </main>
    </div>
  );
};

export default (props: Props) => {
  return (
    <RpcProvider>
      <PanelPage {...props} />
    </RpcProvider>
  );
};
