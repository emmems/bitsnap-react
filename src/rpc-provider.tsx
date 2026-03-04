import {
  TransportProvider,
  useMutation as um,
  useQuery as uq,
} from "@connectrpc/connect-query";
import { createConnectTransport } from "@connectrpc/connect-web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useState } from "react";

import { Transport } from "@connectrpc/connect";
import { HOST, setCustomHost } from "./components/checkout/constants";
import * as notificationsRouter from "./gen/proto/dashboard/v1/notifications-NotificationsService_connectquery";
import * as publicApiRouter from "./gen/proto/public/v1/public_api-PublicApiService_connectquery";

let currentFinalTransportHost: string | undefined;
let finalTransport: Transport | undefined;

// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};

export const rpcProvider = {
  publicApi: publicApiRouter,
  notifications: notificationsRouter,
};

export const useQuery = uq;
export const useMutation = um;

let customHost: string | undefined;

export function setHost(host: string): void {
  customHost = host;
  setCustomHost(host);
}

function getTransportHost(): string {
  return customHost ?? HOST;
}

export const RpcProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const transportHost = getTransportHost();

  if (finalTransport == null || currentFinalTransportHost !== transportHost) {
    currentFinalTransportHost = transportHost;
    finalTransport = createConnectTransport({
      baseUrl: transportHost + "/api/rpc",
      useBinaryFormat: true,
      // @ts-ignore
      fetch: async (input, init?) => {
        return fetch(input, {
          ...init,
          keepalive: false,
          credentials: "include",
        });
      },
    });
  }

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5000 } },
      }),
  );

  return (
    <TransportProvider transport={finalTransport}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TransportProvider>
  );
};
