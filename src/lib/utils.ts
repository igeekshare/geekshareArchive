import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function visiblePageNumbers(page: number, totalPages: number): number[] {
  const total = Math.max(1, Math.floor(totalPages));
  const current = Math.min(total, Math.max(1, Math.floor(page)));
  const count = Math.min(5, total);
  const start = Math.min(Math.max(1, current - 2), total - count + 1);
  return Array.from({ length: count }, (_, index) => start + index);
}
