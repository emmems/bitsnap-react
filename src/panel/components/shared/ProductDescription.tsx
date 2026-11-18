import { useEffect, useId, useRef, useState } from "react";
import { sanitizeLessonHtml } from "../../../course/sanitize";
import {
  detectRichTextFormat,
  lexicalJsonToText,
  linkifyText,
} from "../../../lib/render.text";
import { cn } from "../../../lib/utils";
import { getPanelTexts, type PanelTexts } from "../../texts";

/** Same content styling as course lessons (`course/LessonPane.tsx`). */
const RICH_TEXT_CLASSES =
  "break-words [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_img]:h-auto [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-6";

/** Line height of the description, in `em` (matches `leading-normal`). */
const LINE_HEIGHT_EM = 1.5;

/**
 * Sanitized HTML, or `""` when nothing visible is left (empty paragraphs).
 * Needs a DOM: call it in an effect.
 */
function cleanDescriptionHtml(html: string): string {
  const clean = sanitizeLessonHtml(html);
  if (clean === "" || typeof document === "undefined") return clean;
  const probe = document.createElement("div");
  probe.innerHTML = clean;
  const visible =
    (probe.textContent ?? "").trim() !== "" ||
    probe.querySelector("img, video, audio, table, hr") != null;
  return visible ? clean : "";
}

export type ProductDescriptionProps = {
  /** Seller description: Lexical HTML, Lexical JSON or plain text. */
  text: string | null | undefined;
  /** Lines shown before "Pokaż więcej". Default 4; `0` never folds. */
  lines?: number;
  /** Text table; defaults to the library locale. */
  texts?: PanelTexts;
  className?: string;
};

/**
 * Product description as rich text. HTML is sanitized with DOMPurify
 * (`sanitizeLessonHtml`) in an effect, so the server and the first client
 * render agree (a skeleton until then); Lexical JSON is reduced to text;
 * plain text keeps its line breaks and gets `https:` links. Folds after
 * `lines` lines with a "Pokaż więcej" toggle. Renders nothing when the
 * description is empty.
 *
 * Props: `text`, `lines`, `texts`, `className`.
 */
export function ProductDescription({
  text,
  lines = 4,
  texts = getPanelTexts(),
  className,
}: ProductDescriptionProps) {
  const value = text?.trim() ?? "";
  const format = value === "" ? "text" : detectRichTextFormat(value);
  const plain =
    format === "lexical" ? (lexicalJsonToText(value) ?? value) : value;

  // `null` until the effect sanitized the HTML.
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    setHtml(format === "html" ? cleanDescriptionHtml(value) : null);
  }, [format, value]);

  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const element = contentRef.current;
    if (element == null || lines <= 0) {
      setOverflows(false);
      return;
    }
    const measure = () => {
      if (expanded) return;
      setOverflows(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [html, plain, lines, expanded]);

  if (value === "") return null;
  if (format === "html" && html === null) {
    return (
      <div
        role="status"
        aria-label={texts.descriptionLoading}
        className={cn("flex flex-col gap-2", className)}
      >
        <span className="h-3 w-full animate-pulse rounded bg-(--panel-surface-2) motion-reduce:animate-none" />
        <span className="h-3 w-4/5 animate-pulse rounded bg-(--panel-surface-2) motion-reduce:animate-none" />
        <span className="h-3 w-3/5 animate-pulse rounded bg-(--panel-surface-2) motion-reduce:animate-none" />
      </div>
    );
  }
  if (format === "html" ? html === "" : plain.trim() === "") return null;

  const folded = lines > 0 && !expanded;
  return (
    <div className={cn("text-sm text-(--panel-fg)", className)}>
      {format === "html" ? (
        <div
          id={contentId}
          ref={contentRef}
          className={cn(RICH_TEXT_CLASSES, folded && "overflow-hidden")}
          style={{
            lineHeight: LINE_HEIGHT_EM,
            maxHeight: folded ? `${lines * LINE_HEIGHT_EM}em` : undefined,
          }}
          // Sanitised by DOMPurify (course/sanitize.ts).
          dangerouslySetInnerHTML={{ __html: html ?? "" }}
        />
      ) : (
        <div
          id={contentId}
          ref={contentRef}
          className={cn(
            "break-words whitespace-pre-wrap",
            folded && "overflow-hidden",
          )}
          style={{
            lineHeight: LINE_HEIGHT_EM,
            maxHeight: folded ? `${lines * LINE_HEIGHT_EM}em` : undefined,
          }}
        >
          {linkifyText(plain)}
        </div>
      )}
      {(overflows || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 rounded-sm text-sm font-medium text-(--panel-accent-text-now) underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)"
        >
          {expanded ? texts.descriptionShowLess : texts.descriptionShowMore}
        </button>
      )}
    </div>
  );
}
