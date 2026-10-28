import { useCallback } from "react";
import type { EventProps } from "@/src/analytics/contract";
import { useCourseView } from "./context";

type CourseEventName =
  | "course_opened"
  | "lesson_started"
  | "lesson_completed"
  | "video_progress"
  | "test_submitted"
  | "lesson_rated";

/**
 * Reports a course event; `course_id` is added. Nothing is reported in the
 * creator preview, before the course has loaded, or without analytics.
 */
export function useCourseTrack() {
  const { analytics, preview } = useCourseView();
  return useCallback(
    <E extends CourseEventName>(
      event: E,
      props: Omit<EventProps<E>, "course_id">,
    ) => {
      if (preview || analytics?.courseId == null) {
        return;
      }
      analytics.instrument.track(event, {
        ...props,
        course_id: analytics.courseId,
      } as unknown as EventProps<E>);
    },
    [analytics, preview],
  );
}
