const BASE = "http://localhost:4310/api";

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
  created_at: string;
  updated_at: string;
  tags: Tag[];
  subtasks?: Task[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
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
  },
  projects: {
    list: () => req<Project[]>(`/projects`),
    create: (body: { name: string; color?: string; description?: string }) =>
      req<Project>(`/projects`, { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      req<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => req<void>(`/projects/${id}`, { method: "DELETE" }),
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
    summary: () => req<any>(`/analytics/summary`),
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
  },
  habits: {
    list: () => req<any[]>(`/habits`),
    create: (body: { title: string; frequency?: string }) =>
      req<any>(`/habits`, { method: "POST", body: JSON.stringify(body) }),
    log: (id: string) => req<any>(`/habits/${id}/log`, { method: "POST", body: JSON.stringify({}) }),
    remove: (id: string) => req<void>(`/habits/${id}`, { method: "DELETE" }),
  },
  notes: {
    list: (params?: Record<string, string>) =>
      req<any[]>(`/notes${params ? "?" + new URLSearchParams(params).toString() : ""}`),
    create: (body: { title: string; body?: string; color?: string }) => req<any>(`/notes`, { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: { title?: string; body?: string; color?: string; pinned?: boolean }) =>
      req<any>(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => req<void>(`/notes/${id}`, { method: "DELETE" }),
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
  },
  ai: {
    status: () => req<any>(`/ai/status`),
    command: (text: string) => req<any>(`/ai/command`, { method: "POST", body: JSON.stringify({ text }) }),
  },
};
