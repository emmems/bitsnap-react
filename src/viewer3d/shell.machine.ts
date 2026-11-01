import { needsClickToLoad } from "./constants";

/**
 * The states of `Model3DShell` (plan: "Buyer viewer" → Module). Pure, so the
 * click-to-load rule, the per-variant re-check and the error path are tested
 * without a browser.
 *
 * - `poster`: the thumbnail; the model loads once the section is visible.
 * - `awaiting-click`: a display copy over 10 MB; nothing is downloaded until
 *   the buyer asks ("Pokaż model 3D (24 MB)" or the hero pill).
 * - `loading`: the viewer is mounted and downloads; the poster stays with a
 *   progress bar until the first frame.
 * - `ready`: the model is on screen.
 * - `error`: the poster stays with "Spróbuj ponownie".
 * - `unsupported`: no WebGL; the poster stays.
 */
export type ShellStatus =
  "poster" | "awaiting-click" | "loading" | "ready" | "error" | "unsupported";

export type ShellModel = {
  /** Identifies the model (its preview URL). */
  key: string;
  /** Bytes of the display copy. */
  size: number;
};

export type ShellState = {
  status: ShellStatus;
  model: ShellModel;
  /** 0..1 of the download; 0 while unknown. */
  progress: number;
  /** Bumped on every retry, so the viewer remounts and loads again. */
  attempt: number;
};

export type ShellEvent =
  /** The section came near the viewport (and WebGL works). */
  | { type: "VISIBLE" }
  /** The buyer asked: the button, the hero pill. Loads whatever the size. */
  | { type: "REQUEST" }
  | { type: "PROGRESS"; key: string; loaded: number; total: number }
  | { type: "LOADED"; key: string }
  | { type: "FAILED"; key: string }
  | { type: "RETRY" }
  | { type: "NO_WEBGL" }
  /** Another variant: another model, or the same one again. */
  | { type: "MODEL_CHANGED"; model: ShellModel; visible: boolean };

function statusFor(model: ShellModel, visible: boolean): ShellStatus {
  if (needsClickToLoad(model.size)) return "awaiting-click";
  return visible ? "loading" : "poster";
}

export function initialShellState(model: ShellModel): ShellState {
  return { status: statusFor(model, false), model, progress: 0, attempt: 0 };
}

export function shellReducer(state: ShellState, event: ShellEvent): ShellState {
  switch (event.type) {
    case "NO_WEBGL":
      return state.status === "ready"
        ? state
        : { ...state, status: "unsupported" };

    case "VISIBLE":
      return state.status === "poster"
        ? { ...state, status: "loading", progress: 0 }
        : state;

    case "REQUEST":
      if (state.status === "poster" || state.status === "awaiting-click") {
        return { ...state, status: "loading", progress: 0 };
      }
      if (state.status === "error") {
        return {
          ...state,
          status: "loading",
          progress: 0,
          attempt: state.attempt + 1,
        };
      }
      return state;

    case "RETRY":
      return state.status === "error"
        ? {
            ...state,
            status: "loading",
            progress: 0,
            attempt: state.attempt + 1,
          }
        : state;

    case "PROGRESS": {
      if (state.status !== "loading" || event.key !== state.model.key)
        return state;
      const progress =
        event.total > 0
          ? Math.min(1, Math.max(0, event.loaded / event.total))
          : 0;
      return progress === state.progress ? state : { ...state, progress };
    }

    case "LOADED":
      if (state.status !== "loading" || event.key !== state.model.key)
        return state;
      return { ...state, status: "ready", progress: 1 };

    case "FAILED":
      if (state.status !== "loading" || event.key !== state.model.key)
        return state;
      return { ...state, status: "error" };

    case "MODEL_CHANGED": {
      if (event.model.key === state.model.key) {
        return event.model.size === state.model.size
          ? state
          : { ...state, model: event.model };
      }
      if (state.status === "unsupported")
        return { ...state, model: event.model };
      // The rule applies per variant: a big model asks again, whatever came before.
      return {
        status: statusFor(event.model, event.visible),
        model: event.model,
        progress: 0,
        attempt: 0,
      };
    }
  }
}

/** The viewer (and its download) exists only in these states. */
export function isViewerMounted(status: ShellStatus): boolean {
  return status === "loading" || status === "ready";
}
