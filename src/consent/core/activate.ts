import { CONSENT_CATEGORIES, type ConsentChoices } from "./types";

const SCRIPT_SELECTOR = 'script[type="text/plain"][data-bitsnap-consent]:not([data-bitsnap-queued])';
const FRAME_SELECTOR = "iframe[data-bitsnap-consent][data-src]";

const allowed = (c: ConsentChoices, category: string | null): boolean =>
  (CONSENT_CATEGORIES as readonly string[]).includes(category ?? "") &&
  c[category as keyof ConsentChoices];

/** Settles when the script has loaded or failed: a broken script must not block the ones after it. */
function settled(script: HTMLScriptElement): Promise<void> {
  return new Promise((resolve) => {
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => resolve(), { once: true });
  });
}

/** Swaps the placeholder for a live script; resolves once an external one has loaded. */
function run(doc: Document, placeholder: HTMLScriptElement): Promise<void> | undefined {
  const script = doc.createElement("script");
  for (const { name, value } of Array.from(placeholder.attributes)) {
    if (name === "type" || name === "data-bitsnap-queued") continue;
    if (name === "data-type") {
      // The embed writes the original `type="module"` here, as `type` itself is `text/plain`.
      if (value === "module") script.setAttribute("type", "module");
    } else if (name === "data-src") script.setAttribute("src", value);
    else script.setAttribute(name, value);
  }
  if (placeholder.nonce) script.nonce = placeholder.nonce;
  const external = script.hasAttribute("src");
  if (external) {
    // Dynamic scripts are async by default; keep the order of the page.
    if (!placeholder.hasAttribute("async")) script.async = false;
  } else {
    script.text = placeholder.text;
  }
  const loaded = external ? settled(script) : undefined;
  placeholder.parentNode?.replaceChild(script, placeholder);
  return loaded;
}

/**
 * Turns the consented placeholders into live elements:
 * `<script type="text/plain" data-bitsnap-consent="marketing" [data-src] [data-type="module"]>` becomes
 * a real script (attributes copied, `type` dropped or restored from `data-type`, `data-src` -> `src`),
 * and `<iframe data-src>` gets its `src`.
 * Placeholders run in document order: an inline script waits for the external scripts before it
 * (`<script src=lib.js>` then `<script>Lib.init()</script>`), external ones only follow each other.
 */
export function activateScripts(doc: Document, c: ConsentChoices): number {
  let activated = 0;
  try {
    /** Set once a placeholder had to wait: everything after it queues behind it. */
    let gate: Promise<void> | null = null;
    /** External scripts inserted since the last inline one. */
    let loading: Promise<void>[] = [];
    doc.querySelectorAll<HTMLScriptElement>(SCRIPT_SELECTOR).forEach((placeholder) => {
      if (!allowed(c, placeholder.getAttribute("data-bitsnap-consent"))) return;
      activated++;
      const inline = !placeholder.hasAttribute("data-src") && !placeholder.hasAttribute("src");
      if (gate || (inline && loading.length > 0)) {
        // Marked so that another call (a later choice) does not queue it again.
        placeholder.setAttribute("data-bitsnap-queued", "");
        gate = (gate ?? Promise.all(loading).then(() => {})).then(() => {
          try {
            return run(doc, placeholder);
          } catch {
            // never throw into the host page
          }
        });
        loading = [];
        return;
      }
      const loaded = run(doc, placeholder);
      if (loaded) loading.push(loaded);
    });
    doc.querySelectorAll<HTMLIFrameElement>(FRAME_SELECTOR).forEach((frame) => {
      if (!allowed(c, frame.getAttribute("data-bitsnap-consent"))) return;
      const src = frame.getAttribute("data-src");
      if (src && frame.getAttribute("src") !== src) {
        frame.setAttribute("src", src);
        frame.removeAttribute("data-src");
        activated++;
      }
    });
  } catch {
    // never throw into the host page
  }
  return activated;
}
