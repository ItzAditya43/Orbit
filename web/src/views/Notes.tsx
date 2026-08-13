import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";

export default function Notes() {
  const qc = useQueryClient();
  const { data: notes = [], isLoading } = useQuery({ queryKey: ["notes"], queryFn: () => api.notes.list() });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notes"] });

  const create = async () => {
    if (!title.trim()) return;
    await api.notes.create({ title: title.trim(), body });
    setTitle("");
    setBody("");
    invalidate();
  };

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Notes</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="space-y-2"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title..."
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Markdown body..."
          rows={3}
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
        <button className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">Save note</button>
      </form>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="space-y-2">
        {notes.map((n: any) => (
          <div key={n.id} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
            <p className="text-sm font-medium">{n.title}</p>
            {n.body && <p className="text-xs text-neutral-400 whitespace-pre-wrap mt-1">{n.body}</p>}
          </div>
        ))}
        {notes.length === 0 && !isLoading && <p className="text-sm text-neutral-400">No notes yet.</p>}
      </div>
    </div>
  );
}
