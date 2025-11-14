import type { Transport } from "@connectrpc/connect";
import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { PublicApiService } from "./gen/proto/public/v1/public_api_pb";

export namespace PublicApiClient {
  export function get(host: string): Client<typeof PublicApiService> {
    return createClient(PublicApiService, getTransport(host));
  }

  let transport: Transport | undefined;
  function getTransport(host: string): Transport {
    if (transport == null) {
      transport = createConnectTransport({
        useBinaryFormat: true,
        baseUrl: host + "/api/rpc",
      });
    }
    return transport;
  }
}
