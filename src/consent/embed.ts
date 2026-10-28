import { createConsent } from "./core/controller";
import { parseCategoryList, safeColor } from "./core/config";
import type { BitsnapConsentApi, ConsentOptions } from "./core/types";

declare global {
  interface Window {
    BitsnapConsent?: BitsnapConsentApi;
  }
}

/** Reads the `data-*` attributes of the embed `<script>` tag. */
export function readScriptOptions(script: HTMLElement | null): ConsentOptions {
  const get = (name: string) => script?.getAttribute(`data-${name}`) || undefined;
  const options: ConsentOptions = {
    projectKey: get("project"),
    apiHost: get("api-host"),
    collectHost: get("collect-host"),
    privacyPolicyUrl: get("privacy-url"),
    reloadOnWithdraw: get("reload-on-withdraw") === "true",
  };
  const theme = get("theme");
  if (theme === "auto" || theme === "light" || theme === "dark") options.theme = theme;
  const locale = get("locale");
  if (locale === "auto" || locale === "pl" || locale === "en") options.locale = locale;
  const position = get("position");
  if (position === "bottom" || position === "bottom-left" || position === "bottom-right") {
    options.position = position;
  }
  if (get("scope") === "project") options.scope = "project";
  const gcm = get("gcm");
  if (gcm === "on" || gcm === "off") options.gcm = gcm;
  const categories = get("categories");
  if (categories !== undefined) options.categories = parseCategoryList(categories);
  const accent = safeColor(get("accent"));
  if (accent) options.config = { accentColor: accent };
  if (get("preview") === "on") options.preview = true;
  const title = get("title")?.trim();
  if (title) options.title = title;
  const description = get("description")?.trim();
  if (description) options.description = description;
  return options;
}

/** Starts the banner once per page, whatever number of tags include the script. */
export function init(script: HTMLElement | null): BitsnapConsentApi | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    if (window.BitsnapConsent) return window.BitsnapConsent;
    const api = createConsent(readScriptOptions(script));
    window.BitsnapConsent = api;
    return api;
  } catch {
    return undefined;
  }
}

if (typeof document !== "undefined") {
  init(document.currentScript as HTMLElement | null);
}
