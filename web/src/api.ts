import { useConnectionStore } from "./connectionStore";

const BASE = "http://localhost:4310/api";

export class ApiError extends Error {
  isConnectionError: boolean;
  status?: number;
  constructor(message: string, opts: { isConnectionError: boolean; status?: number }) {
    super(message);
    this.isConnectionError = opts.isConnectionError;
    this.status = opts.status;
  }
}

export type Priority = "none" | "low" | "medium" | "high" | "urgent";
export type TaskStatus = "open" | "in_progress" | "done" | "archived";

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

export interface Project {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  is_archived: number;
  open_task_count?: number;
  done_task_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: Priority;
  project_id: string | null;
  project_color?: string | null;
  parent_id: string | null;
  is_inbox: number;
  estimate_minutes: number | null;
  actual_minutes: number;
  due_date: string | null;
  start_date: string | null;
  scheduled_at: string | null;
  order_index: number;
  completed_at: string | null;
  recurrence?: string | null;
  deleted_at?: string | null;
  color?: string | null;
  energy?: "low" | "medium" | "high" | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  subtasks?: Task[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    // The local server is unreachable (not running, crashed, wrong port). This is the
    // failure mode that otherwise looks like "the app just does nothing" — every button
    // click silently swallowed a rejected promise with no feedback. Surface it globally.
    useConnectionStore.getState().setConnected(false);
    throw new ApiError("Can't reach the local server. Is it running?", { isConnectionError: true });
  }
  useConnectionStore.getState().setConnected(true);
  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try {
      message = JSON.parse(body).error ?? body;
    } catch {
      // body wasn't JSON — use as-is
    }
    throw new ApiError(message || `Request failed (${res.status})`, { isConnectionError: false, status: res.status });
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  tasks: {
    list: (params?: Record<string, string>) =>
      req<Task[]>(`/tasks${params ? "?" + new URLSearchParams(params).toString() : ""}`),
    get: (id: string) => req<Task>(`/tasks/${id}`),
    create: (body: {
      title: string;
      notes?: string;
      projectId?: string;
      parentId?: string;
      priority?: Priority;
      dueDate?: string;
      startDate?: string;
      scheduledAt?: string;
      estimateMinutes?: number;
      isInbox?: boolean;
      tagIds?: string[];
    }) => req<Task>(`/tasks`, { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      req<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    complete: (id: string) => req<Task>(`/tasks/${id}/complete`, { method: "POST" }),
    reopen: (id: string) => req<Task>(`/tasks/${id}/reopen`, { method: "POST" }),
    remove: (id: string) => req<void>(`/tasks/${id}`, { method: "DELETE" }),
    duplicate: (id: string) => req<Task>(`/tasks/${id}/duplicate`, { method: "POST" }),
    convertToProject: (id: string) => req<Project>(`/tasks/${id}/convert-to-project`, { method: "POST" }),
    bulk: (body: { taskIds: string[]; action: "complete" | "reopen" | "delete" | "move" | "tag" | "priority"; projectId?: string; tagId?: string; priority?: Priority }) =>
      req<{ ok: boolean; count: number }>(`/tasks/bulk`, { method: "POST", body: JSON.stringify(body) }),
    trash: () => req<Task[]>(`/tasks/trash`),
    emptyTrash: () => req<{ ok: boolean; count: number }>(`/tasks/trash/empty`, { method: "POST" }),
    restore: (id: string) => req<Task>(`/tasks/${id}/restore`, { method: "POST" }),
    removePermanent: (id: string) => req<void>(`/tasks/${id}?permanent=true`, { method: "DELETE" }),
    checkDuplicate: (title: string) => req<{ id: string; title: string }[]>(`/tasks/check-duplicate?title=${encodeURIComponent(title)}`),
    snooze: (id: string, preset: "tomorrow" | "in3days" | "nextWeek" | "nextMonth") =>
      req<Task>(`/tasks/${id}/snooze`, { method: "POST", body: JSON.stringify({ preset }) }),
    autoSchedule: (date?: string) => req<{ scheduled: any[]; unscheduledCount: number }>(`/tasks/auto-schedule`, { method: "POST", body: JSON.stringify({ date }) }),
    dependencies: (id: string) => req<{ blockedBy: Task[]; blocks: Task[] }>(`/tasks/${id}/dependencies`),
    addDependency: (id: string, blocksTaskId: string) =>
      req<{ ok: boolean }>(`/tasks/${id}/dependencies`, { method: "POST", body: JSON.stringify({ blocksTaskId }) }),
    removeDependency: (id: string, blocksTaskId: string) =>
      req<void>(`/tasks/${id}/dependencies/${blocksTaskId}`, { method: "DELETE" }),
  },
  taskTemplates: {
    list: () => req<any[]>(`/task-templates`),
    create: (body: { name: string; title: string; notes?: string; priority?: Priority; estimateMinutes?: number; projectId?: string; subtasks?: string[] }) =>
      req<any>(`/task-templates`, { method: "POST", body: JSON.stringify(body) }),
    remove: (id: string) => req<void>(`/task-templates/${id}`, { method: "DELETE" }),
    instantiate: (id: string, body?: { dueDate?: string }) =>
      req<Task>(`/task-templates/${id}/instantiate`, { method: "POST", body: JSON.stringify(body ?? {}) }),
  },
  projects: {
    list: () => req<Project[]>(`/projects`),
    create: (body: { name: string; color?: string; description?: string }) =>
      req<Project>(`/projects`, { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      req<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => req<void>(`/projects/${id}`, { method: "DELETE" }),
    archived: () => req<Project[]>(`/projects/archived`),
    trash: () => req<Project[]>(`/projects/trash`),
    restore: (id: string) => req<Project>(`/projects/${id}/restore`, { method: "POST" }),
    removePermanent: (id: string) => req<void>(`/projects/${id}?permanent=true`, { method: "DELETE" }),
  },
  tags: {
    list: () => req<Tag[]>(`/tags`),
    create: (body: { name: string; color?: string }) => req<Tag>(`/tags`, { method: "POST", body: JSON.stringify(body) }),
  },
  focusSessions: {
    list: () => req<any[]>(`/focus-sessions`),
    start: (body: { taskId?: string; mode?: string; plannedMinutes?: number }) =>
      req<any>(`/focus-sessions`, { method: "POST", body: JSON.stringify(body) }),
    end: (id: string, body: { wasCompleted?: boolean; notes?: string }) =>
      req<any>(`/focus-sessions/${id}/end`, { method: "POST", body: JSON.stringify(body) }),
  },
  timeEntries: {
    list: (params?: Record<string, string>) =>
      req<any[]>(`/time-entries${params ? "?" + new URLSearchParams(params).toString() : ""}`),
    start: (body: { taskId?: string; projectId?: string }) =>
      req<any>(`/time-entries`, { method: "POST", body: JSON.stringify(body) }),
    stop: (id: string) => req<any>(`/time-entries/${id}/stop`, { method: "POST" }),
    update: (id: string, body: { startedAt?: string; endedAt?: string }) =>
      req<any>(`/time-entries/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => req<void>(`/time-entries/${id}`, { method: "DELETE" }),
    summary: (range: "week" | "month") => req<any>(`/time-entries/summary?range=${range}`),
  },
  calendar: {
    list: (params?: Record<string, string>) =>
      req<any[]>(`/calendar${params ? "?" + new URLSearchParams(params).toString() : ""}`),
    create: (body: {
      title: string;
      startsAt: string;
      endsAt: string;
      allDay?: boolean;
      color?: string;
      location?: string;
      taskId?: string;
      projectId?: string;
      notes?: string;
    }) => req<any>(`/calendar`, { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      req<any>(`/calendar/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => req<void>(`/calendar/${id}`, { method: "DELETE" }),
  },
  analytics: {
    summary: (params?: { from?: string; to?: string }) =>
      req<any>(`/analytics/summary${params?.from ? `?from=${params.from}&to=${params.to}` : ""}`),
  },
  boundaries: {
    list: () => req<any[]>(`/boundaries`),
    create: (body: { category: string; name: string }) =>
      req<any>(`/boundaries`, { method: "POST", body: JSON.stringify(body) }),
    remove: (id: string) => req<void>(`/boundaries/${id}`, { method: "DELETE" }),
    check: (label: string) => req<any>(`/boundaries/check`, { method: "POST", body: JSON.stringify({ label }) }),
  },
  scopeReview: {
    list: () => req<any[]>(`/scope-review`),
    create: (body: { label: string; kind: string }) =>
      req<any>(`/scope-review`, { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { status?: string; reason?: string }) =>
      req<any>(`/scope-review/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  },
  goals: {
    list: () => req<any[]>(`/goals`),
    create: (body: { title: string; horizon?: string; targetDate?: string }) =>
      req<any>(`/goals`, { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      req<any>(`/goals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => req<void>(`/goals/${id}`, { method: "DELETE" }),
    addMilestone: (id: string, title: string) =>
      req<any>(`/goals/${id}/milestones`, { method: "POST", body: JSON.stringify({ title }) }),
    updateMilestone: (id: string, milestoneId: string, body: { isDone?: boolean; title?: string }) =>
      req<any>(`/goals/${id}/milestones/${milestoneId}`, { method: "PATCH", body: JSON.stringify(body) }),
    removeMilestone: (id: string, milestoneId: string) =>
      req<any>(`/goals/${id}/milestones/${milestoneId}`, { method: "DELETE" }),
  },
  habits: {
    list: () => req<any[]>(`/habits`),
    create: (body: { title: string; frequency?: string }) =>
      req<any>(`/habits`, { method: "POST", body: JSON.stringify(body) }),
    log: (id: string) => req<any>(`/habits/${id}/log`, { method: "POST", body: JSON.stringify({}) }),
    unlog: (id: string) => req<void>(`/habits/${id}/log`, { method: "DELETE", body: JSON.stringify({}) }),
    remove: (id: string) => req<void>(`/habits/${id}`, { method: "DELETE" }),
  },
  notes: {
    list: (params?: Record<string, string>) =>
      req<any[]>(`/notes${params ? "?" + new URLSearchParams(params).toString() : ""}`),
    create: (body: { title: string; body?: string; color?: string }) => req<any>(`/notes`, { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { title?: string; body?: string; color?: string; pinned?: boolean }) =>
      req<any>(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => req<void>(`/notes/${id}`, { method: "DELETE" }),
    convertToTask: (id: string) => req<Task>(`/notes/${id}/convert-to-task`, { method: "POST" }),
    trash: () => req<any[]>(`/notes/trash`),
    restore: (id: string) => req<any>(`/notes/${id}/restore`, { method: "POST" }),
    removePermanent: (id: string) => req<void>(`/notes/${id}?permanent=true`, { method: "DELETE" }),
  },
  automations: {
    list: () => req<any[]>(`/automations`),
    create: (body: { name: string; triggerType: string; actionType: string; config?: Record<string, unknown> }) =>
      req<any>(`/automations`, { method: "POST", body: JSON.stringify(body) }),
    setEnabled: (id: string, isEnabled: boolean) =>
      req<any>(`/automations/${id}`, { method: "PATCH", body: JSON.stringify({ isEnabled }) }),
    remove: (id: string) => req<void>(`/automations/${id}`, { method: "DELETE" }),
    runs: () => req<any[]>(`/automations/runs`),
  },
  notifications: {
    list: () => req<any[]>(`/notifications`),
    markRead: (id: string) => req<any>(`/notifications/${id}/read`, { method: "POST" }),
    markAllRead: () => req<any>(`/notifications/read-all`, { method: "POST" }),
    checkDue: () => req<{ created: number }>(`/notifications/check-due`, { method: "POST" }),
  },
  ai: {
    status: () => req<any>(`/ai/status`),
    command: (text: string) => req<any>(`/ai/command`, { method: "POST", body: JSON.stringify({ text }) }),
    pendingActions: () => req<any[]>(`/ai/actions?status=pending`),
    approveAction: (id: string) => req<any>(`/ai/actions/${id}/approve`, { method: "POST" }),
    rejectAction: (id: string) => req<any>(`/ai/actions/${id}/reject`, { method: "POST" }),
  },
  settings: {
    get: () => req<any>(`/settings`),
    update: (body: Record<string, unknown>) => req<any>(`/settings`, { method: "PATCH", body: JSON.stringify(body) }),
  },
  review: {
    daily: () => req<any>(`/review/daily`),
    weekly: () => req<any>(`/review/weekly`),
  },
  filters: {
    list: () => req<any[]>(`/filters`),
    create: (body: { name: string; query: Record<string, string> }) => req<any>(`/filters`, { method: "POST", body: JSON.stringify(body) }),
    remove: (id: string) => req<void>(`/filters/${id}`, { method: "DELETE" }),
  },
  sync: {
    backups: () => req<{ name: string; sizeBytes: number; createdAt: string }[]>(`/sync/backups`),
    exportEncrypted: (passphrase: string) => req<any>(`/sync/export-encrypted`, { method: "POST", body: JSON.stringify({ passphrase }) }),
    importEncrypted: (body: { passphrase: string; salt: string; iv: string; authTag: string; ciphertext: string }) =>
      req<any>(`/sync/import-encrypted`, { method: "POST", body: JSON.stringify(body) }),
  },
};
