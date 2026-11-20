import { ChatError, createVisitorChatClient } from "../../chat/client";
import type { ChatMessage, VisitorThread } from "../../chat/types";
import { contrastRatio, ensure, onColor } from "../../consent/core/contrast";
import { PROTOCOL, type ChatConfig, type Panel, type PanelOptions, type VisitorSession } from "../protocol";
import { buyerSession, identityChanged, loadSession, read, sessionKey, validSession, write } from "../storage";
import { requestSession } from "./api";
import { challenge } from "./captcha";
import { styles } from "./styles";
import { texts } from "./texts";

const POLL = 10_000;
const IDLE = 30 * 60_000;
const SEND_TIMEOUT = 30_000;
type Draft = { body: string; clientId: string };
type Pending = { draft: Draft; message: ChatMessage; acceptedAt: number; failed?: boolean; retryable?: boolean };

function httpsUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return;
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* Seller URL is optional. */ }
  return undefined;
}

export function mount(options: PanelOptions): Panel | undefined {
  if (options.protocol !== PROTOCOL) return;
  const { target, root, config, locale } = options;
  const t = texts[locale];
  const key = sessionKey(options.projectKey);
  const page = options.mode === "page";
  const shop = config.texts?.shopName || t.shop;
  const motion = window.matchMedia("(max-width:479px)");
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const template = document.createElement("template");
  template.innerHTML = `<style>${styles}</style>
    <section class="chat" id="bitsnap-chat-dialog" role="dialog" aria-labelledby="bchat-title">
      <header><span class="avatar" aria-hidden="true"></span><div class="title"><h2 id="bchat-title"></h2><small class="identity" hidden></small><button class="add" hidden type="button">${t.add}</button></div>
        <button class="icon menu-button" type="button" aria-label="${t.menu}" aria-haspopup="menu" aria-controls="bchat-menu" aria-expanded="false"><svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>
        <button class="icon close" type="button" aria-label="${t.close}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
        <div id="bchat-menu" role="menu" hidden></div>
      </header>
      <div class="scroll"><button class="older" type="button" hidden>${t.older}</button><div role="log" aria-live="polite" aria-relevant="additions text"></div>
        <form class="email-card" hidden><p>${t.offer}</p><label for="bchat-email">${t.email}</label><input id="bchat-email" type="email" maxlength="254" autocomplete="email" required aria-describedby="bchat-email-error">
          <p id="bchat-email-error" class="error" role="alert"></p><div><button class="primary" type="submit">${t.save}</button> <button class="skip" type="button">${t.skip}</button></div>
        </form>
      </div>
      <footer><div class="notice" role="status" hidden></div><p class="error send-error" role="alert"></p>
        <div class="legal"><p>${t.processing} </p></div>
        <div class="captcha" data-title="${t.captcha}"><p class="notice">${t.captchaHint}</p><button type="button">${t.popup}</button></div>
        <form class="composer"><textarea rows="1" aria-describedby="bchat-counter" aria-label="${t.message}" placeholder="${t.message}"></textarea><button class="primary" type="submit">${t.send}</button></form>
        <div id="bchat-counter" class="counter" hidden></div>
      </footer>
    </section>`;
  if (options.nonce) template.content.querySelector("style")!.nonce = options.nonce;
  target.replaceChildren(template.content);
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => target.querySelector<T>(selector)!;
  const dialog = find(".chat");
  const closeButton = find<HTMLButtonElement>(".close");
  const menu = find("#bchat-menu");
  const menuButton = find<HTMLButtonElement>(".menu-button");
  const scroll = find(".scroll");
  const log = find("[role=log]");
  const olderButton = find<HTMLButtonElement>(".older");
  const legal = find(".legal");
  const composer = find<HTMLFormElement>(".composer");
  const field = find<HTMLTextAreaElement>("textarea");
  const counter = find("#bchat-counter");
  const sendButton = find<HTMLButtonElement>(".composer button");
  const captcha = find(".captcha");
  const emailCard = find<HTMLFormElement>(".email-card");
  const emailField = find<HTMLInputElement>("#bchat-email");
  const emailError = find("#bchat-email-error");
  const addEmail = find<HTMLButtonElement>(".add");
  const status = find(".notice");
  const sendError = find(".send-error");

  const makeLink = (href: string, label: string) => {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  };
  const privacy = httpsUrl(config.privacyUrl);
  if (privacy) {
    legal.firstElementChild?.append(makeLink(privacy, t.privacy));
    menu.append(makeLink(privacy, t.privacy));
  }
  // Rebuilt on every menu open: on a single-page shop the page changes after mount.
  const reportHref = () => {
    const report = new URL("https://bitsnap.pl/zglos-naruszenie");
    report.searchParams.set("shop", options.projectKey);
    report.searchParams.set("url", page ? (httpsUrl(options.shopUrl) || options.apiOrigin) : pageUrl());
    report.searchParams.set("locale", locale);
    return report.href;
  };
  const reportLink = makeLink(reportHref(), t.abuse);
  menu.append(reportLink);
  for (const link of menu.children) link.setAttribute("role", "menuitem");
  const retention = document.createElement("p");
  retention.textContent = t.retention;
  legal.append(retention);
  find("#bchat-title").textContent = shop;
  const avatar = find(".avatar");
  avatar.hidden = !config.texts?.shopName;
  avatar.textContent = Array.from(shop.trim())[0]?.toLocaleUpperCase(locale) ?? "";
  dialog.toggleAttribute("data-page", page);
  closeButton.hidden = page;
  const shopUrl = httpsUrl(options.shopUrl);
  if (page && shopUrl) {
    const back = makeLink(shopUrl, t.back);
    back.target = "_self";
    find("header .title").append(back);
  }

  let session: VisitorSession | undefined;
  let persisted = false;
  let buyer: ReturnType<typeof buyerSession>;
  let invalidBuyer: string | undefined;
  let active = false;
  let busy = false;
  let identifying = false;
  let pollInFlight = false;
  let pollAgain = false;
  let abortChallenge: AbortController | undefined;
  let life: AbortController | undefined;
  let pollTimer = 0;
  let cooldownTimer = 0;
  let cooldownUntil = 0;
  let interval = POLL;
  let lastActivity = 0;
  let previousOverflow = "";
  let scrollerLocked = false;
  let dark = false;
  let thread: VisitorThread["thread"] = null;
  let accepted = false;
  let forceEmail = false;
  let emailAlreadySet = false;
  let pageUnavailable = false;
  let draft: Draft | undefined;
  let messages: ChatMessage[] = [];
  let olderMessages: ChatMessage[] = [];
  let olderHasMore: boolean | undefined;
  let pollingHasMore = false;
  let loadingOlder = false;
  let unreadStart: string | undefined;
  let hasRead = false;
  let pending: Pending[] = [];
  let lock: string | undefined;
  let sendFeedback = "";
  let notice = "";
  let contact = false;
  let max = config.limits?.messageMax || 1000;
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const transport = (token: string) => createVisitorChatClient({ token, baseUrl: config.chatUrl, projectId: config.projectId });
  const getBuyer = () => options.preview || page ? undefined : buyerSession(options);
  const verified = () => session?.verified || !!session?.verifiedEmail;
  const usableBuyer = () => buyer && buyer.token !== invalidBuyer ? buyer : undefined;

  function remember() {
    if (!options.preview && !page && persisted && session) write(key, JSON.stringify(session));
  }

  function resetSession() {
    if (!options.preview && !page) {
      write(key, null);
      write(`${key}:seen`, null);
    }
    session = undefined;
    invalidBuyer = undefined;
    persisted = false;
    accepted = false;
    forceEmail = false;
    emailAlreadySet = false;
    thread = null;
    max = config.limits?.messageMax || 1000;
    messages = [];
    olderMessages = [];
    olderHasMore = undefined;
    pollingHasMore = false;
    unreadStart = undefined;
    hasRead = false;
    pending = [];
    draft = undefined;
    lock = undefined;
    emailField.value = "";
    emailError.textContent = "";
    emailField.removeAttribute("aria-invalid");
  }

  function restoreStoredSession() {
    if (!session && !page && !options.preview) {
      session = loadSession(options.projectKey);
      persisted = !!session;
    }
  }

  function syncBuyer() {
    buyer = getBuyer();
    if ((!page && session && identityChanged(session, buyer)) || (session && !validSession(session))) {
      if (page) unavailable();
      else resetSession();
    }
  }

  function setTheme() {
    dark = config.look?.theme === "dark" || (config.look?.theme !== "light" && system.matches);
    dialog.toggleAttribute("data-dark", dark);
    const base = dark ? "#171a20" : "#ffffff";
    const surface = dark ? "#252a33" : "#f2f4f7";
    const original = /^#[\da-f]{6}$/i.test(config.look?.accent) ? config.look.accent : "#2f6f4f";
    const accent = dark ? ensure(original, base, 3) : original;
    const on = onColor(accent);
    dialog.style.setProperty("--accent", accent);
    dialog.style.setProperty("--on-accent", contrastRatio(on, accent) >= 4.5 ? on : "#000");
    dialog.style.setProperty("--accent-text", ensure(accent, surface, 4.5));
  }

  function scrollBottom() { scroll.scrollTop = scroll.scrollHeight; }

  function history() {
    const first = messages[0];
    const firstTime = Date.parse(first?.createdAt ?? "");
    return [
      ...olderMessages.filter((old) => Date.parse(old.createdAt) < firstTime && old.id !== first?.id),
      ...messages,
    ];
  }

  function renderMessages() {
    const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 70;
    const rows: { id: string; body: string; label: string; divider?: "date" | "new-reply"; own?: boolean; state?: string; retry?: Pending }[] = [];
    if (config.texts?.greeting && !pageUnavailable) rows.push({ id: "greeting", body: config.texts.greeting, label: shop });
    let previousDate: string | undefined;
    for (const message of history()) {
      if (message.deleted) continue;
      const timestamp = Date.parse(message.createdAt);
      const sentAt = Number.isFinite(timestamp) ? time.format(timestamp) : undefined;
      if (sentAt) {
        const sentOn = date.format(timestamp);
        if (sentOn !== previousDate) {
          rows.push({ id: `date:${sentOn}`, body: sentOn, label: "", divider: "date" });
          previousDate = sentOn;
        }
      }
      const own = !message.system && message.authorEmail !== "shop";
      if (message.id === unreadStart) rows.push({ id: "unread", body: t.newReply, label: "", divider: "new-reply" });
      const author = message.system ? t.system : own ? t.you : shop;
      rows.push({
        id: message.id, body: message.body, own,
        label: sentAt && !own ? `${author} · ${sentAt}` : author,
        state: own ? (sentAt ? `${t.sent} · ${sentAt}` : t.sent) : undefined,
      });
    }
    for (const item of pending) {
      rows.push({
        id: item.message.id || item.draft.clientId, body: item.draft.body, label: t.you, own: true,
        state: item.failed ? t.unsent : t.sending, retry: item.failed && item.retryable && !lock ? item : undefined,
      });
    }
    const nextIds = new Set(rows.map((row) => row.id));
    for (const child of Array.from(log.children) as HTMLElement[]) {
      if (!nextIds.has(child.dataset.id!)) child.remove();
    }
    let cursor = log.firstElementChild;
    for (const row of rows) {
      let node = cursor as HTMLElement | null;
      if (node?.dataset.id !== row.id) {
        node = Array.from(log.children).find((child): child is HTMLElement => (child as HTMLElement).dataset.id === row.id) ?? document.createElement("div");
        node.dataset.id = row.id;
        log.insertBefore(node, cursor);
      }
      cursor = node.nextElementSibling;
      const signature = JSON.stringify([row.body, row.label, row.own, !!row.state, !!row.retry]);
      if (node.dataset.signature === signature) {
        const state = node.querySelector("small");
        if (state && state.textContent !== row.state) state.textContent = row.state ?? "";
        const retry = node.querySelector("button");
        if (retry) retry.disabled = busy || cooldownUntil > Date.now();
        continue;
      }
      node.dataset.signature = signature;
      node.className = row.divider ?? (row.own ? "row own" : "row");
      if (row.divider) {
        node.textContent = row.body;
        continue;
      }
      const label = document.createElement("div");
      label.className = "meta";
      label.textContent = row.label;
      const bubble = document.createElement("p");
      bubble.className = "bubble";
      bubble.textContent = row.body;
      node.replaceChildren(label, bubble);
      if (row.state) {
        const state = document.createElement("small");
        state.className = "meta";
        state.textContent = row.state;
        node.append(state);
      }
      if (row.retry) {
        const item = row.retry;
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = t.retry;
        retry.disabled = busy || cooldownUntil > Date.now();
        retry.onclick = () => void send(item.draft, item);
        node.append(retry);
      }
    }
    if (nearBottom) scrollBottom();
  }

  function render() {
    const identity = find(".identity");
    const address = usableBuyer()?.email ?? (verified() ? session?.email ?? session?.verifiedEmail : undefined);
    identity.textContent = address ? `${t.as} ${address}` : session?.email ? `${t.saved} ${session.email}` : "";
    identity.hidden = !identity.textContent;
    // A /c/ page visitor already gave an address (the link came by e-mail) and never identifies.
    const offer = !page && !emailAlreadySet && !pageUnavailable && accepted && !session?.email && !verified() && !usableBuyer();
    addEmail.hidden = !offer || !session?.skipEmail || forceEmail;
    emailCard.hidden = !offer || (!!session?.skipEmail && !forceEmail);
    emailField.disabled = identifying;
    for (const button of emailCard.querySelectorAll("button")) button.disabled = identifying;
    olderButton.hidden = !(olderHasMore ?? pollingHasMore) || !thread;
    olderButton.disabled = loadingOlder;
    const hasReply = history().some((message) => message.authorEmail === "shop");
    retention.textContent = hasReply ? t.retentionReplied : t.retention;
    status.replaceChildren(lock || notice || (emailAlreadySet ? t.emailSet : ""));
    status.hidden = !status.textContent;
    if (contact && config.contactEmail && /^[^\s@?&]+@[^\s@?&]+$/.test(config.contactEmail)) {
      status.append(" ", makeLink(`mailto:${config.contactEmail}`, config.contactEmail));
    }
    sendError.textContent = sendFeedback;
    composer.hidden = pageUnavailable;
    legal.hidden = pageUnavailable;
    field.disabled = !!lock;
    field.readOnly = busy;
    const length = [...field.value].length;
    const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    sendButton.textContent = busy ? t.sending : seconds ? `${seconds} s` : sendFeedback === t.captchaError ? t.retry : t.send;
    sendButton.disabled = busy || identifying || !!lock || !!seconds || !field.value.trim() || length > max;
    counter.hidden = length < max * .8;
    counter.textContent = `${length} / ${max}`;
    renderMessages();
  }

  function retryTime(error: ChatError) {
    return error.retryAfter ? `${t.retryAt} ${time.format(Date.now() + error.retryAfter * 1000)}.` : t.rate;
  }

  function unavailable() {
    resetSession();
    if (page) {
      pageUnavailable = true;
      lock = t.unavailable;
    } else {
      notice = t.gone;
    }
  }

  function handleError(error: unknown, polling = false) {
    if (!(error instanceof ChatError)) {
      sendFeedback = t.network;
      return;
    }
    switch (error.code) {
      case "blocked": lock = t.blocked; contact = false; break;
      case "thread_locked": lock = t.locked; contact = false; break;
      case "plan_required": unavailable(); if (!page) root.host.remove(); break;
      case "unauthorized":
      case "invalid_token":
      case "origin_not_allowed":
      case "live_chat_unavailable": unavailable(); break;
      case "visitor_limit": {
        const reason = error.data.reason;
        if (reason === "project_day") notice = t.capped;
        else if (reason === "hour") lock = error.retryAfter ? `${t.hour} ${retryTime(error)}` : t.hour;
        else lock = reason === "thread" ? t.thread : t.consecutive;
        contact = true;
        break;
      }
      case "project_capped": notice = t.capped; contact = true; break;
      case "rate_limited": notice = retryTime(error); contact = !polling; break;
      case "cooldown":
        cooldownUntil = Date.now() + 1000 * (error.retryAfter ?? 3);
        window.clearInterval(cooldownTimer);
        cooldownTimer = window.setInterval(() => {
          if (Date.now() >= cooldownUntil) window.clearInterval(cooldownTimer);
          render();
        }, 250);
        break;
      case "content_filtered": sendFeedback = t.filtered; break;
      case "moderation_link": sendFeedback = t.link; break;
      case "invalid":
      case "invalid_request": sendFeedback = t.invalid; break;
      case "captcha_failed":
      case "captcha_required":
      case "captcha_unavailable": sendFeedback = t.captchaError; break;
      default: sendFeedback = t.network;
    }
    if (lock) {
      for (const item of pending) {
        if (Date.now() - item.acceptedAt >= SEND_TIMEOUT && !item.failed) {
          item.failed = true;
          item.retryable = !lock;
        }
      }
    }
  }

  const pollable = () => active && !options.preview && !!session && !pageUnavailable &&
    document.visibilityState !== "hidden" && Date.now() - lastActivity < IDLE;

  function schedule(delay = interval) {
    window.clearTimeout(pollTimer);
    pollTimer = 0;
    if (pollable()) pollTimer = window.setTimeout(() => void poll(), delay);
  }

  async function poll(refresh = false) {
    if (!pollable() || !session) return;
    if (pollInFlight) {
      pollAgain ||= refresh;
      return;
    }
    window.clearTimeout(pollTimer);
    pollTimer = 0;
    if (!busy && !identifying) {
      syncBuyer();
      if (!session) { render(); return; }
    }
    pollInFlight = true;
    const { token } = session;
    try {
      const result = await transport(token).getVisitorThread();
      if (!active || token !== session?.token) return;
      thread = result.thread;
      max = result.messageMax || max;
      accepted ||= !!thread;
      const seen = read(`${key}:seen`);
      if (!hasRead) {
        hasRead = true;
        const seenIndex = result.messages.findIndex((message) => message.id === seen);
        const incoming = result.messages.slice(seenIndex + 1).filter((message) => message.authorEmail === "shop");
        const unread = thread?.unread ?? (!page ? incoming.length : 0);
        if (unread) unreadStart = incoming.slice(-unread)[0]?.id;
      }
      if (!thread) {
        olderMessages = [];
        olderHasMore = undefined;
      } else if (olderMessages.length) {
        const returned = new Set(result.messages.map((message) => message.id));
        const first = Date.parse(result.messages[0]?.createdAt ?? "");
        olderMessages = [...olderMessages, ...messages.filter((message) =>
          !returned.has(message.id) && Date.parse(message.createdAt) < first,
        )];
      }
      messages = result.messages;
      pollingHasMore = result.hasMore;
      const last = messages[messages.length - 1];
      if (last && !page) write(`${key}:seen`, last.id);
      options.clearBadge();
      if (lock !== t.blocked) {
        const left = thread?.limitsLeft;
        if (thread?.composerLocked) {
          lock = left?.thread === 0 ? t.thread : left?.hour === 0 ? t.hour : left?.consecutive === 0 ? t.consecutive : t.locked;
          contact = lock !== t.locked;
        } else {
          lock = undefined;
          contact = false;
        }
      }
      const ids = new Set(messages.map((message) => message.id));
      pending = pending.filter((item) => !ids.has(item.message.id));
      for (const item of pending) {
        if (Date.now() - item.acceptedAt >= SEND_TIMEOUT && !item.failed) {
          item.failed = true;
          item.retryable = !lock;
        }
      }
      if (sendFeedback === t.network) sendFeedback = "";
      if (notice === t.rate || notice.startsWith(t.retryAt)) notice = "";
      interval = POLL;
    } catch (error) {
      if (!active || token !== session?.token) return;
      handleError(error, true);
      if (error instanceof ChatError && [0, 429, 503].includes(error.status)) {
        interval = Math.min(60_000, Math.max(interval * 2, (error.retryAfter ?? 0) * 1000));
      }
    } finally {
      pollInFlight = false;
      if (active) {
        render();
        const next = pollAgain;
        pollAgain = false;
        schedule(next ? 0 : interval);
      }
    }
  }

  olderButton.onclick = async () => {
    const first = history()[0];
    if (!session || !thread || !first || loadingOlder) return;
    const { token } = session;
    const threadId = thread.id;
    const oldHeight = scroll.scrollHeight;
    loadingOlder = true;
    render();
    try {
      const older = await transport(token).getOlderMessages(threadId, first.id);
      if (token !== session?.token || thread?.id !== threadId) return;
      const ids = new Set(olderMessages.map((message) => message.id));
      olderMessages = [...older.messages.reverse().filter((message) => !ids.has(message.id)), ...olderMessages];
      olderHasMore = older.hasMore;
      render();
      scroll.scrollTop += scroll.scrollHeight - oldHeight;
    } catch (error) {
      if (token === session?.token) handleError(error, true);
    } finally {
      loadingOlder = false;
      render();
    }
  };

  async function upgrade(panelToken: string) {
    try {
      session = await requestSession(options, { panelToken }, session!.token);
      remember();
      void poll(true);
    } catch (error) {
      // Only a refused panel session marks the buyer invalid; a network error may pass.
      if (error instanceof ChatError && [401, 403, 409].includes(error.status)) invalidBuyer = panelToken;
    }
  }

  function pageUrl() {
    return location.origin + location.pathname;
  }

  async function send(input: Draft, retry?: Pending) {
    if (busy || identifying || lock || !active || cooldownUntil > Date.now()) return;
    busy = true;
    sendFeedback = "";
    notice = "";
    contact = false;
    restoreStoredSession();
    syncBuyer();
    render();
    try {
      if (options.preview) {
        notice = t.preview;
        return;
      }
      const customer = usableBuyer();
      if (retry && !session) {
        field.value = input.body;
        draft = input;
      }
      if (session && !verified() && customer && !page) await upgrade(customer.token);
      if (!session) {
        if (page) return;
        abortChallenge = new AbortController();
        const proof = await challenge(options, dark ? "dark" : "light", captcha, abortChallenge.signal);
        abortChallenge = undefined;
        if (!active) return;
        const currentBuyer = getBuyer();
        session = await requestSession(options, { ...proof, locale, panelToken: currentBuyer?.token });
        if (currentBuyer && !session.verified) invalidBuyer = currentBuyer.token;
      }
      const message = await transport(session.token).sendVisitorMessage({ ...input, pageUrl: page ? undefined : pageUrl() });
      const next = { draft: input, message, acceptedAt: Date.now() };
      pending = [...pending.filter((item) => item !== retry), next];
      if (!retry || field.value.trim() === input.body) field.value = "";
      draft = undefined;
      persisted = true;
      accepted = true;
      remember();
      if (!pollTimer && !pollInFlight) schedule(POLL);
      requestAnimationFrame(scrollBottom);
    } catch (error) {
      handleError(error);
    } finally {
      abortChallenge = undefined;
      busy = false;
      render();
    }
  }

  async function identifyEmail() {
    if (!session || identifying || busy || options.preview) return;
    identifying = true;
    emailError.textContent = "";
    emailField.removeAttribute("aria-invalid");
    render();
    try {
      session = await requestSession(options, { email: emailField.value.trim().toLowerCase() }, session.token);
      forceEmail = false;
      remember();
      void poll(true);
      field.focus();
    } catch (error) {
      if (error instanceof ChatError && error.code === "invalid_token") unavailable();
      else if (error instanceof ChatError && error.code === "email_already_set") { emailAlreadySet = true; field.focus(); }
      else if (error instanceof ChatError && error.status === 429) emailError.textContent = retryTime(error);
      else if (error instanceof ChatError && error.status === 400) {
        emailError.textContent = t.emailInvalid;
        emailField.setAttribute("aria-invalid", "true");
      } else emailError.textContent = t.network;
    } finally {
      identifying = false;
      render();
      if (!emailCard.hidden) emailField.focus();
    }
  }

  function activity() {
    const idle = Date.now() - lastActivity >= IDLE;
    lastActivity = Date.now();
    if (idle && !pollInFlight) schedule(0);
  }

  function viewport() {
    const mobile = motion.matches;
    if (mobile) dialog.setAttribute("aria-modal", "true");
    else dialog.removeAttribute("aria-modal");
    if (mobile && !scrollerLocked) {
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      scrollerLocked = true;
    } else if (!mobile && scrollerLocked) {
      document.documentElement.style.overflow = previousOverflow;
      scrollerLocked = false;
    }
    const view = window.visualViewport;
    if (view) {
      dialog.style.setProperty("--viewport", `${view.height}px`);
      dialog.style.setProperty("--viewport-top", `${view.offsetTop}px`);
    }
    if (mobile) scrollBottom();
  }

  function toggleMenu(open: boolean) {
    menu.hidden = !open;
    menuButton.setAttribute("aria-expanded", String(open));
    if (open) reportLink.href = reportHref();
    if (open) menu.querySelector("a")?.focus();
  }

  const isMenuControl = (node: EventTarget | null) =>
    node === menuButton || (node instanceof window.Node && menu.contains(node));

  dialog.addEventListener("focusout", (event) => {
    if (!menu.hidden && !isMenuControl(event.relatedTarget)) toggleMenu(false);
  });

  menuButton.onclick = () => {
    const open = menu.hidden;
    toggleMenu(open);
    if (!open) menuButton.focus();
  };
  menu.onclick = () => { toggleMenu(false); menuButton.focus(); };
  closeButton.onclick = options.close;
  dialog.onkeydown = (event) => {
    if (event.key === "Escape") {
      if (!menu.hidden) { toggleMenu(false); menuButton.focus(); }
      else if (!page) options.close();
      else return;
      event.preventDefault();
      event.stopPropagation();
    }
    if (menuButton === root.activeElement && menu.hidden && event.key === "ArrowDown") {
      toggleMenu(true);
      event.preventDefault();
    }
    if (!menu.hidden && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      const links = [...menu.querySelectorAll("a")];
      const index = links.indexOf(root.activeElement as HTMLAnchorElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : links.length - 1)) % links.length;
      links[next]?.focus();
      event.preventDefault();
    }
    if (event.key !== "Tab" || !motion.matches) return;
    const controls = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled),a,input:not(:disabled),textarea:not(:disabled),.interactive iframe")]
      .filter((element) => !element.closest("[hidden]") && element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  field.oninput = () => {
    if (!busy) {
      sendFeedback = "";
      render();
    }
  };
  field.onkeydown = (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!sendButton.disabled) composer.requestSubmit();
  };
  composer.onsubmit = (event) => {
    event.preventDefault();
    if (sendButton.disabled) return;
    const body = field.value.trim();
    if (!body || [...body].length > max) return;
    if (draft?.body !== body) draft = { body, clientId: crypto.randomUUID() };
    void send(draft);
  };
  emailCard.onsubmit = (event) => { event.preventDefault(); void identifyEmail(); };
  find<HTMLButtonElement>(".skip").onclick = () => {
    if (session) session.skipEmail = true;
    forceEmail = false;
    remember();
    render();
    field.focus();
  };
  addEmail.onclick = () => {
    forceEmail = true;
    render();
    emailField.focus();
    scrollBottom();
  };

  return {
    open() {
      if (active) return;
      active = true;
      life = new AbortController();
      const listener = { signal: life.signal };
      if (page && !session) session = options.session;
      restoreStoredSession();
      syncBuyer();
      if (page && !session) unavailable();
      lastActivity = Date.now();
      setTheme();
      viewport();
      render();
      // The hosted /c/ page is a page, not a dialog: it opens with nothing focused, as any page does.
      if (!page) (field.disabled || pageUnavailable ? menuButton : field).focus();
      dialog.addEventListener("input", activity, listener);
      dialog.addEventListener("click", activity, listener);
      dialog.addEventListener("focusin", activity, listener);
      motion.addEventListener("change", viewport, listener);
      system.addEventListener("change", setTheme, listener);
      window.visualViewport?.addEventListener("resize", viewport, listener);
      window.visualViewport?.addEventListener("scroll", viewport, listener);
      document.addEventListener("pointerdown", (event) => {
        if (!menu.hidden && !event.composedPath().some(isMenuControl)) toggleMenu(false);
      }, { ...listener, capture: true });
      window.addEventListener("storage", (event) => {
        if (busy || identifying) return;
        const previous = session;
        if (event.key === key || event.key === null) restoreStoredSession();
        syncBuyer();
        render();
        if (session && session !== previous) void poll(true);
      }, listener);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "hidden") {
          lastActivity = Date.now();
          schedule(0);
        } else schedule();
      }, listener);
      if (session && !options.preview) void poll(true);
    },
    close() {
      active = false;
      life?.abort();
      abortChallenge?.abort();
      window.clearTimeout(pollTimer);
      pollTimer = 0;
      if (scrollerLocked) document.documentElement.style.overflow = previousOverflow;
      scrollerLocked = false;
      toggleMenu(false);
    },
  };
}

