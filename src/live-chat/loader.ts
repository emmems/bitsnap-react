import { createVisitorChatClient } from "../chat/client";
import { onColor } from "../consent/core/contrast";
import type { BitsnapConsentApi } from "../consent/core/types";
import { PROTOCOL, type ChatConfig, type Panel, type PanelOptions } from "./protocol";
import { buyerSession, identityChanged, loadSession, read, sessionKey, write } from "./storage";

declare const BITSNAP_REACT_EMBED_VERSION: string;
const VERSION = typeof BITSNAP_REACT_EMBED_VERSION === "string" ? BITSNAP_REACT_EMBED_VERSION : "dev";

export function originAllowed(origin: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === origin) return true;
    if (!pattern.startsWith("https://*.")) return false;
    const page = new URL(origin);
    // Mirror Instapay allowed-origins.ts, including the wildcard port.
    const base = new URL(pattern.replace("*.", ""));
    const suffix = "." + base.hostname;
    return page.protocol === "https:" && page.port === base.port && page.hostname.endsWith(suffix) &&
      page.hostname.length > suffix.length;
  });
}

export function init(script: HTMLScriptElement | null) {
  if (window.BitsnapChat || !script?.dataset.project || !script.src) return;
  const { nonce } = script;
  const projectKey = script.dataset.project;
  const apiOrigin = new URL(script.src).origin;
  const preview = script.hasAttribute("data-preview");
  const locale = /^pl\b/i.test(script.dataset.locale || document.documentElement.lang || navigator.language) ? "pl" : "en";
  const label = locale === "pl" ? "Czat ze sklepem" : "Chat with the shop";
  const host = document.createElement("bitsnap-chat");
  host.style.cssText = "all:initial;position:static";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host{all:initial;--inset:0px;--offset:0px;--right:16px;--left:auto}
    :host([data-left]){--left:16px;--right:auto}
    [hidden]{display:none!important}
    .launcher{position:fixed;bottom:calc(16px + var(--inset) + var(--offset) + env(safe-area-inset-bottom));left:var(--left);right:var(--right);z-index:2147482000;border:0;border-radius:50%;width:56px;height:56px;display:grid;place-items:center;background:var(--launcher);color:var(--on-launcher);box-shadow:0 8px 20px #10182038;cursor:pointer}
    .launcher:focus-visible{outline:2px solid currentColor;outline-offset:-5px}
    .launcher svg{width:26px;height:26px}
    .launcher .open-icon,.launcher[aria-expanded=true] .closed-icon{display:none}
    .launcher[aria-expanded=true] .open-icon{display:block}
    .launcher span{position:absolute;top:-2px;right:-2px;background:#171a20;color:white;border:2px solid white;border-radius:12px;min-width:16px;padding:0 3px;font:700 12px/19px system-ui}
    .loader-status{position:fixed;bottom:calc(84px + var(--inset) + var(--offset));left:var(--left);right:var(--right);z-index:2147482000;padding:10px 14px;background:#171a20;color:white;border-radius:8px;font:14px system-ui}
    @media(max-width:479px){.launcher{width:52px;height:52px}.launcher[aria-expanded=true]{display:none}}
    @keyframes in{from{opacity:0;transform:translateY(12px) scale(.98)}}
    @keyframes out{to{opacity:0;transform:translateY(12px) scale(.98)}}
    @keyframes icon{from{opacity:0;transform:rotate(-60deg) scale(.6)}}
    .panel-target .chat{animation:in .22s cubic-bezier(.2,.8,.2,1);transform-origin:bottom right}
    :host([data-left]) .panel-target .chat{transform-origin:bottom left}
    .panel-target[data-closing] .chat{animation:out .2s ease-in forwards;pointer-events:none}
    .launcher{transition:transform .15s ease-out}
    .launcher:hover{transform:scale(1.05)}
    .launcher:active{transform:scale(.95)}
    .launcher[data-moved] svg{animation:icon .2s ease-out}
    @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  </style><button class="launcher" type="button" aria-expanded="false" aria-controls="bitsnap-chat-dialog" aria-haspopup="dialog"><svg class="closed-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M20.5 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.5-.7L4 21l1.2-4.1a8.5 8.5 0 1 1 15.3-5.4Z"/><path stroke-linecap="round" d="M8.5 11.5h7"/></svg><svg class="open-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg><span hidden aria-hidden="true"></span></button><div class="loader-status" role="status" hidden></div><div class="panel-target" hidden></div>`;
  if (nonce) root.querySelector("style")!.nonce = nonce;
  const launcher = root.querySelector("button")!;
  const badge = root.querySelector("span")!;
  const status = root.querySelector<HTMLElement>("[role=status]")!;
  const target = root.querySelector<HTMLElement>(".panel-target")!;
  let config: ChatConfig | undefined;
  let panel: Panel | undefined;
  let loading: Promise<void> | undefined;
  let opened = false;
  let closing = 0;
  // Closing waits for the out animation before hiding; with reduced motion it hides at once.
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const showTarget = () => {
    window.clearTimeout(closing);
    delete target.dataset.closing;
    target.hidden = false;
  };
  const hideTarget = () => {
    window.clearTimeout(closing);
    if (target.hidden || reduced?.matches) {
      target.hidden = true;
      return;
    }
    target.dataset.closing = "";
    closing = window.setTimeout(() => {
      target.hidden = true;
      delete target.dataset.closing;
    }, 200);
  };
  const setBadge = (count: number) => {
    badge.hidden = count === 0;
    badge.textContent = String(count);
    const unread = locale === "pl" ? "Nowe odpowiedzi" : "New replies";
    if (opened) return;
    launcher.setAttribute("aria-label", count ? `${label}. ${unread} (${count})` : label);
  };
  setBadge(0);
  const consent = () => (window as Window & { BitsnapConsent?: BitsnapConsentApi }).BitsnapConsent;
  const updateInset = () => host.style.setProperty("--inset", `${consent()?.inset?.() ?? 0}px`);
  window.addEventListener("resize", updateInset);
  const refreshLook = (value: ChatConfig) => {
    const accent = /^#[\da-f]{6}$/i.test(value.look?.accent) ? value.look.accent : "#2f6f4f";
    host.style.setProperty("--launcher", accent);
    host.style.setProperty("--on-launcher", onColor(accent));
    host.toggleAttribute("data-left", (script.dataset.position ?? value.look?.position) === "bottom-left");
    host.style.setProperty("--offset", `${Math.max(0, Number(script.dataset.offsetBottom) || 0)}px`);
    updateInset();
  };
  const domReady = document.body ? Promise.resolve() : new Promise<void>((resolve) =>
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }),
  );
  const ready = (async () => {
    try {
      await domReady;
      if (preview) {
        config = JSON.parse(document.querySelector("[data-bitsnap-chat-config]")?.textContent ?? "null");
      } else {
        const response = await fetch(`${apiOrigin}/api/live-chat/v1/${encodeURIComponent(projectKey)}/config`);
        if (!response.ok) return;
        config = await response.json();
      }
      if (!config?.enabled || (!preview && !originAllowed(location.origin, config.origins ?? []))) return;
      refreshLook(config);
      document.body.append(host);
      const banner = consent();
      banner?.on("change", updateInset);
      void banner?.ready.then(updateInset);
      if (!preview) void peek(config).catch(() => {});
    } catch { /* A failed config request leaves the host site usable. */ }
  })();

  async function peek(config: ChatConfig) {
    const session = loadSession(projectKey);
    if (!session) return;
    const key = sessionKey(projectKey);
    if (identityChanged(session, buyerSession({ projectKey, config }))) {
      write(key, null);
      write(`${key}:seen`, null);
      return;
    }
    const lastCheck = `${key}:lastCheck`;
    if (Date.now() - Number(read(lastCheck)) < 300_000) return;
    write(lastCheck, String(Date.now()));
    const result = await createVisitorChatClient({ baseUrl: config.chatUrl, projectId: config.projectId, token: session.token }).getVisitorThread(true);
    if (!opened && result.thread) {
      const seen = read(`${key}:seen`);
      const seenIndex = result.messages.findIndex((message) => message.id === seen);
      setBadge(result.thread.unread ?? result.messages.slice(seenIndex + 1).filter((message) => message.authorEmail === "shop").length);
    }
  }
  const close = () => {
    opened = false;
    panel?.close();
    hideTarget();
    launcher.hidden = false;
    launcher.setAttribute("aria-expanded", "false");
    setBadge(Number(badge.textContent) || 0);
    status.hidden = true;
    launcher.focus();
  };
  async function open() {
    await ready;
    if (!config || !host.isConnected || opened) return;
    opened = true;
    launcher.setAttribute("aria-expanded", "true");
    status.hidden = true;
    try {
      if (!window.BitsnapChatPanel) {
        loading ??= new Promise<void>((resolve, reject) => {
          const asset = document.createElement("script");
          if (nonce) asset.nonce = nonce;
          asset.src = `${apiOrigin}/embed/v1/bitsnap-chat-panel.js?v=${encodeURIComponent(VERSION)}`;
          asset.onload = () => resolve();
          asset.onerror = () => { asset.remove(); reject(new Error("panel_load")); };
          document.head.append(asset);
        }).finally(() => { loading = undefined; });
        await loading;
      }
      if (!opened) return;
      const module = window.BitsnapChatPanel;
      if (module?.protocol !== PROTOCOL) throw new Error("protocol");
      const options: PanelOptions = { protocol: PROTOCOL, root, target, apiOrigin, projectKey, locale, config, preview, nonce, close, clearBadge: () => setBadge(0) };
      panel ??= module.mount(options);
      if (!panel) throw new Error("protocol");
      updateInset();
      showTarget();
      launcher.setAttribute("aria-label", locale === "pl" ? "Zamknij czat" : "Close chat");
      panel.open();
    } catch (error) {
      if (!opened) return;
      close();
      status.hidden = false;
      status.textContent = (error as Error).message === "protocol"
        ? (locale === "pl" ? "Odśwież stronę, aby otworzyć czat." : "Refresh the page to open chat.")
        : (locale === "pl" ? "Nie udało się otworzyć czatu. Spróbuj ponownie." : "Could not open chat. Try again.");
    }
  }
  if (preview) window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== apiOrigin || event.data?.type !== "bitsnap:live-chat-preview") return;
    const value = event.data.config as ChatConfig | undefined;
    if (!value?.look || !value.texts) return;
    const reopen = opened;
    if (opened) close();
    panel = undefined;
    config = value;
    refreshLook(value);
    if (reopen) void open();
  });
  launcher.addEventListener("click", () => {
    launcher.dataset.moved = "";
    if (opened) close(); else void open();
  });
  window.BitsnapChat = { open, close, toggle: async () => { if (opened) close(); else await open(); }, version: VERSION };
}

if (typeof document !== "undefined") init(document.currentScript as HTMLScriptElement | null);
