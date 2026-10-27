import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import { useCourseView } from "./context";
import { fillTemplate } from "./logic";

/** Five stars; read-only without `onSelect`. */
export function RatingStars({
  value,
  onSelect,
  disabled,
}: {
  value: number;
  onSelect?: (score: number) => void;
  disabled?: boolean;
}) {
  const { texts } = useCourseView();
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div
      className="flex items-center gap-1"
      role={onSelect ? "radiogroup" : "img"}
      aria-label={fillTemplate(texts.rateStar, { n: Math.round(value) })}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(shown);
        const star = (
          <Star
            className={cn(
              "size-5",
              filled
                ? "fill-amber-400 text-amber-400"
                : "text-neutral-300 dark:text-neutral-600",
            )}
            aria-hidden
          />
        );
        return onSelect ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={fillTemplate(texts.rateStar, { n })}
            disabled={disabled}
            className="rounded p-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onSelect(n)}
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}
