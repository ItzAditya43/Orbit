import type { Priority } from "./api";

export const PRIORITIES: Priority[] = ["none", "low", "medium", "high", "urgent"];

export const PRIORITY_META: Record<Priority, { label: string; dot: string; text: string; bg: string }> = {
  none: { label: "No priority", dot: "bg-neutral-300 dark:bg-neutral-600", text: "text-neutral-400", bg: "" },
  low: { label: "Low", dot: "bg-sky-400", text: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950/40" },
  medium: {
    label: "Medium",
    dot: "bg-amber-400",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
  },
  high: {
    label: "High",
    dot: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/40",
  },
  urgent: { label: "Urgent", dot: "bg-red-500", text: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/40" },
};
