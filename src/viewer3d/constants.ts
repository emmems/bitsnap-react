/**
 * Shared numbers of the 3D viewer. No three import: the shell, the hook and
 * the tests use them.
 */

/**
 * Display copies up to this size load on their own when the viewer scrolls
 * into view; bigger ones wait for "Pokaż model 3D (24 MB)".
 */
export const AUTO_LOAD_MAX_BYTES = 10 * 1024 * 1024;

/** True when the model must wait for the buyer's click. */
export function needsClickToLoad(previewSize: number): boolean {
  return previewSize > AUTO_LOAD_MAX_BYTES;
}

/**
 * `OrbitControls.autoRotateSpeed` with a time-based update: one turn takes
 * 60 / speed seconds, so 1.75 is about 34 s per turn.
 */
export const AUTO_ROTATE_SPEED = 1.75;

/** Rotation resumes this long after the buyer's last drag or zoom. */
export const AUTO_ROTATE_RESUME_MS = 3000;

/** The gesture hint disappears after this long without an interaction. */
export const GESTURE_HINT_MS = 4000;

/** Field of view of the viewer camera (degrees). */
export const CAMERA_FOV = 35;

/**
 * Default Draco decoder: three's own decoder files on jsDelivr, for the
 * `three` revision the page has installed (`REVISION` "187" → three@0.187.0),
 * so the decoder always matches the loader. jsDelivr answers with
 * `Access-Control-Allow-Origin: *`, which the decoder worker needs on any
 * domain. Pass `decoderPath` to self-host (copy
 * `three/examples/jsm/libs/draco/gltf/` to your site, e.g. `/draco/`).
 */
export function defaultDecoderPath(revision: string): string {
  const major = String(revision).replace(/\D.*$/, "") || "187";
  return `https://cdn.jsdelivr.net/npm/three@0.${major}.0/examples/jsm/libs/draco/gltf/`;
}

/**
 * "24 MB", "4,2 MB", "820 kB": the size the click-to-load button shows.
 * Decimal for small values only, in the locale's style.
 */
export function formatModelSize(bytes: number, locale = "pl-PL"): string {
  const safe = Math.max(0, bytes);
  const mb = safe / (1024 * 1024);
  if (mb >= 1) {
    const value = new Intl.NumberFormat(locale, {
      maximumFractionDigits: mb < 10 ? 1 : 0,
    }).format(mb);
    return `${value} MB`;
  }
  const kb = Math.max(1, Math.round(safe / 1024));
  return `${new Intl.NumberFormat(locale).format(kb)} kB`;
}

/** The studio light of the viewer (on top of the generated room environment). */
export const STUDIO_LIGHTS = {
  environmentIntensity: 0.9,
  ambient: 0.25,
  directional: [
    { position: [3, 6, 4] as [number, number, number], intensity: 1.1 },
    { position: [-4, 3, -3] as [number, number, number], intensity: 0.35 },
  ],
} as const;
