import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../../lib/utils";

export type ReturnsTab = "orders" | "mine";

export type ReturnsTabsProps = {
  value: ReturnsTab;
  onChange: (tab: ReturnsTab) => void;
  labels: Record<ReturnsTab, ReactNode>;
  /** Accessible name of the tab list. */
  label: string;
  /** Id prefix; tab `t` is `${idBase}-tab-${t}`, its panel `${idBase}-panel-${t}`. */
  idBase: string;
};

const ORDER: ReturnsTab[] = ["orders", "mine"];

/**
 * "Do zwrotu | Moje zwroty" segmented switch: a WAI-ARIA tab list with a
 * roving tabindex. Arrow keys, Home and End move and select.
 */
export function ReturnsTabs({ value, onChange, labels, label, idBase }: ReturnsTabsProps) {
  const refs = useRef<Partial<Record<ReturnsTab, HTMLButtonElement | null>>>({});

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const at = ORDER.indexOf(value);
    let next: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (at + 1) % ORDER.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (at - 1 + ORDER.length) % ORDER.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = ORDER.length - 1;
    if (next == null) return;
    event.preventDefault();
    const tab = ORDER[next];
    onChange(tab);
    refs.current[tab]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className="grid w-full grid-cols-2 gap-1 rounded-xl bg-(--panel-surface-2) p-1 sm:inline-grid sm:w-auto sm:min-w-[340px] sm:self-start"
    >
      {ORDER.map((tab) => {
        const selected = tab === value;
        return (
          <button
            key={tab}
            ref={(element) => {
              refs.current[tab] = element;
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tab}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${tab}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={move}
            className={cn(
              "flex min-h-9 items-center justify-center gap-1.5 rounded-[9px] px-3 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--panel-accent-text-now)",
              selected
                ? "bg-(--panel-surface) text-(--panel-fg) shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                : "text-(--panel-muted) hover:text-(--panel-fg)",
            )}
          >
            {labels[tab]}
          </button>
        );
      })}
    </div>
  );
}
