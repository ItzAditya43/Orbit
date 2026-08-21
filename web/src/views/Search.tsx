import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Task } from "../api";
import { TaskRow } from "../components/TaskRow";

export default function Search() {
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const { data: tasks = [], isFetching } = useQuery({
    queryKey: ["tasks", "search", q],
    queryFn: () => api.tasks.list({ q }),
    enabled: q.trim().length > 0,
  });
  const { data: notes = [] } = useQuery({
    queryKey: ["notes", "search", q],
    queryFn: () => api.notes.list({ q }),
    enabled: q.trim().length > 0,
  });
  const { data: allHabits = [] } = useQuery({ queryKey: ["habits"], queryFn: api.habits.list });
  const { data: allGoals = [] } = useQuery({ queryKey: ["goals"], queryFn: api.goals.list });
  const { data: allProjects = [] } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });

  const needle = q.trim().toLowerCase();
  const habits = needle ? allHabits.filter((h: any) => h.title?.toLowerCase().includes(needle)) : [];
  const goals = needle ? allGoals.filter((g: any) => g.title?.toLowerCase().includes(needle)) : [];
  const projects = needle ? allProjects.filter((p: any) => p.name?.toLowerCase().includes(needle)) : [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["tasks"] });
  const onToggle = async (task: Task) => {
    task.status === "done" ? await api.tasks.reopen(task.id) : await api.tasks.complete(task.id);
    invalidate();
  };
  const onDelete = async (task: Task) => {
    await api.tasks.remove(task.id);
    invalidate();
  };

  const noResults =
    q && tasks.length === 0 && notes.length === 0 && habits.length === 0 && goals.length === 0 && projects.length === 0 && !isFetching;

  return (
    <div className="max-w-2xl xl:max-w-3xl 2xl:max-w-4xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Search</h1>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search tasks, notes, habits, goals, projects..."
        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none"
      />
      {isFetching && <p className="text-sm text-neutral-400">Searching...</p>}

      {tasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Tasks</p>
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} />
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Notes</p>
          {notes.map((n: any) => (
            <Link
              key={n.id}
              to="/notes"
              className="block text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
            >
              <p className="font-medium">{n.title}</p>
              {n.body && <p className="text-xs text-neutral-400 truncate mt-0.5">{n.body}</p>}
            </Link>
          ))}
        </div>
      )}

      {habits.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Habits</p>
          {habits.map((h: any) => (
            <Link
              key={h.id}
              to="/habits"
              className="block text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
            >
              {h.title}
            </Link>
          ))}
        </div>
      )}

      {goals.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Goals</p>
          {goals.map((g: any) => (
            <Link
              key={g.id}
              to="/goals"
              className="block text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
            >
              {g.title}
            </Link>
          ))}
        </div>
      )}

      {projects.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Projects</p>
          {projects.map((p: any) => (
            <Link
              key={p.id}
              to="/projects"
              className="block text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

      {noResults && <p className="text-sm text-neutral-400">No matches.</p>}
    </div>
  );
}
