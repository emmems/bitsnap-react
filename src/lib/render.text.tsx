import type { ReactNode } from "react";

/** Format of a seller text field (product descriptions mix all three). */
export type RichTextFormat = "lexical" | "html" | "text";

/** `{` is Lexical editor JSON, `<` is HTML, anything else plain text. */
export function detectRichTextFormat(value: string): RichTextFormat {
  const first = value.trimStart()[0];
  if (first === "{") return "lexical";
  if (first === "<") return "html";
  return "text";
}

type LexicalNode = {
  type?: unknown;
  text?: unknown;
  children?: unknown;
};

const LEXICAL_INLINE_TYPES = new Set(["text", "link", "autolink", "hashtag", "mark"]);

function lexicalNodeText(node: LexicalNode): string {
  if (node.type === "linebreak") return "\n";
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.children)) return "";
  const children = node.children as LexicalNode[];
  // Inline children join directly; block children (paragraphs, list items,
  // headings) go on their own lines.
  const inline = children.every(
    (child) =>
      child == null ||
      typeof child.text === "string" ||
      child.type === "linebreak" ||
      LEXICAL_INLINE_TYPES.has(String(child.type)),
  );
  return children
    .filter((child) => child != null && typeof child === "object")
    .map(lexicalNodeText)
    .join(inline ? "" : "\n");
}

/**
 * Plain text of a Lexical editor state (JSON). Formatting and links are
 * dropped. `undefined` when the value is not Lexical JSON.
 */
export function lexicalJsonToText(value: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (parsed == null || typeof parsed !== "object") return undefined;
  const root = (parsed as { root?: unknown }).root ?? parsed;
  if (root == null || typeof root !== "object") return undefined;
  return lexicalNodeText(root as LexicalNode).trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Plain text of an HTML fragment, without a DOM (same result on the server
 * and in the browser). Block ends become line breaks; tags are dropped. The
 * result is text, never markup: render it as a React text node.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === "#") {
        const point =
          code[1] === "x" || code[1] === "X"
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10);
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff
          ? String.fromCodePoint(point)
          : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text of a seller field in any of the three formats. */
export function richTextToPlainText(value: string): string {
  switch (detectRichTextFormat(value)) {
    case "lexical":
      return lexicalJsonToText(value) ?? value;
    case "html":
      return htmlToPlainText(value);
    default:
      return value;
  }
}

const URL_REGEX = /https:\/\/[^\s<>"'`]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

/** The URL as a safe `https:` link target, or `undefined`. */
function safeHref(candidate: string): string | undefined {
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Splits plain text into text and `https:` links (React elements; nothing is
 * parsed as HTML). Trailing punctuation stays outside the link.
 */
export function linkifyText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_REGEX)) {
    const start = match.index ?? 0;
    const url = match[0].replace(TRAILING_PUNCTUATION, "");
    const href = safeHref(url);
    if (href == null) continue;
    if (start > last) nodes.push(text.slice(last, start));
    nodes.push(
      <a
        key={`${start}-${url}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all underline"
      >
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * Seller text as a paragraph with clickable `https:` links. HTML and Lexical
 * JSON are reduced to plain text first; the seller's markup is never
 * rendered (it used to go into `dangerouslySetInnerHTML`, an XSS).
 */
export const renderText = (txt: string) => {
  return <p>{linkifyText(richTextToPlainText(txt ?? ""))}</p>;
};
