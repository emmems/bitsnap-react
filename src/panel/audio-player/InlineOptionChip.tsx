import { ChevronDown } from "lucide-react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export type ChipOption = { value: string; label: string };

/**
 * A labelled chip that expands an inline group of radio options (no native
 * select, no portal). The chip has `aria-expanded`; the options are native
 * radios in a `fieldset` with a `legend`, so arrow keys and screen readers
 * work as usual. Escape collapses the group and returns focus to the chip.
 * Picking an option does not collapse it (arrow keys change the choice).
 *
 * The parent owns `open` (only one chip open at a time) and renders the
 * returned `panel` below the row of chips.
 */
export function useInlineOptionChip({
  name,
  icon,
  label,
  ariaLabel,
  legend,
  options,
  value,
  onChange,
  open,
  onOpenChange,
  chipExtra,
}: {
  /** Radio group name. */
  name: string;
  icon: ReactNode;
  /** Visible chip text ("Prędkość: 1×"). */
  label: ReactNode;
  /** Full accessible chip name ("Wyłącznik czasowy: wyłączony"). */
  ariaLabel: string;
  legend: string;
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Extra content inside the chip after the label (a countdown). */
  chipExtra?: ReactNode;
}): { chip: ReactNode; panel: ReactNode } {
  const panelId = useId();
  const chipRef = useRef<HTMLButtonElement>(null);

  function collapse() {
    onOpenChange(false);
    chipRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      collapse();
    }
  }

  const chip = (
    <button
      ref={chipRef}
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={ariaLabel}
      data-chip={name}
      onClick={() => onOpenChange(!open)}
      className={cn(
        "inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm sm:gap-1.5 sm:px-3.5 font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--panel-accent-text-now)",
        open
          ? "border-(--panel-fg) bg-(--panel-fg) text-(--panel-surface)"
          : "border-(--panel-border) bg-(--panel-surface) text-(--panel-fg) hover:bg-(--panel-surface-2)",
      )}
    >
      <span aria-hidden="true" className="max-[399px]:hidden [&_svg]:size-4">
        {icon}
      </span>
      <span aria-hidden="true">{label}</span>
      {chipExtra}
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0 transition-transform motion-reduce:transition-none sm:size-4",
          open && "rotate-180",
        )}
      />
    </button>
  );

  const panel = (
    <fieldset
      id={panelId}
      hidden={!open}
      onKeyDown={handleKeyDown}
      className="min-w-0 rounded-xl border border-(--panel-border) px-3 pt-1 pb-3"
    >
      <legend className="px-1 text-xs font-semibold tracking-wide text-(--panel-muted) uppercase">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label key={option.value} className="relative">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
            />
            <span className="pointer-events-none flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-semibold text-(--panel-fg) peer-checked:bg-(--panel-fg) peer-checked:text-(--panel-surface) peer-hover:bg-(--panel-surface-2) peer-checked:peer-hover:bg-(--panel-fg) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--panel-accent-text-now)">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  return { chip, panel };
}
