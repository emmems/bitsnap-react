import { getProjectID } from "./CartProvider";

/** The page's project ID; `undefined` (instead of a throw) during server rendering. */
export function currentProjectID(): string | undefined {
  try {
    return getProjectID();
  } catch {
    return undefined;
  }
}
