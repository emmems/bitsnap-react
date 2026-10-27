import { normalizeHost } from "./fetch";

export type CartState = {
  /** Project the page cart is set up for, `null` or `undefined` when none yet. */
  projectID: string | null | undefined;
  /** Backend origin the page cart currently talks to. */
  host: string;
  /** Backend origin used when the page did not choose another one. */
  defaultHost: string;
};

export type CartTarget = {
  projectID: string;
  /** Omitted or empty keeps the current host. */
  host?: string;
};

export type CartPlan =
  | { ok: true; setProjectID: string | null; setHost: string | null }
  | { ok: false; reason: string };

/**
 * Decides, without changing anything, whether the page cart can serve the
 * target and what has to be filled in first. Both the project and the host are
 * checked before the caller changes either of them, so a refused click leaves
 * the page cart untouched.
 */
export function planCartTarget(state: CartState, target: CartTarget): CartPlan {
  if (state.projectID != null && state.projectID !== target.projectID) {
    return {
      ok: false,
      reason: `the page cart already belongs to project "${state.projectID}"`,
    };
  }

  let setHost: string | null = null;
  const targetHost = target.host ? normalizeHost(target.host) : "";
  const currentHost = normalizeHost(state.host);
  if (targetHost && targetHost !== currentHost) {
    if (currentHost !== normalizeHost(state.defaultHost)) {
      return {
        ok: false,
        reason: `the page cart already uses the host "${state.host}"`,
      };
    }
    setHost = targetHost;
  }

  return {
    ok: true,
    setProjectID: state.projectID == null ? target.projectID : null,
    setHost,
  };
}
