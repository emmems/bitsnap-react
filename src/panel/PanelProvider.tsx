import { createContext, useContext } from "react";
import {
  InstrumentProvider,
  useInstrument,
  type AnalyticsOption,
} from "../analytics/instrument";
import { RpcProvider } from "../rpc-provider";
import { getPanelConfig, type PanelConfig } from "./config";

const PanelContext = createContext<PanelConfig>(getPanelConfig());

export const PanelProvider: React.FC<{
  children: React.ReactNode;
  /**
   * Usage statistics for your Bitsnap dashboard (panel logins, orders viewed,
   * downloads, course progress). On by default; `false` turns it off. An
   * object lets you forward every event: `{ onEvent }`. Nothing is stored on
   * the visitor's device.
   */
  analytics?: AnalyticsOption;
}> = ({ children, analytics }) => {
  const config = getPanelConfig();
  const instrument = useInstrument(config.projectID, analytics, "panel");
  return (
    <RpcProvider>
      <PanelContext.Provider value={{ ...config }}>
        <InstrumentProvider value={instrument}>
          <div className="bitsnap-react">{children}</div>
        </InstrumentProvider>
      </PanelContext.Provider>
    </RpcProvider>
  );
};

export const usePanelConfig = () => useContext(PanelContext);
