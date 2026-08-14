import { extractDate } from "./nlpDate";
import type { Project, Tag } from "./api";

export interface ParsedLine {
  title: string;
  projectId?: string;
  tagIds: string[];
  dueDate?: string;
}

// Parses "Fix bug #Orbit @urgent next tuesday" into title + project/tag refs + a date,
// entirely locally — string matching against the project/tag names you already have.
export function parseTaskLine(line: string, projects: Project[], tags: Tag[]): ParsedLine {
  let working = line;
  let projectId: string | undefined;
  let dueDate: string | undefined;
  const tagIds: string[] = [];

  const dateResult = extractDate(working);
  if (dateResult) {
    dueDate = dateResult.date;
    working = dateResult.cleanedText;
  }

  working = working.replace(/#(\S+)/g, (match, name) => {
    const project = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (project) {
      projectId = project.id;
      return "";
    }
    return match;
  });

  working = working.replace(/@(\S+)/g, (match, name) => {
    const tag = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (tag) {
      tagIds.push(tag.id);
      return "";
    }
    return match;
  });

  return { title: working.replace(/\s+/g, " ").trim(), projectId, tagIds, dueDate };
}
