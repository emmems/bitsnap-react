import { createContext, useContext } from "react";
import type { Instrument } from "@/src/analytics/instrument";
import type { CourseTexts } from "./texts";
import type { CourseDataSource } from "./types";

export type CourseAnalytics = {
  /** `undefined` until the course has loaded. */
  courseId?: string;
  instrument: Instrument;
};

export type CourseViewContextValue = {
  dataSource: CourseDataSource;
  texts: CourseTexts;
  /** Creator preview: nothing the viewer does is saved as progress. */
  preview: boolean;
  /** Usage statistics; none without it. */
  analytics?: CourseAnalytics;
};

const CourseViewContext = createContext<CourseViewContextValue | undefined>(
  undefined,
);

export const CourseViewProvider = CourseViewContext.Provider;

export function useCourseView(): CourseViewContextValue {
  const value = useContext(CourseViewContext);
  if (value == null) {
    throw new Error("Course components have to be rendered inside PanelCourse");
  }
  return value;
}
