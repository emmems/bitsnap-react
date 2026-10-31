import { contrastRatio, onColor } from "./contrast";
import { UI_LABELS } from "./texts";
import { PALETTE, STYLES } from "./styles";
import {
  CONSENT_CATEGORIES,
  type ConsentCategory,
  type ConsentChoices,
  type ConsentConfig,
  type ConsentLocale,
  type ConsentTexts,
} from "./types";

export type UIOptions = {
  doc: Document;
  config: ConsentConfig;
  texts: ConsentTexts;
  locale: ConsentLocale;
  /** Current choice, used to preset the toggles. */
  getChoices(): ConsentChoices | null;
  /** Whether a valid choice exists, i.e. closing the settings must not bring back the banner. */
  hasChoice(): boolean;
  onAcceptAll(): void;
  onRejectAll(): void;
  onSave(choices: ConsentChoices): void;
};

export type ConsentUI = {
  /** `focus` moves keyboard focus into the banner; leave it off when the banner opens on page load. */
  showBanner(focus?: boolean): void;
  showSettings(): void;
  hide(): void;
  destroy(): void;
};

const WORDMARK =
  '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect width="16" height="16" rx="4" fill="currentColor" style="color:var(--fg)"/><circle cx="8" cy="8" r="3" fill="var(--bg)"/></svg>';

const CLOSE_ICON =
  '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';

const FOCUSABLE = "button:not([disabled]),input:not([disabled]),a[href]";

/**
 * How long the exit animation runs. The banner and the settings layer fade
 * out before they disappear, so the page does not blink.
 */
export const EXIT_ANIMATION_MS = 200;

/** A running exit animation: the node, its listener and its fallback timer. */
type Exit = {
  node: HTMLElement;
  listener: (event: Event) => void;
  timer: number | undefined;
};

