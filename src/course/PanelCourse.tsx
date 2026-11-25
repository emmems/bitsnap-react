import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  LayoutGrid,
  List,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  InstrumentProvider,
  useInstrument,
  type AnalyticsOption,
} from "../analytics/instrument";
import { usePanelConfig } from "../panel/PanelProvider";
import type { GetThemeOutput } from "../panel/types";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { accentVars } from "./accent";
import { useCourseTrack } from "./analytics";
import { CourseViewProvider, useCourseView } from "./context";
import { CourseHub } from "./CourseHub";
import { CourseOutline } from "./CourseOutline";
import { createRpcCourseDataSource } from "./rpc";
import { LessonPane } from "./LessonPane";
import {
  fillTemplate,
  findItem,
  flattenItems,
  getAdjacentItems,
  getAutoplayTarget,
  markLessonCompleted,
  resolveInitialItemId,
  type FlatItem,
} from "./logic";
import { courseText, getCourseTexts, type CourseTexts } from "./texts";
import { TestPane } from "./TestPane";
import {
  CourseError,
  type Course,
  type CourseDataSource,
  type ItemRef,
  type Lesson,
  type ProgressSaved,
} from "./types";
import {
  ACCENT_BUTTON,
  ACCENT_WASH,
  CARD,
  ErrorBox,
  HAIRLINE,
  LoadingBlock,
  MUTED,
  ProgressBar,
  SURFACE,
  errorMessage,
} from "./ui";
import { useAsyncResource } from "./useAsyncResource";

export type PanelCourseProps = {
  /** `UserProduct.access_id` of the purchased course. Not needed with `dataSource`. */
  accessId?: string;
  /** Panel session token; read from the panel session when omitted. */
  accessToken?: string;
  /**
   * Replaces the default data source (`UserPanelCourseService` through the
   * panel's transport). The creator preview of the dashboard passes its own.
   */
  dataSource?: CourseDataSource;
  /** Creator preview: shows a badge and never saves progress. */
  preview?: boolean;
  /** The open lesson or test. Controlled together with `onItemChange`. */
  itemId?: string;
  onItemChange?: (itemId: string) => void;
  /** Shows a back button. */
  onBack?: () => void;
  /** Course structure to render right away (server rendering, preview). */
  initialCourse?: Course;
  /** Text overrides; Polish and English defaults by `locale`. */
  texts?: Partial<CourseTexts>;
  /** Defaults to the locale of the library (`setLocale`). */
  locale?: string;
  /** Brand colors; the panel theme (`setTheme`) by default. */
  theme?: GetThemeOutput;
  className?: string;
  /**
   * Usage statistics for your Bitsnap dashboard (course opened, lessons
   * started and completed, video progress, tests, ratings). On by default;
   * `false` turns it off, and the creator `preview` never reports. Inside
   * `<Panel>` the panel's setting applies unless this is given. An object
   * lets you forward every event: `{ onEvent }`. Nothing is stored on the
   * visitor's device.
   */
  analytics?: AnalyticsOption;
};

const AUTOPLAY_KEY = "bitsnap-course-autoplay";

function useAutoplayPreference(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(false);
  useEffect(() => {
    try {
      setValue(window.localStorage.getItem(AUTOPLAY_KEY) === "1");
    } catch {
      // Storage is not available (private mode); keep the default.
    }
  }, []);
  const update = useCallback((next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(AUTOPLAY_KEY, next ? "1" : "0");
    } catch {
      // Not persisted.
    }
  }, []);
  return [value, update];
}

const RAIL_KEY = "bitsnap-course-outline";

/** Whether the outline rail is shown next to the lesson on wide screens. */
function useRailPreference(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(RAIL_KEY) === "0") setValue(false);
    } catch {
      // Storage is not available (private mode); keep the default.
    }
  }, []);
  const update = useCallback((next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(RAIL_KEY, next ? "1" : "0");
    } catch {
      // Not persisted.
    }
  }, []);
  return [value, update];
}

function toRef(item: FlatItem | undefined): ItemRef | undefined {
  return item == null ? undefined : { id: item.id, kind: item.kind };
}

