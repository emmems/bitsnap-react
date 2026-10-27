import { createContext, useContext } from "react";
import type { CourseTexts } from "./texts";
import type { CourseDataSource } from "./types";

export type CourseViewContextValue = {
  dataSource: CourseDataSource;
  texts: CourseTexts;
  /** Creator preview: nothing the viewer does is saved as progress. */
  preview: boolean;
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
