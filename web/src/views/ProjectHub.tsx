import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

// "Everything about this project" — the meaningful alternative to a single flat feed of
// every entity in the whole app, which tends toward noise rather than clarity. Scoping to
// one project gives "meaningful" an actual anchor: its tasks, notes, goals, habits, boards,
// and time all in one place because they share what they're about, not just their type.
export default function ProjectHub() {
  const { id } = useParams();
  const { data: project } = useQuery({ queryKey: ["projects", id], queryFn: async () => (await api.projects.list()).find((p) => p.id === id) });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks", "project", id], queryFn: () => api.tasks.list({ view: "project", projectId: id! }) });
  const { data: notes = [] } = useQuery({ queryKey: ["notes"], queryFn: () => api.notes.list() });
  const { data: goals = [] } = useQuery({ queryKey: ["goals"], queryFn: api.goals.list });
  const { data: boards = [] } = useQuery({ queryKey: ["boards", id], queryFn: () => api.boards.list(id) });
  const { data: timeEntries = [] } = useQuery({ queryKey: ["time-entries"], queryFn: () => api.timeEntries.list() });

  const projectNotes = notes.filter((n: any) => n.project_id === id);
  const projectGoals = goals.filter((g: any) => g.project_id === id);
  const projectTime = timeEntries.filter((t: any) => t.project_id === id);
  const totalMinutes = Math.round(projectTime.reduce((s: number, t: any) => s + (t.duration_seconds ?? 0), 0) / 60);

  const openTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <div className="max-w-3xl xl:max-w-4xl 2xl:max-w-5xl mx-auto p-8 space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: project?.color ?? "#999" }} />
          <h1 className="text-xl font-semibold">{project?.name ?? "Project"}</h1>
        </div>
        <div className="flex gap-3 mt-1 text-xs text-neutral-400">
          <Link to={`/projects/${id}`} className="hover:underline">
            Task board / list view
          </Link>
          <span>·</span>
          <span>{totalMinutes}m tracked</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <p className="text-xl font-semibold">{openTasks.length}</p>
          <p className="text-[11px] text-neutral-400">Open tasks</p>
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <p className="text-xl font-semibold">{doneTasks.length}</p>
          <p className="text-[11px] text-neutral-400">Done</p>
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <p className="text-xl font-semibold">{projectNotes.length}</p>
          <p className="text-[11px] text-neutral-400">Notes</p>
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
          <p className="text-xl font-semibold">{projectGoals.length}</p>
          <p className="text-[11px] text-neutral-400">Goals</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Open tasks</p>
        {openTasks.slice(0, 8).map((t) => (
          <div key={t.id} className="text-sm px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">
            {t.title}
          </div>
        ))}
        {openTasks.length === 0 && <p className="text-xs text-neutral-400">Nothing open.</p>}
        {openTasks.length > 8 && (
          <Link to={`/projects/${id}`} className="text-xs text-neutral-400 hover:underline">
            +{openTasks.length - 8} more →
          </Link>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Goals</p>
          <Link to="/goals" className="text-xs text-neutral-400 hover:underline">
            Manage goals →
          </Link>
        </div>
        {projectGoals.map((g: any) => (
          <div key={g.id} className="flex items-center justify-between text-sm px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <span>{g.title}</span>
            <span className="text-xs text-neutral-400">{Math.round(g.progress * 100)}%</span>
          </div>
        ))}
        {projectGoals.length === 0 && <p className="text-xs text-neutral-400">No goals linked to this project yet.</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Notes</p>
          <Link to="/notes" className="text-xs text-neutral-400 hover:underline">
            All notes →
          </Link>
        </div>
        {projectNotes.slice(0, 6).map((n: any) => (
          <div key={n.id} className="text-sm px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 truncate">
            {n.title}
          </div>
        ))}
        {projectNotes.length === 0 && <p className="text-xs text-neutral-400">No notes linked to this project yet.</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Boards</p>
          <Link to={`/boards?projectId=${id}`} className="text-xs text-neutral-400 hover:underline">
            All boards →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {boards.map((b) => (
            <Link key={b.id} to={`/boards/${b.id}`} className="text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800">
              {b.title}
            </Link>
          ))}
        </div>
        {boards.length === 0 && <p className="text-xs text-neutral-400">No boards yet for this project.</p>}
      </div>
    </div>
  );
}
