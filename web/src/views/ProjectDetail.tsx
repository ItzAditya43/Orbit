import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { api, type Task } from "../api";
import { TaskRow } from "../components/TaskRow";
import { QuickAdd } from "../components/QuickAdd";

const COLUMNS: { status: Task["status"]; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "in_progress", label: "Doing" },
  { status: "done", label: "Done" },
];

export default function ProjectDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [view, setView] = useState<"list" | "board">("list");
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });
  const project = projects.find((p) => p.id === id);
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "project", id],
    queryFn: () => api.tasks.list({ view: "project", projectId: id! }),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const onAdd = async (title: string) => {
    await api.tasks.create({ title, projectId: id });
    invalidate();
  };
  const onToggle = async (task: Task) => {
    task.status === "done" ? await api.tasks.reopen(task.id) : await api.tasks.complete(task.id);
    invalidate();
  };
  const onDelete = async (task: Task) => {
    await api.tasks.remove(task.id);
    invalidate();
  };
  const setStatus = async (task: Task, status: Task["status"]) => {
    if (status === "done") await api.tasks.complete(task.id);
    else await api.tasks.update(task.id, { status });
    invalidate();
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <Link to="/projects" className="text-xs text-neutral-400 hover:underline">
        ← Projects
      </Link>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: project?.color ?? "#999" }} />
          <h1 className="text-xl font-semibold">{project?.name ?? "Project"}</h1>
        </div>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setView("list")}
            className={`px-2 py-1 rounded-md ${view === "list" ? "bg-neutral-200 dark:bg-neutral-800" : "text-neutral-400"}`}
          >
            List
          </button>
          <button
            onClick={() => setView("board")}
            className={`px-2 py-1 rounded-md ${view === "board" ? "bg-neutral-200 dark:bg-neutral-800" : "text-neutral-400"}`}
          >
            Board
          </button>
        </div>
      </div>
      <QuickAdd onAdd={onAdd} placeholder="Add a task to this project..." />
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}

      {view === "list" ? (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} />
          ))}
          {tasks.length === 0 && !isLoading && <p className="text-sm text-neutral-400">No tasks yet.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              className="space-y-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const taskId = e.dataTransfer.getData("text/task-id");
                const task = tasks.find((t) => t.id === taskId);
                if (task) setStatus(task, col.status);
              }}
            >
              <p className="text-xs uppercase tracking-wide text-neutral-400">{col.label}</p>
              <div className="space-y-2 min-h-24 rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 p-2">
                {tasks
                  .filter((t) => t.status === col.status)
                  .map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                      className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm cursor-move"
                    >
                      {t.title}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
