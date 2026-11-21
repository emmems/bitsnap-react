import { challengeUrl, parseTurnstileMessage } from "../../captcha/protocol";
import { ChatError } from "../../chat/client";
import type { PanelOptions } from "../protocol";
import { randomId } from "./api";

export function challenge(options: PanelOptions, theme: "light" | "dark", container: HTMLElement, signal: AbortSignal) {
  const attempt = randomId(8);
  const action = "live_chat_start";
  const origin = new URL(options.config.challengeOrigin).origin;
  const binding = { formContext: options.config.captchaContext, attempt, theme };
  const src = challengeUrl(origin, action, options.locale, location.origin, binding);
  const frame = document.createElement("iframe");
  const fallback = container.querySelector("button")!;
  frame.title = container.dataset.title!;
  frame.tabIndex = -1;
  frame.src = src;
  return new Promise<{ captchaToken: string; attempt: string }>((resolve, reject) => {
    let popup: Window | null = null;
    const fail = () => finish();
    const timeout = window.setTimeout(fail, 120_000);
    const showFallback = window.setTimeout(() => container.classList.add("slow"), 8_000);
    let popupWatcher = 0;
    function finish(token?: string) {
      window.clearTimeout(timeout);
      window.clearTimeout(showFallback);
      window.clearInterval(popupWatcher);
      window.removeEventListener("message", receive);
      signal.removeEventListener("abort", fail);
      frame.remove();
      popup?.close();
      fallback.onclick = null;
      container.classList.remove("interactive", "slow");
      if (token) resolve({ captchaToken: token, attempt });
      else reject(new ChatError("captcha_failed", 422));
    }
    function receive(event: MessageEvent) {
      if (!event.source || (event.source !== frame.contentWindow && event.source !== popup)) return;
      const result = parseTurnstileMessage(event.origin, event.data, action, origin, binding);
      if (result?.kind === "interactive") {
        container.classList.add("interactive");
        frame.tabIndex = 0;
        frame.focus();
      } else if (result?.kind === "token") {
        finish(result.token);
      } else if (result) {
        fail();
      }
    }
    fallback.onclick = () => {
      if (popup && !popup.closed) { popup.focus(); return; }
      popup = window.open(src, "bitsnap-chat-turnstile", "popup,width=520,height=680");
      if (!popup) { fail(); return; }
      popupWatcher = window.setInterval(() => { if (popup?.closed) fail(); }, 500);
    };
    frame.onerror = fail;
    window.addEventListener("message", receive);
    signal.addEventListener("abort", fail, { once: true });
    if (signal.aborted) fail();
    else container.prepend(frame);
  });
}
