import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { EmptyState } from "../components/EmptyState";
import { NoteIcon, PinIcon, SearchIcon, TargetIcon } from "../icons";
import { useToastStore } from "../toastStore";
import { AttachmentsPanel } from "../components/AttachmentsPanel";

const COLORS = [
  { name: "default", light: "bg-white dark:bg-neutral-900", swatch: "bg-white dark:bg-neutral-900 border" },
  { name: "red", light: "bg-red-50 dark:bg-red-950/40", swatch: "bg-red-200 dark:bg-red-900" },
  { name: "amber", light: "bg-amber-50 dark:bg-amber-950/40", swatch: "bg-amber-200 dark:bg-amber-900" },
  { name: "emerald", light: "bg-emerald-50 dark:bg-emerald-950/40", swatch: "bg-emerald-200 dark:bg-emerald-900" },
  { name: "sky", light: "bg-sky-50 dark:bg-sky-950/40", swatch: "bg-sky-200 dark:bg-sky-900" },
  { name: "violet", light: "bg-violet-50 dark:bg-violet-950/40", swatch: "bg-violet-200 dark:bg-violet-900" },
  { name: "pink", light: "bg-pink-50 dark:bg-pink-950/40", swatch: "bg-pink-200 dark:bg-pink-900" },
];

function colorClass(color: string | null) {
  return COLORS.find((c) => c.name === color)?.light ?? COLORS[0].light;
}

function NoteCard({ note, invalidate }: { note: any; invalidate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const toast = useToastStore((s) => s.push);

  const save = async () => {
    setEditing(false);
    if (title !== note.title || body !== (note.body ?? "")) {
      await api.notes.update(note.id, { title, body });
      invalidate();
    }
  };

  return (
    <div
      className={`break-inside-avoid mb-3 rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 group relative hover:shadow-md transition-shadow ${colorClass(
        note.color
      )}`}
    >
      {editing ? (
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-sm font-medium outline-none"
            autoFocus
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full bg-transparent text-sm outline-none resize-none text-neutral-600 dark:text-neutral-300"
          />
          <AttachmentsPanel entityType="note" entityId={note.id} />
          <div className="flex justify-end">
            <button onClick={save} className="text-xs px-2.5 py-1 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              Done
            </button>
          </div>
        </div>
      ) : (
        <div onClick={() => setEditing(true)} className="cursor-text">
          <p className="text-sm font-medium pr-5">{note.title}</p>
          {note.body && <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 whitespace-pre-wrap">{note.body}</p>}
        </div>
      )}

      <button
        onClick={async (e) => {
          e.stopPropagation();
          await api.notes.update(note.id, { pinned: !note.pinned });
          invalidate();
        }}
        className={`absolute top-2 right-2 text-xs transition-opacity ${
          note.pinned ? "opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
        }`}
        title={note.pinned ? "Unpin" : "Pin"}
      >
        <PinIcon size={14} className={note.pinned ? "fill-current" : ""} />
      </button>

      {!editing && (
        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPickerOpen((o) => !o);
            }}
            className="h-5 w-5 rounded-full border border-neutral-300 dark:border-neutral-700"
            title="Color"
          />
          <button
            onClick={async (e) => {
              e.stopPropagation();
              await api.notes.convertToTask(note.id);
              invalidate();
              toast(`"${note.title}" converted to a task`);
            }}
            title="Convert to task"
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <TargetIcon size={13} />
          </button>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              await api.notes.remove(note.id);
              invalidate();
            }}
            className="text-xs text-neutral-400 hover:text-red-500 ml-auto"
          >
            Delete
          </button>
          {pickerOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute z-10 top-6 left-0 flex gap-1 p-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-lg animate-pop-in"
            >
              {COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={async () => {
                    await api.notes.update(note.id, { color: c.name === "default" ? "" : c.name });
                    setPickerOpen(false);
                    invalidate();
                  }}
                  className={`h-5 w-5 rounded-full ${c.swatch}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Notes() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes", search],
    queryFn: () => api.notes.list(search.trim() ? { q: search.trim() } : undefined),
  });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notes"] });

  const create = async () => {
    if (!title.trim()) return;
    await api.notes.create({ title: title.trim(), body });
    setTitle("");
    setBody("");
    setExpanded(false);
    invalidate();
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Notes</h1>
        <div className="relative w-56">
          <SearchIcon size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 outline-none"
          />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 bg-white dark:bg-neutral-900 shadow-sm max-w-md"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setExpanded(true)}
          placeholder="Take a note..."
          className="w-full bg-transparent text-sm font-medium outline-none"
        />
        {expanded && (
          <>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Details..."
              rows={3}
              className="w-full bg-transparent text-sm outline-none resize-none mt-2 text-neutral-600 dark:text-neutral-300"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  setTitle("");
                  setBody("");
                }}
                className="text-xs px-2.5 py-1 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button type="submit" className="text-xs px-2.5 py-1 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                Save
              </button>
            </div>
          </>
        )}
      </form>

      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      {notes.length === 0 && !isLoading ? (
        <EmptyState
          icon={NoteIcon}
          title={search ? "No matching notes" : "No notes yet"}
          subtitle={search ? "Try a different search term." : "Jot down an idea, meeting notes, or anything worth keeping."}
        />
      ) : (
        <div className="columns-1 sm:columns-2 md:columns-3 gap-3">
          {notes.map((n: any) => (
            <NoteCard key={n.id} note={n} invalidate={invalidate} />
          ))}
        </div>
      )}
    </div>
  );
}
