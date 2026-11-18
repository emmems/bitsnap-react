import { ChevronLeft } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "../../../lib/utils";
import { ProductDescription } from "../shared/ProductDescription";
import type { ProductTexts } from "./texts";

export type ProductShellProps = {
  title: string;
  imageUrl?: string;
  /** One quiet line under the title (chapter count, ...). */
  meta?: ReactNode;
  onBack: () => void;
  texts: ProductTexts;
  /**
   * Blocks under the title: in the sticky cover column on desktop, after the
   * main content on phones (description, app row).
   */
  aside?: ReactNode;
  /** The product's own content (player, files, ticket). */
  children: ReactNode;
};

/**
 * Product detail page layout: a plain back button, then a cover column and a
 * content column. Phones: small cover beside the title, content, then the
 * aside blocks. Desktop (`lg`): cover, title and aside in a sticky left
 * column, content on the right.
 *
 * The left column is `display: contents` on phones, so its two parts become
 * grid items and `order` puts the aside after the content without rendering
 * anything twice. Every surface sets its own colour pair (panel tokens), so a
 * dark host never gives dark text on a dark card.
 */
export function ProductShell({
  title,
  imageUrl,
  meta,
  onBack,
  texts,
  aside,
  children,
}: ProductShellProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-4 text-(--panel-fg)"
      data-product-shell=""
    >
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-2 text-sm font-medium text-(--panel-fg) hover:bg-(--panel-surface-2) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
        {texts.back}
      </button>
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="contents lg:sticky lg:top-5 lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          <header className="order-1 flex min-w-0 items-center gap-4 lg:flex-col lg:items-stretch">
            {imageUrl ? (
              <img
                src={imageUrl}
                // The title sits right next to the cover.
                alt=""
                width={320}
                height={320}
                draggable={false}
                className="size-20 shrink-0 rounded-lg bg-(--panel-surface-2) object-cover sm:size-24 lg:aspect-square lg:h-auto lg:w-full lg:rounded-xl"
              />
            ) : null}
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-lg leading-snug font-semibold break-words text-(--panel-fg) sm:text-xl lg:text-2xl"
              >
                {title}
              </h2>
              {meta != null && (
                <div className="mt-1 text-sm text-(--panel-muted)">{meta}</div>
              )}
            </div>
          </header>
          {aside != null && (
            <div className="order-3 flex min-w-0 flex-col gap-5">{aside}</div>
          )}
        </div>
        <div className="order-2 flex min-w-0 flex-col gap-5 lg:order-none">
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * Seller text under a heading. The whole block hides when the description
 * renders nothing (empty, or HTML with only empty paragraphs).
 */
export function DescriptionSection({
  heading,
  text,
  card = false,
  className,
}: {
  heading: string;
  text: string | null | undefined;
  /** Draw it as a card (content column) instead of plain text (cover column). */
  card?: boolean;
  className?: string;
}) {
  const headingId = useId();
  if (!text?.trim()) return null;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "min-w-0 text-(--panel-fg) [&:has([data-description]:empty)]:hidden",
        card &&
          "rounded-xl border border-(--panel-border) bg-(--panel-surface) p-4 sm:p-5",
        className,
      )}
    >
      <h3 id={headingId} className="mb-2 text-base font-semibold">
        {heading}
      </h3>
      <div data-description="">
        <ProductDescription text={text} />
      </div>
    </section>
  );
}
