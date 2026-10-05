import { extractDate } from "./nlpDate";
import { localISODate } from "./dates";
import type { Priority, Project, Tag } from "./api";

export interface ParsedLine {
  title: string;
  projectId?: string;
  tagIds: string[];
  dueDate?: string;
  priority?: Priority;
  recurrence?: "daily" | "weekly" | "monthly" | "interval" | "custom_days";
  recurrenceIntervalDays?: number;
  recurrenceDays?: number[];
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_PATTERN = "sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?";
const dayIndex = (word: string) => DAY_NAMES.findIndex((d) => d.startsWith(word.toLowerCase().slice(0, 3)));

// The next date (today included) that falls on one of the given weekdays.
function nextOnWeekday(days: number[]): string {
  const d = new Date();
  for (let i = 0; i < 7; i++) {
    if (days.includes(d.getDay())) break;
    d.setDate(d.getDate() + 1);
  }
  return localISODate(d);
}

// "every day", "every 3 days", "every week", "every month", "every weekday",
// "every monday", "every mon, wed and fri". Returns what it understood plus the text with
// that phrase removed, or null if there's no repeat phrase in the line.
function extractRecurrence(text: string): (Pick<ParsedLine, "recurrence" | "recurrenceIntervalDays" | "recurrenceDays"> & { cleaned: string; firstDue?: string }) | null {
  const strip = (re: RegExp) => text.replace(re, " ");
  let m: RegExpMatchArray | null;

  const interval = /\bevery (\d+) days?\b/i;
  if ((m = text.match(interval))) {
    const n = Math.max(1, Number(m[1]));
    return n === 1 ? { recurrence: "daily", cleaned: strip(interval) } : { recurrence: "interval", recurrenceIntervalDays: n, cleaned: strip(interval) };
  }
  const weekdays = /\bevery weekday\b/i;
  if (weekdays.test(text)) {
    const days = [1, 2, 3, 4, 5];
    return { recurrence: "custom_days", recurrenceDays: days, firstDue: nextOnWeekday(days), cleaned: strip(weekdays) };
  }
  const named = new RegExp(`\\bevery ((?:${DAY_PATTERN})(?:(?:\\s*,\\s*|\\s+and\\s+|\\s*&\\s*|\\s+)(?:${DAY_PATTERN}))*)\\b`, "i");
  if ((m = text.match(named))) {
    const days = [...new Set((m[1].match(new RegExp(DAY_PATTERN, "gi")) ?? []).map(dayIndex))].filter((d) => d >= 0).sort();
    if (days.length) {
      // One weekday is a plain weekly repeat anchored on that day; several need the day list.
      return days.length === 1
        ? { recurrence: "weekly", firstDue: nextOnWeekday(days), cleaned: strip(named) }
        : { recurrence: "custom_days", recurrenceDays: days, firstDue: nextOnWeekday(days), cleaned: strip(named) };
    }
  }
  const simple = /\b(?:every (day|week|month)|(daily|weekly|monthly))\b/i;
  if ((m = text.match(simple))) {
    const word = (m[1] ?? m[2]).toLowerCase();
    const recurrence = word.startsWith("d") ? "daily" : word.startsWith("w") ? "weekly" : "monthly";
    return { recurrence, cleaned: strip(simple) };
  }
  return null;
}

// Parses a quick-add line entirely locally — no AI, just patterns and string matching against
// the project/tag names you already have:
//
//   Fix bug #Orbit @urgent next tuesday        project, tag, date
//   Prep slides #"Interview Prep" !high        quoted name for multi-word projects/tags, priority
//   Water plants every 3 days                  repeats (also: every monday, every mon wed fri,
//                                              every weekday, daily/weekly/monthly)
//
// Anything that doesn't resolve (an unknown #name, say) is left in the title untouched.
export function parseTaskLine(line: string, projects: Project[], tags: Tag[]): ParsedLine {
  let working = line;
  let projectId: string | undefined;
  let dueDate: string | undefined;
  let priority: Priority | undefined;
  const tagIds: string[] = [];

  // Names first, so a project called "Monday Sync" isn't eaten by the date/repeat parsing.
  // Either #"quoted name" or #bare-token; an unquoted name with underscores or hyphens also
  // matches the same name written with spaces (#interview_prep -> "Interview Prep").
  const same = (candidate: string, typed: string) => {
    const a = candidate.toLowerCase();
    const b = typed.toLowerCase();
    return a === b || a === b.replace(/[_-]/g, " ");
  };
  working = working.replace(/#(?:"([^"]+)"|(\S+))/g, (match, quoted, bare) => {
    const project = projects.find((p) => same(p.name, quoted ?? bare));
    if (!project) return match;
    projectId = project.id;
    return " ";
  });
  working = working.replace(/@(?:"([^"]+)"|(\S+))/g, (match, quoted, bare) => {
    const tag = tags.find((t) => same(t.name, quoted ?? bare));
    if (!tag) return match;
    if (!tagIds.includes(tag.id)) tagIds.push(tag.id);
    return " ";
  });

  working = working.replace(/(^|\s)!(urgent|high|medium|med|low)\b/gi, (_match, lead, level) => {
    const l = level.toLowerCase();
    priority = l === "med" ? "medium" : (l as Priority);
    return lead;
  });

  const repeat = extractRecurrence(working);
  if (repeat) working = repeat.cleaned;

  const dateResult = extractDate(working);
  if (dateResult) {
    dueDate = dateResult.date;
    working = dateResult.cleanedText;
  }
  // A repeating task needs a first date to count from: an explicit one wins, then the next
  // matching weekday for "every monday"-style repeats, otherwise it starts today.
  if (repeat && !dueDate) dueDate = repeat.firstDue ?? localISODate();

  return {
    title: working.replace(/\s+/g, " ").trim(),
    projectId,
    tagIds,
    dueDate,
    priority,
    recurrence: repeat?.recurrence,
    recurrenceIntervalDays: repeat?.recurrenceIntervalDays,
    recurrenceDays: repeat?.recurrenceDays,
  };
}
