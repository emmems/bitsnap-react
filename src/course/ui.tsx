import { AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { useCourseView } from "./context";
import type { CourseTexts } from "./texts";
import { CourseError } from "./types";

/** Accent (brand) colors of the course, set as CSS variables by `PanelCourse`. */
export const ACCENT_BG =
  "bg-[var(--course-accent,var(--primary))] text-[var(--course-accent-fg,var(--primary-foreground))] dark:bg-[var(--course-accent-dark,var(--course-accent,var(--primary)))] dark:text-[var(--course-accent-dark-fg,var(--course-accent-fg,var(--primary-foreground)))]";

export const ACCENT_BUTTON = cn(
  ACCENT_BG,
  "hover:bg-[var(--course-accent,var(--primary))] hover:opacity-90 dark:hover:bg-[var(--course-accent-dark,var(--course-accent,var(--primary)))]",
);

export const CARD =
  "rounded-xl bg-white p-4 drop-shadow-xl sm:p-6 dark:border dark:border-neutral-700 dark:bg-neutral-900 dark:drop-shadow-none";

/** The explanation of an error that the view can show to the customer. */
export function errorMessage(error: unknown, texts: CourseTexts): string {
  if (error instanceof CourseError) {
    switch (error.code) {
      case "unauthorized":
        return texts.errorUnauthorized;
      case "course_not_found":
      case "item_not_found":
        return texts.errorNotFound;
      case "unavailable":
        return texts.errorUnavailable;
    }
  }
  return texts.errorGeneric;
}

export function ErrorBox({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const { texts } = useCourseView();
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        {errorMessage(error, texts)}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {texts.retry}
        </Button>
      )}
    </div>
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  const { texts } = useCourseView();
  return (
    <div role="status" aria-label={label ?? texts.loading} className="space-y-3">
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

export function ProgressBar({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
    >
      <div
        className={cn("h-full rounded-full transition-all duration-300", ACCENT_BG)}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
