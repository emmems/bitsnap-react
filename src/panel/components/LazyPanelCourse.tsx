import { lazy, Suspense } from "react";
import type { PanelCourseProps } from "../../course";
import LoadingIndicator from "../LoadingIndicator";

// The course view (video player, sanitizer, tests) is loaded when a customer
// opens a course, so it does not weigh on the rest of the panel.
const PanelCourse = lazy(() =>
  import("../../course").then((module) => ({
    default: module.PanelCourse,
  })),
);

/** `PanelCourse` loaded on demand. */
export default function LazyPanelCourse(props: PanelCourseProps) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 p-2" role="status">
          <LoadingIndicator />
        </div>
      }
    >
      <div className="[--course-mobile-bottom:calc(56px+env(safe-area-inset-bottom))] md:[--course-mobile-bottom:0px]">
        <PanelCourse {...props} />
      </div>
    </Suspense>
  );
}
