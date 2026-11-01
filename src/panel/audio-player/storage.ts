/** Device-only listening memory; blocked/full storage must never stop playback. */
export const playerStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Optional memory. */
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Optional memory. */
    }
  },
};
export const SPEED_KEY = "__player__speed";
export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
