import { ChevronLeft, List, Play } from "lucide-react";
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
import { getCourseTexts, type CourseTexts } from "./texts";
import { TestPane } from "./TestPane";
import {
  CourseError,
  type Course,
  type CourseDataSource,
  type ItemRef,
  type Lesson,
  type ProgressSaved,
} from "./types";
import { CARD, ErrorBox, LoadingBlock, ProgressBar, errorMessage } from "./ui";
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

function toRef(item: FlatItem | undefined): ItemRef | undefined {
  return item == null ? undefined : { id: item.id, kind: item.kind };
}

function LockedPane({ item }: { item: FlatItem }) {
  const { texts } = useCourseView();
  return (
    <div className={cn(CARD, "space-y-2")} role="status">
      <h2 className="text-2xl font-semibold break-words">{item.title}</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        {item.lockReason
          ? fillTemplate(texts.lockedPage, {
              test: item.lockReason.gatingTestTitle,
            })
          : texts.locked}
      </p>
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
  mobileOutline: ReactNode;
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
  mobileOutline,
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
      <div className={cn(CARD, "space-y-2")} role="alert">
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
      mobileOutline={mobileOutline}
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
  const contentsId = useId();
  const [contentsOpen, setContentsOpen] = useState(false);
  const [autoplay, setAutoplay] = useAutoplayPreference();
  const [playOnOpen, setPlayOnOpen] = useState<string>();

  const currentId = resolveInitialItemId(course, selectedId);
  const item = findItem(course, currentId);

  // Once per opening of the course.
  useEffect(() => {
    track("course_opened", {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id]);

  const open = (itemId: string, play = false) => {
    setPlayOnOpen(play ? itemId : undefined);
    setContentsOpen(false);
    onSelect(itemId);
    rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const outline = (
    <CourseOutline
      course={course}
      selectedId={currentId}
      variant={course.type === "video" ? "playlist" : "modules"}
      onSelect={(entry) => open(entry.id)}
    />
  );

  let content;
  if (item == null) {
    content = <p className="text-sm text-neutral-500">{texts.noItem}</p>;
  } else if (item.locked) {
    content = <LockedPane item={item} />;
  } else if (item.kind === "test") {
    content = (
      <TestPane
        key={item.id}
        testId={item.id}
        title={item.title}
        onSubmitted={() => onCourseRefresh()}
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
        mobileOutline={outline}
      />
    );
  }

  const isVideo = course.type === "video";
  const showResume =
    course.resumeItemId !== "" &&
    course.resumeItemId !== currentId &&
    findItem(course, course.resumeItemId)?.locked === false;

  return (
    <div ref={rootRef} className="space-y-4 scroll-mt-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ChevronLeft aria-hidden />
              {texts.back}
            </Button>
          )}
          {preview && (
            <span
              data-course-preview
              className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
            >
              {texts.previewBadge}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold break-words sm:text-3xl">
              {course.title}
            </h1>
          </div>
          {showResume && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => open(course.resumeItemId)}
            >
              <Play aria-hidden />
              {texts.continueCourse}
            </Button>
          )}
        </div>
        <div className="max-w-xl space-y-1">
          {course.progressPercent >= 100 && (
            <p
              role="status"
              className="font-semibold text-emerald-700 dark:text-emerald-400"
            >
              {texts.courseCompleted ?? texts.completed}
            </p>
          )}
          <ProgressBar
            percent={course.progressPercent}
            label={fillTemplate(texts.progressPercent, {
              percent: course.progressPercent,
            })}
          />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {fillTemplate(texts.progressLessons, {
              done: course.completedLessons,
              total: course.totalLessons,
            })}
            {" · "}
            {fillTemplate(texts.progressPercent, {
              percent: course.progressPercent,
            })}
          </p>
        </div>
      </header>

      <div
        className={cn(
          "grid gap-6",
          isVideo
            ? "lg:grid-cols-[minmax(0,1fr)_380px]"
            : "lg:grid-cols-[320px_minmax(0,1fr)]",
        )}
      >
        {!isVideo && (
          <div className="lg:hidden">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              aria-controls={contentsId}
              aria-expanded={contentsOpen}
              onClick={() => setContentsOpen((value) => !value)}
            >
              <List aria-hidden />
              {texts.contents}
            </Button>
          </div>
        )}

        {!isVideo && (
          <aside
            id={contentsId}
            className={cn(
              CARD,
              "p-3 sm:p-3 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto",
              contentsOpen ? "block" : "hidden",
            )}
          >
            {outline}
          </aside>
        )}

        <div className="min-w-0" data-course-content>
          {content}
        </div>

        {isVideo && (
          <aside
            className={cn(
              CARD,
              "hidden p-3 sm:p-3 lg:block lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto",
            )}
          >
            {outline}
          </aside>
        )}
      </div>
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
        className={cn("font-inter w-full max-w-7xl", className)}
      >
        {course.status === "loading" && (
          <div className="space-y-4">
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack}>
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
          <div className="space-y-4">
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack}>
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
