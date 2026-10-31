import { Code, ConnectError, createClient, type Transport } from "@connectrpc/connect";

import {
  ModelDeliveryFailure,
  ModelDeliveryService,
} from "../../gen/proto/public/v1/model_delivery_pb";
import type { ModelFilesLoad } from "./model-files-load";

/**
 * Lists the buyer's 3D files (`public.v1.ModelDeliveryService`). Loaded with
 * `import()` by `useModelFiles`, so the service descriptor stays out of the
 * main bundle. A transport error (an older server without the service
 * answers 404 / unimplemented) or any failure other than an expired session
 * hides the section.
 */
export async function listModelFiles(
  transport: Transport,
  accessToken: string,
  projectID: string,
): Promise<ModelFilesLoad> {
  try {
    const response = await createClient(ModelDeliveryService, transport).listModelFiles({
      accessToken,
      projectId: projectID,
    });
    if (response.result.case === "success") {
      return { status: "ready", models: response.result.value.models };
    }
    if (
      response.result.case === "failure" &&
      response.result.value === ModelDeliveryFailure.UNAUTHORIZED
    ) {
      return { status: "unauthorized" };
    }
    return { status: "hidden" };
  } catch (error) {
    const code = ConnectError.from(error).code;
    if (code !== Code.Unimplemented && code !== Code.NotFound) {
      console.warn("[bitsnap-react] 3D files could not be loaded", error);
    }
    return { status: "hidden" };
  }
}