type HostedPageConfig = {
  mode: "page";
  token: string;
  expiresAt: number;
  projectKey: string;
  locale: PanelOptions["locale"];
  projectId: string;
  chatUrl: string;
  shopName: string;
  greeting: string;
  accent: string;
  theme: ChatConfig["look"]["theme"];
  privacyUrl: string | null;
  contactEmail: string | null;
  limits: ChatConfig["limits"];
};

export function mountHostedPage() {
  const inline = document.getElementById("bitsnap-chat-page-config");
  const host = document.getElementById("bitsnap-chat-page");
  if (!inline || !host || host.shadowRoot) return;
  try {
    const data = JSON.parse(inline.textContent ?? "") as HostedPageConfig;
    const { projectKey, locale, token, expiresAt } = data;
    const apiOrigin = location.origin;
    const config: ChatConfig = {
      enabled: true,
      projectId: data.projectId,
      chatUrl: data.chatUrl,
      texts: { greeting: data.greeting, shopName: data.shopName },
      look: { accent: data.accent, theme: data.theme, position: "bottom-right" },
      privacyUrl: data.privacyUrl,
      contactEmail: data.contactEmail,
      limits: data.limits,
      origins: [],
      challengeOrigin: apiOrigin,
      captchaContext: "",
    };
    const root = host.attachShadow({ mode: "open" });
    const target = root.appendChild(document.createElement("div"));
    mount({
      protocol: PROTOCOL, root, target, mode: "page", apiOrigin, projectKey, locale, config,
      session: { token, expiresAt }, close() {}, clearBadge() {},
    })?.open();
  } catch {
    // Keep the hosted credential and page URL out of diagnostics.
    console.error("[live-chat] Could not mount the hosted conversation.");
  }
}

if (typeof window !== "undefined") {
  window.BitsnapChatPanel = { protocol: PROTOCOL, mount };
  mountHostedPage();
}
