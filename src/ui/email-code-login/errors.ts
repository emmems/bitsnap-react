import { Code, ConnectError } from "@connectrpc/connect";
import type { FailureKind } from "./useEmailCodeLogin";

/**
 * Failure kind of a thrown RPC error. `ResourceExhausted` is the backend's
 * "too many requests / attempts" answer; anything that never reached the
 * server (fetch failed, offline, timeout) is a network failure.
 */
export function kindFromRpcError(error: unknown): FailureKind {
  const connect = ConnectError.from(error);
  switch (connect.code) {
    case Code.ResourceExhausted:
      return "rateLimited";
    case Code.Unavailable:
    case Code.DeadlineExceeded:
    case Code.Canceled:
      return "network";
    case Code.Unknown:
      // `fetch` rejecting (offline, CORS, DNS) surfaces as Unknown with a TypeError.
      return error instanceof TypeError || connect.cause instanceof TypeError
        ? "network"
        : "unknown";
    default:
      return "unknown";
  }
}
