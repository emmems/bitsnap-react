import { createContext, useContext } from "react";
import { RpcProvider } from "../rpc-provider";
import { getPanelConfig, type PanelConfig } from "./config";

const PanelContext = createContext<PanelConfig>(getPanelConfig());

export const PanelProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  return (
    <RpcProvider>
      <PanelContext.Provider value={getPanelConfig()}>
        <div className="bitsnap-react">{children}</div>
      </PanelContext.Provider>
    </RpcProvider>
  );
};

export const usePanelConfig = () => useContext(PanelContext);