function LockedPane({
  item,
  onOpenTest,
}: {
  item: FlatItem;
  onOpenTest: (testId: string) => void;
}) {
  const { texts } = useCourseView();
  return (
    <div className={cn(CARD, "flex max-w-[68ch] flex-col items-start gap-4")} role="status">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
      >
        <Lock className="size-5" />
      </span>
      <h2 className="text-2xl font-semibold tracking-tight break-words">
        {item.title}
      </h2>
      <p className="text-base leading-relaxed text-neutral-600 dark:text-neutral-300">
        {item.lockReason
          ? fillTemplate(texts.lockedPage, {
              test: item.lockReason.gatingTestTitle,
            })
          : texts.locked}
      </p>
      {item.lockReason && (
        <Button
          data-locked-go-to-test={item.lockReason.gatingTestId}
          className={cn(ACCENT_BUTTON, "min-h-11 h-auto whitespace-normal")}
          onClick={() =>
            item.lockReason && onOpenTest(item.lockReason.gatingTestId)
          }
        >
          {fillTemplate(courseText(texts, "goToTest"), {
            test: item.lockReason.gatingTestTitle,
          })}
          <ArrowRight aria-hidden />
        </Button>
      )}
    </div>
  );
}

type LessonContainerProps = {
  course: Course;
  item: FlatItem;
  autoplay: boolean;
  onAutoplayChange: (value: boolean) => void;
  startPlaying: boolean;
  onNavigate: (ref: ItemRef) => void;
  onProgressSaved: (lessonId: string, saved: ProgressSaved) => void;
  onEnded: () => void;
  onLocked: () => void;
};

function LessonContainer({
  course,
  item,
  autoplay,
  onAutoplayChange,
  startPlaying,
  onNavigate,
  onProgressSaved,
  onEnded,
  onLocked,
}: LessonContainerProps) {
  const { dataSource, texts } = useCourseView();
  const lesson = useAsyncResource<Lesson>(
    () => dataSource.getLesson(item.id),
    [dataSource, item.id],
  );

  const lockedByServer =
    lesson.status === "error" &&
    lesson.error instanceof CourseError &&
    lesson.error.code === "item_locked";
  useEffect(() => {
    // The structure on screen is stale: take the locks from the server again.
    if (lockedByServer) onLocked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedByServer]);

  if (lesson.status === "loading") {
    return <LoadingBlock />;
  }
  if (lesson.status === "error") {
    return lockedByServer ? (
      <div className={cn(CARD, "flex flex-col gap-2")} role="alert">
        <h2 className="text-2xl font-semibold break-words">{item.title}</h2>
        <p className="text-sm">{errorMessage(lesson.error, texts)}</p>
      </div>
    ) : (
      <ErrorBox error={lesson.error} onRetry={lesson.reload} />
    );
  }

  const adjacent = getAdjacentItems(course, item.id);
  const position =
    flattenItems(course)
      .filter((entry) => entry.kind !== "test")
      .findIndex((entry) => entry.id === item.id) + 1;
  return (
    <LessonPane
      key={lesson.data.id}
      lesson={lesson.data}
      position={position}
      nextItem={findItem(
        course,
        (lesson.data.next ?? toRef(adjacent.next))?.id,
      )}
      courseType={course.type}
      prev={lesson.data.prev ?? toRef(adjacent.prev)}
      next={lesson.data.next ?? toRef(adjacent.next)}
      autoplay={autoplay}
      onAutoplayChange={onAutoplayChange}
      startPlaying={startPlaying}
      onNavigate={onNavigate}
      onProgressSaved={onProgressSaved}
      onEnded={onEnded}
      onUrlsExpired={lesson.refresh}
    />
  );
}

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The bottom sheet with the outline on small screens. */
function OutlineDrawer({
  id,
  course,
  onClose,
  children,
}: {
  id: string;
  course: Course;
  onClose: () => void;
  children: ReactNode;
}) {
  const { texts } = useCourseView();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      // Keep Tab and Shift+Tab inside the modal sheet.
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && !el.closest("[hidden]"));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      const inside = active != null && dialogRef.current.contains(active);
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed inset-0 z-50 lg:hidden" data-course-drawer>
      <div
        aria-hidden
        data-course-drawer-backdrop
        className="absolute inset-0 bg-neutral-950/50 animate-in fade-in-0 motion-reduce:animate-none"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom-8 motion-reduce:animate-none dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-b px-4 py-2",
            HAIRLINE,
          )}
        >
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {courseText(texts, "outlineTitle")}
            </h2>
            <p className={cn("text-xs tabular-nums", MUTED)}>
              {fillTemplate(texts.progressLessons, {
                done: course.completedLessons,
                total: course.totalLessons,
              })}
            </p>
          </div>
          <Button
            ref={closeRef}
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={courseText(texts, "close")}
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-3">{children}</div>
      </div>
    </div>
  );
}

