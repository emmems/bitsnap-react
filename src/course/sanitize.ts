import DOMPurify from "dompurify";

/** The part of DOMPurify the wrapper uses, so tests can bring their own DOM. */
export type PurifyLike = {
  isSupported?: boolean;
  sanitize?: (html: string, config: Record<string, unknown>) => unknown;
  addHook?: (
    name: "afterSanitizeAttributes",
    hook: (node: Element) => void,
  ) => void;
};

const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true },
  // Lesson text is content, not a page: no embedded documents, no forms and
  // no inline styles (they allow overlays on top of the panel).
  FORBID_TAGS: [
    "style",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "iframe",
    "frame",
    "object",
    "embed",
    "base",
    "meta",
    "link",
  ],
  FORBID_ATTR: ["style", "srcdoc", "formaction"],
  ALLOW_DATA_ATTR: false,
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Builds a sanitizer around a DOMPurify instance. Links open in a new tab
 * without `opener`, images load lazily. Without a DOM (server rendering) the
 * sanitizer returns an empty string rather than unsanitised HTML.
 */
export function createHtmlSanitizer(
  purify: PurifyLike,
): (html: string | null | undefined) => string {
  if (purify.isSupported === false || purify.sanitize == null) {
    return () => "";
  }
  const sanitize = purify.sanitize.bind(purify);

  purify.addHook?.("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.hasAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
    if (node.tagName === "IMG") {
      node.setAttribute("loading", "lazy");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
  });

  return (html) => {
    if (html == null || html === "") {
      return "";
    }
    return String(sanitize(html, SANITIZE_CONFIG));
  };
}

let sharedSanitizer: ((html: string | null | undefined) => string) | undefined;

/**
 * Sanitizes the HTML of a lesson with the DOM of the browser. Returns an empty
 * string when there is no DOM, so call it on the client (inside an effect or
 * `useMemo` of a component that only renders content after loading).
 */
export function sanitizeLessonHtml(html: string | null | undefined): string {
  if (typeof window === "undefined") {
    return "";
  }
  sharedSanitizer ??= createHtmlSanitizer(DOMPurify as unknown as PurifyLike);
  return sharedSanitizer(html);
}