export function createUI(options: UIOptions): ConsentUI {
  const { doc, config, texts, locale } = options;
  const labels = UI_LABELS[locale];
  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;
  let root: HTMLElement;
  let banner: HTMLElement;
  let overlay: HTMLElement;
  let dialog: HTMLElement;
  let settingsButton: HTMLElement;
  let layer: "none" | "banner" | "settings" = "none";
  let opener: HTMLElement | null = null;
  let media: MediaQueryList | null = null;
  const toggles = new Map<ConsentCategory, HTMLInputElement>();
  /** The exit animations running right now; at most one per node. */
  const exits: Exit[] = [];

  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Record<string, string> = {},
    ...children: (Node | string)[]
  ): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    for (const key of Object.keys(props)) {
      if (key === "class") node.className = props[key];
      else node.setAttribute(key, props[key]);
    }
    for (const child of children) node.append(child);
    return node;
  }

  function button(cls: string, text: string, onClick: () => void) {
    const node = el("button", { type: "button", class: cls }, text);
    node.addEventListener("click", onClick);
    return node;
  }

  function powered(): HTMLElement {
    const link = el("a", {
      href: `https://bitsnap.pl/?utm_source=consent_banner&utm_medium=referral&utm_content=${encodeURIComponent(doc.location?.hostname ?? "")}`,
      target: "_blank",
      rel: "noopener",
    });
    link.append(texts.poweredBy + " ");
    link.insertAdjacentHTML("beforeend", WORDMARK);
    link.append(el("b", {}, "bitsnap"));
    return el("div", { class: "foot" }, link);
  }

  function description(): HTMLElement {
    const node = el("p", { class: "desc", id: "d" }, texts.description);
    if (config.privacyPolicyUrl) {
      node.append(
        " ",
        el(
          "a",
          { href: config.privacyPolicyUrl, target: "_blank", rel: "noopener" },
          labels.privacy,
        ),
      );
    }
    return node;
  }

  function buildBanner() {
    settingsButton = button("link-btn", texts.settings, () => showSettings());
    banner = el(
      "div",
      {
        class: `banner ${config.position === "bottom" ? "bottom" : `card ${config.position}`}`,
        // Not modal: the page stays usable, so it is a live region, not a dialog.
        role: "region",
        "aria-live": "polite",
        "aria-labelledby": "t",
        "aria-describedby": "d",
        tabindex: "-1",
      },
      el(
        "div",
        { class: "inner" },
        el("div", { class: "text" }, el("div", { class: "title", id: "t" }, texts.title), description()),
        el(
          "div",
          { class: "actions" },
          button("btn", texts.acceptAll, options.onAcceptAll),
          button("btn", texts.rejectAll, options.onRejectAll),
          settingsButton,
        ),
        powered(),
      ),
    );
  }

  function category(id: ConsentCategory | "necessary"): HTMLElement {
    const services = config.services.filter((service) => service.category === id);
    const input = el("input", { type: "checkbox", role: "switch", "aria-labelledby": `l-${id}`, "aria-describedby": `p-${id}` });
    if (id === "necessary") {
      input.checked = true;
      input.disabled = true;
    } else {
      toggles.set(id, input);
    }
    const node = el(
      "div",
      { class: "cat" },
      el(
        "div",
        { class: "row" },
        el("span", { class: "cat-title", id: `l-${id}` }, texts[`${id}Title` as keyof ConsentTexts]),
        el(
          "span",
          { style: "display:flex;align-items:center" },
          ...(id === "necessary" ? [el("span", { class: "always" }, labels.always)] : []),
          el("label", { class: "switch" }, input, el("span", { class: "track" })),
        ),
      ),
      el("p", { id: `p-${id}` }, texts[`${id}Description` as keyof ConsentTexts]),
    );
    if (services.length > 0) {
      node.append(
        el("p", { class: "svc" }, el("b", {}, `${labels.services}: `), services.map((s) => s.name).join(", ")),
      );
    }
    return node;
  }

  function buildSettings() {
    const close = el("button", { type: "button", class: "x", "aria-label": texts.close });
    close.insertAdjacentHTML("beforeend", CLOSE_ICON);
    close.addEventListener("click", () => closeSettings());
    const body = el("div", { class: "d-body" }, category("necessary"));
    for (const id of CONSENT_CATEGORIES) {
      if (config.categories[id]) body.append(category(id));
    }
    dialog = el(
      "div",
      { class: "dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "st", tabindex: "-1" },
      el("div", { class: "d-head" }, el("div", { class: "title", id: "st" }, texts.settings), close),
      body,
      el(
        "div",
        { class: "d-foot" },
        el(
          "div",
          { class: "actions" },
          button("btn", texts.save, () => options.onSave(readToggles())),
          button("btn", texts.acceptAll, options.onAcceptAll),
          button("btn", texts.rejectAll, options.onRejectAll),
        ),
        powered(),
      ),
    );
    overlay = el("div", { class: "overlay" }, dialog);
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) closeSettings();
    });
  }

  function readToggles(): ConsentChoices {
    const choices = { analytics: false, marketing: false, preferences: false };
    toggles.forEach((input, key) => (choices[key] = input.checked));
    return choices;
  }

  function applyTheme() {
    const dark = config.theme === "dark" || (config.theme === "auto" && !!media?.matches);
    root.setAttribute("data-theme", dark ? "dark" : "light");
    applyAccent(dark);
  }

  /** A custom accent that is too faint on the dark background gives way to the dark theme's own. */
  function applyAccent(dark: boolean) {
    const accent = config.accentColor;
    if (!accent) return;
    if (dark && contrastRatio(accent, PALETTE.dark.bg) < 3) {
      for (const name of ["--accent", "--focus", "--on-accent"]) root.style.removeProperty(name);
      return;
    }
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--focus", accent);
    root.style.setProperty("--on-accent", onColor(accent));
  }

  function ensure() {
    if (host) return;
    host = el("div", { id: "bitsnap-consent", "data-bitsnap-consent-host": "" });
    shadow = host.attachShadow({ mode: "open" });
    shadow.append(el("style", {}, STYLES));
    root = el("div", { class: "root", lang: locale });
    buildBanner();
    buildSettings();
    banner.hidden = true;
    overlay.hidden = true;
    root.append(banner, overlay);
    shadow.append(root);
    if (typeof doc.defaultView?.matchMedia === "function") {
      media = doc.defaultView.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener?.("change", applyTheme);
    }
    applyTheme();
    doc.body.append(host);
  }

  function focusables(): HTMLElement[] {
    return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
  }

  /** Whether the visitor asked for less motion: the layers then come and go at once. */
  function reducedMotion(): boolean {
    try {
      return doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    } catch {
      return false;
    }
  }

  /** Stops a running exit animation; the node stays where it is. */
  function stopExit(node: HTMLElement) {
    const index = exits.findIndex((exit) => exit.node === node);
    if (index === -1) return;
    const [exit] = exits.splice(index, 1);
    exit.node.removeEventListener("animationend", exit.listener);
    if (exit.timer !== undefined) doc.defaultView?.clearTimeout(exit.timer);
    exit.node.classList.remove("closing");
  }

  /** Hides the node at once, without an animation. */
  function hideNow(node: HTMLElement) {
    stopExit(node);
    node.hidden = true;
  }

  /**
   * Fades the node out and hides it when the animation ends. The timer is the
   * fallback for a browser that sends no event (a hidden tab, a reduced
   * motion setting): the layer always disappears.
   */
  function exitTo(node: HTMLElement) {
    stopExit(node);
    if (node.hidden) return;
    if (reducedMotion()) {
      node.hidden = true;
      return;
    }
    node.classList.add("closing");
    const listener = (event: Event) => {
      // Another animation of a child ends first; only our own counts.
      if (event.target !== node) return;
      finish();
    };
    const timer = doc.defaultView?.setTimeout(finish, EXIT_ANIMATION_MS + 120);
    function finish() {
      stopExit(node);
      node.hidden = true;
    }
    node.addEventListener("animationend", listener);
    exits.push({ node, listener, timer });
  }

  /** Shows the node and plays the entrance animation again. */
  function enter(node: HTMLElement) {
    stopExit(node);
    node.hidden = false;
    // The class has to leave and come back, or the animation does not restart.
    node.classList.remove("enter");
    void node.offsetWidth;
    node.classList.add("enter");
  }

  function onKeydown(event: KeyboardEvent) {
    if (layer !== "settings") return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeSettings();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables();
    if (items.length === 0) return;
    const active = shadow?.activeElement as HTMLElement | null;
    const first = items[0];
    const last = items[items.length - 1];
    const outside = !active || !dialog.contains(active);
    if (event.shiftKey && (outside || active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (outside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  }

  function showBanner(focus = false) {
    try {
      ensure();
      layer = "banner";
      doc.removeEventListener("keydown", onKeydown, true);
      hideNow(overlay);
      enter(banner);
      if (focus) banner.focus({ preventScroll: true });
    } catch {
      // never throw into the host page
    }
  }

  function showSettings() {
    try {
      ensure();
      if (layer !== "settings") {
        const active = doc.activeElement as HTMLElement | null;
        opener = active && active !== host && active !== doc.body ? active : null;
      }
      const current = options.getChoices();
      toggles.forEach((input, key) => (input.checked = !!current?.[key]));
      layer = "settings";
      hideNow(banner);
      enter(overlay);
      enter(dialog);
      doc.addEventListener("keydown", onKeydown, true);
      dialog.focus({ preventScroll: true });
    } catch {
      // never throw into the host page
    }
  }

  function closeSettings() {
    if (layer !== "settings") return;
    doc.removeEventListener("keydown", onKeydown, true);
    exitTo(overlay);
    if (options.hasChoice()) {
      layer = "none";
      opener?.focus?.({ preventScroll: true });
    } else {
      layer = "banner";
      enter(banner);
      settingsButton.focus({ preventScroll: true });
    }
  }

  function hide() {
    if (!host) return;
    doc.removeEventListener("keydown", onKeydown, true);
    const wasSettings = layer === "settings";
    layer = "none";
    exitTo(banner);
    exitTo(overlay);
    if (wasSettings) opener?.focus?.({ preventScroll: true });
  }

  function destroy() {
    doc.removeEventListener("keydown", onKeydown, true);
    media?.removeEventListener?.("change", applyTheme);
    while (exits.length > 0) stopExit(exits[0]!.node);
    host?.remove();
    host = null;
    shadow = null;
    layer = "none";
  }

  return { showBanner, showSettings, hide, destroy };
}
