/**
 * The gesture hint ("Przeciągnij, aby obrócić") shows once per browser: the
 * first time a viewer becomes interactive (plan: gap 9). Storage may be absent
 * or throw (private mode, blocked cookies); then the hint just shows again.
 */
export const GESTURE_HINT_STORAGE_KEY = "bitsnap:viewer3d:gesture-hint-seen";

type HintStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): HintStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function hasSeenGestureHint(
  storage: HintStorage | undefined = defaultStorage(),
): boolean {
  try {
    return storage?.getItem(GESTURE_HINT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGestureHintSeen(
  storage: HintStorage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(GESTURE_HINT_STORAGE_KEY, "1");
  } catch {
    // Not remembered; the hint shows again next time.
  }
}
