import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Modify<T, R> = Omit<T, keyof R> & R;

export type Partial<T> = {
  [P in keyof T]?: T[P];
};
