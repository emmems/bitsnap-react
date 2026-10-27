import { createClient } from "@connectrpc/connect";
import { getPanelConfig } from "../panel/config";
import { getPanelSession } from "../panel/session-storage";
import { getRpcTransport, getTransportHost } from "../rpc-provider";
import { UserPanelCourseService } from "../gen/proto/public/v1/user_panel_course_pb";
import { createCourseDataSource } from "./datasource";
import type { CourseDataSource } from "./types";

export type RpcCourseDataSourceOptions = {
  /** `UserProduct.access_id` of the purchased course. */
  accessId: string;
  /**
   * Panel session token. By default it is read from the panel session of the
   * configured project (`setProjectID`, `setHost`) on every call.
   */
  accessToken?: string;
  /** Bitsnap host; the panel host (`setHost`, bitsnap.pl by default) otherwise. */
  host?: string;
};

/**
 * Default data source: `UserPanelCourseService` on `{host}/api/rpc`, using the
 * transport and the session token of the panel.
 */
export function createRpcCourseDataSource(
  options: RpcCourseDataSourceOptions,
): CourseDataSource {
  const host = options.host ?? getTransportHost();
  const client = createClient(UserPanelCourseService, getRpcTransport(host));
  return createCourseDataSource(client, {
    accessId: options.accessId,
    accessToken:
      options.accessToken ??
      (() => {
        const { projectID, host: panelHost } = getPanelConfig();
        return getPanelSession(projectID, panelHost);
      }),
  });
}
