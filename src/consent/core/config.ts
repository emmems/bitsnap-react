import {
  CONSENT_CATEGORIES,
  type ConsentChoices,
  type ConsentConfig,
  type ConsentService,
} from "./types";

export const DEFAULT_API_HOST = "https://bitsnap.pl";
export const DEFAULT_COLLECT_HOST = "https://collect.bitsnap.pl";

export function defaultConfig(): ConsentConfig {
  return {
    version: 1,
    theme: "auto",
    position: "bottom",
    categories: { analytics: true, marketing: true, preferences: false },
    services: [],
    poweredBy: true,
  };
}

const THEMES = ["auto", "light", "dark"];
const POSITIONS = ["bottom", "bottom-left", "bottom-right"];

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function safeColor(value: unknown): string | undefined {
  return typeof value === "string" && HEX_COLOR.test(value.trim())
    ? value.trim()
    : undefined;
}

/** Only http(s) and relative URLs may end up in the banner. */
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const url = value.trim();
  return /^(?:https?:\/\/|\/(?!\/)|#|\?)/i.test(url) ? url : undefined;
}

function cleanServices(value: unknown): ConsentService[] {
  if (!Array.isArray(value)) return [];
  const services: ConsentService[] = [];
  for (const item of value) {
    if (
      item &&
      typeof item.name === "string" &&
      (CONSENT_CATEGORIES as readonly string[]).includes(item.category)
    ) {
      services.push({
        name: item.name,
        category: item.category,
        cookies: Array.isArray(item.cookies)
          ? item.cookies.filter((cookie: unknown) => typeof cookie === "string")
          : undefined,
      });
    }
  }
  return services;
}

/** Layers partial configs (later wins) over the defaults, dropping invalid values. */
export function mergeConfig(
  ...layers: (Partial<ConsentConfig> | null | undefined)[]
): ConsentConfig {
  const result = defaultConfig();
  for (const layer of layers) {
    if (!layer || typeof layer !== "object") continue;
    if (typeof layer.version === "number" && layer.version >= 0) {
      result.version = Math.floor(layer.version);
    }
    if (THEMES.includes(layer.theme as string)) result.theme = layer.theme!;
    if (POSITIONS.includes(layer.position as string)) result.position = layer.position!;
    const accent = safeColor(layer.accentColor);
    if (accent) result.accentColor = accent;
    const privacy = safeUrl(layer.privacyPolicyUrl);
    if (privacy) result.privacyPolicyUrl = privacy;
    if (layer.categories && typeof layer.categories === "object") {
      for (const category of CONSENT_CATEGORIES) {
        if (typeof layer.categories[category] === "boolean") {
          result.categories[category] = layer.categories[category];
        }
      }
    }
    if (layer.services !== undefined) result.services = cleanServices(layer.services);
    if (layer.texts && typeof layer.texts === "object") result.texts = layer.texts;
  }
  return result;
}

export function parseCategoryList(value: string | null | undefined): ConsentChoices {
  const wanted = (value ?? "").split(",").map((item) => item.trim());
  return {
    analytics: wanted.includes("analytics"),
    marketing: wanted.includes("marketing"),
    preferences: wanted.includes("preferences"),
  };
}

/** What `GET /api/consent/config` answers: whether the banner is on, and its config. */
export type RemoteConsentConfig = {
  /** `false` when the project turned the banner off: nothing is shown, stored choices still apply. */
  enabled: boolean;
  config: Partial<ConsentConfig> | null;
};

/** Loads the project's banner config. Resolves to `null` on any failure or after the timeout. */
export async function fetchRemoteConfig(
  apiHost: string,
  key: string,
  timeoutMs = 3000,
): Promise<RemoteConsentConfig | null> {
  if (typeof fetch !== "function") return null;
  const controller = typeof AbortController === "function" ? new AbortController() : undefined;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${apiHost.replace(/\/+$/, "")}/api/consent/config?key=${encodeURIComponent(key)}`,
      { signal: controller?.signal, credentials: "omit" },
    );
    if (!response.ok) return null;
    const body = await response.json();
    if (!body || typeof body !== "object") return null;
    const config = body.config && typeof body.config === "object" ? body.config : null;
    const enabled = body.enabled !== false;
    return config || !enabled ? { enabled, config } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
