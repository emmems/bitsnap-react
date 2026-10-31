import { useTransport } from "@connectrpc/connect-query";
import { useEffect, useState } from "react";

import type { PurchasedModel } from "../../gen/proto/public/v1/model_delivery_pb";

/** What the 3D files call ended with; `hidden` = no 3D delivery on the server (or it failed). */
export type ModelFilesLoad =
  | { status: "loading" }
  | { status: "hidden" }
  | { status: "unauthorized" }
  | { status: "ready"; models: PurchasedModel[] };

/**
 * The buyer's 3D files, once per token. The RPC client is loaded with
 * `import()`, so pages that never mount the panel products screen do not
 * carry it.
 */
export function useModelFiles(
  accessToken: string,
  projectID: string,
): ModelFilesLoad {
  const transport = useTransport();
  const [load, setLoad] = useState<ModelFilesLoad>({ status: "loading" });

  useEffect(() => {
    if (!accessToken) {
      setLoad({ status: "hidden" });
      return;
    }
    let cancelled = false;
    setLoad({ status: "loading" });
    import("./model-files-client")
      .then(({ listModelFiles }) => listModelFiles(transport, accessToken, projectID))
      .catch((): ModelFilesLoad => ({ status: "hidden" }))
      .then((next) => {
        if (!cancelled) setLoad(next);
      });
    return () => {
      cancelled = true;
    };
  }, [transport, accessToken, projectID]);

  return load;
}
