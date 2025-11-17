import {
  TransportProvider,
  useMutation as um,
  useQuery as uq,
} from "@connectrpc/connect-query";
import { createConnectTransport } from "@connectrpc/connect-web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useState } from "react";

import * as publicApiRouter from "./gen/proto/public/v1/public_api-PublicApiService_connectquery";
import * as notificationsRouter from "./gen/proto/dashboard/v1/notifications-NotificationsService_connectquery";
import { HOST } from "./components/checkout/constants";
import { Transport } from "@connectrpc/connect";

console.log("HOST", HOST);
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

export const RpcProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  if (finalTransport == null || currentFinalTransportHost !== HOST) {
    currentFinalTransportHost = HOST;
    finalTransport = createConnectTransport({
      baseUrl: HOST + "/api/rpc",
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
      })
  );

  return (
    <TransportProvider transport={finalTransport}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TransportProvider>
  );
};