function CourseView({
  course,
  selectedId,
  onSelect,
  onBack,
  onCourseChange,
  onCourseRefresh,
}: {
  course: Course;
  selectedId?: string;
  onSelect: (itemId: string) => void;
  onBack?: () => void;
  onCourseChange: (update: (course: Course) => Course) => void;
  onCourseRefresh: () => void;
}) {
  const { texts, preview } = useCourseView();
  const track = useCourseTrack();
  const rootRef = useRef<HTMLDivElement>(null);
  const drawerToggleRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const railId = useId();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railOpen, setRailOpen] = useRailPreference();
  const [view, setView] = useState<"item" | "hub">("item");
  const [autoplay, setAutoplay] = useAutoplayPreference();
  const [playOnOpen, setPlayOnOpen] = useState<string>();

  // A new item chosen from outside (the URL, the host) leaves the overview.
  const firstSelection = useRef(true);
  useEffect(() => {
    if (firstSelection.current) {
      firstSelection.current = false;
      return;
    }
    setView("item");
  }, [selectedId]);

  const currentId = resolveInitialItemId(course, selectedId);
  const item = findItem(course, currentId);

  // Once per opening of the course.
  useEffect(() => {
    track("course_opened", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id]);

  const open = (itemId: string, play = false) => {
    setPlayOnOpen(play ? itemId : undefined);
    setDrawerOpen(false);
    setView("item");
    onSelect(itemId);
    rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    drawerToggleRef.current?.focus();
  };

  const isVideo = course.type === "video";
  const outline = (
    <CourseOutline
      course={course}
      selectedId={currentId}
      variant={isVideo ? "playlist" : "modules"}
      onSelect={(entry) => open(entry.id)}
    />
  );

  let content;
  if (item == null) {
    content = <p className={cn("text-sm", MUTED)}>{texts.noItem}</p>;
  } else if (item.locked) {
    content = <LockedPane item={item} onOpenTest={(testId) => open(testId)} />;
  } else if (item.kind === "test") {
    const after = getAdjacentItems(course, item.id).next;
    content = (
      <TestPane
        key={item.id}
        testId={item.id}
        title={item.title}
        onSubmitted={() => onCourseRefresh()}
        onContinue={after && !after.locked ? () => open(after.id) : undefined}
      />
    );
  } else {
    content = (
      <LessonContainer
        key={item.id}
        course={course}
        item={item}
        autoplay={autoplay}
        onAutoplayChange={setAutoplay}
        startPlaying={playOnOpen === item.id}
        onNavigate={(ref) => open(ref.id)}
        onProgressSaved={(lessonId, saved) =>
          onCourseChange((current) => ({
            ...(saved.completed
              ? markLessonCompleted(current, lessonId)
              : current),
            completedLessons: saved.completedLessons,
            progressPercent: saved.progressPercent,
          }))
        }
        onEnded={() => {
          if (!autoplay) return;
          const target = getAutoplayTarget(course, item.id);
          if (target) open(target.id, true);
        }}
        onLocked={onCourseRefresh}
      />
    );
  }

  const showResume =
    view === "item" &&
    course.resumeItemId !== "" &&
    course.resumeItemId !== currentId &&
    findItem(course, course.resumeItemId)?.locked === false;
  const hub = view === "hub";
  const progressText = fillTemplate(courseText(texts, "progressCompact"), {
    percent: course.progressPercent,
    done: course.completedLessons,
    total: course.totalLessons,
  });
  const RailIcon = isVideo
    ? railOpen
      ? PanelRightClose
      : PanelRightOpen
    : railOpen
      ? PanelLeftClose
      : PanelLeftOpen;
  const railLabel = railOpen
    ? courseText(texts, isVideo ? "theaterMode" : "hideOutline")
    : courseText(texts, "showOutline");

  const rail = (
    <aside
      id={railId}
      data-course-rail
      aria-label={courseText(texts, "outlineTitle")}
      className={cn(
        SURFACE,
        "hidden p-3 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto",
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2 px-2 pt-1">
        <p className="text-sm font-semibold">
          {courseText(texts, "outlineTitle")}
        </p>
        <p className={cn("text-xs tabular-nums", MUTED)}>
          {fillTemplate(texts.progressLessons, {
            done: course.completedLessons,
            total: course.totalLessons,
          })}
        </p>
      </div>
      {outline}
    </aside>
  );

  return (
    <div ref={rootRef} className="flex scroll-mt-4 flex-col gap-4">
      <header
        className={cn(
          "flex min-h-12 items-center gap-1 border-b pb-1 sm:gap-2",
          HAIRLINE,
        )}
      >
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 min-h-11 shrink-0"
            onClick={onBack}
          >
            <ChevronLeft aria-hidden />
            {texts.back}
          </Button>
        )}
        <h1
          className="min-w-0 flex-1 truncate text-sm font-semibold sm:text-base"
          title={course.title}
        >
          {course.title}
        </h1>
        {course.progressPercent >= 100 && (
          <p
            role="status"
            className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700 sm:inline-flex dark:text-emerald-400"
          >
            <CheckCircle2 className="size-4" aria-hidden />
            {texts.courseCompleted ?? texts.completed}
          </p>
        )}
        <div
          data-course-progress
          className="hidden shrink-0 items-center gap-2 sm:flex"
        >
          <ProgressBar
            className="h-1 w-20"
            percent={course.progressPercent}
            label={fillTemplate(texts.progressPercent, {
              percent: course.progressPercent,
            })}
          />
          <span className={cn("text-xs tabular-nums", MUTED)}>
            {progressText}
          </span>
        </div>
        {showResume && (
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 shrink-0"
            aria-label={texts.continueCourse}
            onClick={() => open(course.resumeItemId)}
          >
            <Play aria-hidden />
            <span className="hidden xl:inline">{texts.continueCourse}</span>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          data-course-overview-toggle
          aria-pressed={hub}
          aria-label={
            hub
              ? courseText(texts, "backToLesson")
              : courseText(texts, "courseOverview")
          }
          className={cn("min-h-11 shrink-0", hub && ACCENT_WASH)}
          onClick={() => setView(hub ? "item" : "hub")}
        >
          {hub ? <ChevronLeft aria-hidden /> : <LayoutGrid aria-hidden />}
          <span className="hidden md:inline">
            {hub
              ? courseText(texts, "backToLesson")
              : courseText(texts, "courseOverview")}
          </span>
        </Button>
        {!hub && (
          <Button
            size="sm"
            variant="ghost"
            data-course-rail-toggle
            aria-controls={railId}
            aria-expanded={railOpen}
            className="hidden min-h-11 shrink-0 lg:inline-flex"
            onClick={() => setRailOpen(!railOpen)}
          >
            <RailIcon aria-hidden />
            {railLabel}
          </Button>
        )}
        {!hub && (
          <Button
            ref={drawerToggleRef}
            size="sm"
            variant="outline"
            data-course-drawer-toggle
            className="min-h-11 shrink-0 tabular-nums lg:hidden"
            aria-haspopup="dialog"
            aria-controls={drawerId}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((value) => !value)}
          >
            <List aria-hidden />
            {fillTemplate(courseText(texts, "outlineButton"), {
              done: course.completedLessons,
              total: course.totalLessons,
            })}
          </Button>
        )}
      </header>

      {preview && (
        <p
          data-course-preview
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <span className="font-semibold">{texts.previewBadge}</span>
          <span>{courseText(texts, "previewNote")}</span>
        </p>
      )}

      {hub ? (
        <CourseHub course={course} currentId={currentId} onOpen={open} />
      ) : (
        <div
          className={cn(
            "grid gap-6 lg:gap-8",
            railOpen &&
              (isVideo
                ? "lg:grid-cols-[minmax(0,1fr)_340px]"
                : "lg:grid-cols-[300px_minmax(0,1fr)]"),
          )}
        >
          {railOpen && !isVideo && rail}
          <div className="min-w-0" data-course-content>
            {content}
          </div>
          {railOpen && isVideo && rail}
        </div>
      )}

      {drawerOpen && !hub && (
        <OutlineDrawer id={drawerId} course={course} onClose={closeDrawer}>
          {outline}
        </OutlineDrawer>
      )}
    </div>
  );
}

/**
 * The course of a customer inside the panel: structure with progress and
 * locks, lessons with video, text and attachments, tests, questions and
 * ratings. Standard courses get a sidebar of modules, video courses a
 * playlist next to the player.
 *
 * Load it lazily from `bitsnap-react/course`. Inside the panel it needs only
 * `accessId` of the purchased course.
 */
export function PanelCourse({
  accessId,
  accessToken,
  dataSource: customDataSource,
  preview = false,
  itemId,
  onItemChange,
  onBack,
  initialCourse,
  texts: textOverrides,
  locale,
  theme,
  className,
  analytics,
}: PanelCourseProps) {
  const panel = usePanelConfig();
  // The creator preview reports nothing, not even the page view of the page it sits on.
  const instrument = useInstrument(panel.projectID, preview ? false : analytics, "course");
  const texts = useMemo(
    () => getCourseTexts(textOverrides, locale),
    [textOverrides, locale],
  );
  const dataSource = useMemo(() => {
    if (customDataSource) return customDataSource;
    if (accessId == null || accessId === "") {
      throw new Error("PanelCourse needs an accessId or a dataSource");
    }
    return createRpcCourseDataSource({ accessId, accessToken });
  }, [customDataSource, accessId, accessToken]);

  const course = useAsyncResource<Course>(
    () => dataSource.getCourse(),
    [dataSource],
    initialCourse,
  );

  const [internalItemId, setInternalItemId] = useState<string>();
  // With `onItemChange` the owner navigates, so no `itemId` means the default
  // item, not the one picked last.
  const selectedId = onItemChange ? itemId : (itemId ?? internalItemId);
  const select = useCallback(
    (next: string) => {
      setInternalItemId(next);
      onItemChange?.(next);
    },
    [onItemChange],
  );

  const style = accentVars(theme?.colors ?? panel.theme?.colors);

  const courseId = course.status === "success" ? course.data.id : undefined;
  const viewValue = useMemo(
    () => ({
      dataSource,
      texts,
      preview,
      analytics: { courseId, instrument },
    }),
    [dataSource, texts, preview, courseId, instrument],
  );

  return (
    <InstrumentProvider value={instrument}>
    <CourseViewProvider value={viewValue}>
      <div
        data-bitsnap-course
        data-course-type={course.status === "success" ? course.data.type : undefined}
        style={style}
        className={cn("font-inter mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8", className)}
      >
        {course.status === "loading" && (
          <div className="flex flex-col gap-4">
            {onBack && (
              <Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
                <ChevronLeft aria-hidden />
                {texts.back}
              </Button>
            )}
            <p className="sr-only" role="status">
              {texts.loading}
            </p>
            <LoadingBlock />
          </div>
        )}
        {course.status === "error" && (
          <div className="flex flex-col gap-4">
            {onBack && (
              <Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
                <ChevronLeft aria-hidden />
                {texts.back}
              </Button>
            )}
            <ErrorBox error={course.error} onRetry={course.reload} />
          </div>
        )}
        {course.status === "success" && (
          <CourseView
            course={course.data}
            selectedId={selectedId}
            onSelect={select}
            onBack={onBack}
            onCourseChange={course.mutate}
            onCourseRefresh={course.refresh}
          />
        )}
      </div>
    </CourseViewProvider>
    </InstrumentProvider>
  );
}

export default PanelCourse;
