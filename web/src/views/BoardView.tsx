import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Board, type BoardElement } from "../api";
import { ImageIcon, PencilIcon, PlusIcon, TrashIcon, CircleCheckIcon } from "../icons";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const CANVAS_W = 3000;
const CANVAS_H = 2000;
const SKETCH_COLORS = ["#111827", "#ef4444", "#3b82f6", "#10b981", "#f59e0b"];

function BoardList() {
  const [params] = useSearchParams();
  const projectId = params.get("projectId") ?? undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: boards = [], isLoading } = useQuery({ queryKey: ["boards", projectId ?? "all"], queryFn: () => api.boards.list(projectId) });
  const [title, setTitle] = useState("");

  const create = async () => {
    if (!title.trim()) return;
    const board = await api.boards.create({ title: title.trim(), projectId });
    setTitle("");
    qc.invalidateQueries({ queryKey: ["boards"] });
    navigate(`/boards/${board.id}`);
  };

  const remove = async (id: string) => {
    await api.boards.remove(id);
    qc.invalidateQueries({ queryKey: ["boards"] });
  };

  return (
    <div className="max-w-3xl xl:max-w-4xl 2xl:max-w-5xl mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Workflow</h1>
      <p className="text-sm text-neutral-400">
        A freeform canvas per project (or standalone) — sketch things out, drop in images, link in tasks, jot notes anywhere.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
        className="flex gap-2 max-w-md"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New workflow name..."
          className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
        <button className="px-3 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">Create</button>
      </form>
      {isLoading && <p className="text-sm text-neutral-400">Loading...</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {boards.map((b) => (
          <div key={b.id} className="relative group">
            <Link
              to={`/boards/${b.id}`}
              className="block rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 hover:shadow-md transition-shadow"
            >
              <p className="text-sm font-medium pr-5">{b.title}</p>
              <p className="text-xs text-neutral-400 mt-1">{b.elements.length} item{b.elements.length === 1 ? "" : "s"}</p>
            </Link>
            <button
              onClick={(e) => {
                e.preventDefault();
                if (confirm(`Delete "${b.title}"? This can't be undone.`)) remove(b.id);
              }}
              className="absolute top-3 right-3 text-neutral-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete workflow"
            >
              <TrashIcon size={14} />
            </button>
          </div>
        ))}
        {boards.length === 0 && !isLoading && <p className="text-sm text-neutral-400">No workflows yet — create one above.</p>}
      </div>
    </div>
  );
}

// Pulls the live task from the API rather than freezing a copy of the title/status at the
// moment it was dropped onto the board — the whole point of linking a task in is that this
// card reflects reality (complete it elsewhere, it shows done here too) instead of drifting.
function TaskElementView({
  el,
  selected,
  onSelect,
}: {
  el: Extract<BoardElement, { type: "task" }>;
  selected: boolean;
  onSelect: () => void;
}) {
  const qc = useQueryClient();
  const { data: task } = useQuery({ queryKey: ["tasks", "detail", el.taskId], queryFn: () => api.tasks.get(el.taskId) });
  const toggle = async () => {
    if (!task) return;
    if (task.status === "done") await api.tasks.reopen(task.id);
    else await api.tasks.complete(task.id);
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };
  return (
    <div
      onMouseDown={(e) => {
        onSelect();
        e.stopPropagation();
      }}
      className={`flex items-center gap-2 w-full h-full bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 rounded-md p-2 text-sm shadow-sm ${
        selected ? "ring-2 ring-neutral-500" : ""
      }`}
    >
      {task ? (
        <>
          <button onClick={toggle} className="shrink-0">
            <CircleCheckIcon size={16} className={task.status === "done" ? "text-emerald-500" : "text-neutral-300 dark:text-neutral-700"} />
          </button>
          <span className={`truncate ${task.status === "done" ? "line-through text-neutral-400" : ""}`}>{task.title}</span>
        </>
      ) : (
        <span className="text-neutral-400">Loading task...</span>
      )}
    </div>
  );
}

function TextElementView({
  el,
  selected,
  onSelect,
  onChange,
}: {
  el: Extract<BoardElement, { type: "text" }>;
  selected: boolean;
  onSelect: () => void;
  onChange: (text: string) => void;
}) {
  return (
    <textarea
      value={el.text}
      onChange={(e) => onChange(e.target.value)}
      onMouseDown={(e) => {
        onSelect();
        e.stopPropagation();
      }}
      className={`resize-none w-full h-full bg-yellow-100 dark:bg-yellow-900/40 rounded-md p-2 text-sm outline-none shadow-sm ${
        selected ? "ring-2 ring-neutral-500" : ""
      }`}
      style={{ color: el.color }}
    />
  );
}

function BoardCanvas({ board }: { board: Board }) {
  const qc = useQueryClient();
  const [elements, setElements] = useState<BoardElement[]>(board.elements);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "sketch">("select");
  const [sketchColor, setSketchColor] = useState(SKETCH_COLORS[0]);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const drawingRef = useRef<{ points: number[][] } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setElements(board.elements), [board.id]);

  const persist = (next: BoardElement[]) => {
    setElements(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.boards.update(board.id, { elements: next });
      qc.invalidateQueries({ queryKey: ["boards"] });
    }, 500);
  };

  const canvasPoint = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const scrollLeft = containerRef.current!.scrollLeft;
    const scrollTop = containerRef.current!.scrollTop;
    return { x: clientX - rect.left + scrollLeft, y: clientY - rect.top + scrollTop };
  };

  // New elements are staggered by how many non-sketch elements already exist, so pasting or
  // adding several things in a row doesn't stack them exactly on top of each other at a fixed
  // default position.
  const nextSpawnPoint = () => {
    const count = elements.filter((e) => e.type !== "sketch").length;
    const offset = (count % 8) * 30;
    return { x: 100 + offset, y: 100 + offset };
  };

  const addText = () => {
    const { x, y } = nextSpawnPoint();
    const el: BoardElement = { id: uid(), type: "text", x, y, w: 200, h: 120, text: "" };
    persist([...elements, el]);
    setSelectedId(el.id);
  };

  const addImageFromDataUrl = async (dataUrl: string) => {
    const { x, y } = nextSpawnPoint();
    const attachment = await api.attachments.upload({ dataUrl, entityType: "board", entityId: board.id });
    const el: BoardElement = { id: uid(), type: "image", x, y, w: 220, h: 160, attachmentId: attachment.id };
    persist([...elements, el]);
  };

  const addTask = (taskId: string) => {
    const { x, y } = nextSpawnPoint();
    const el: BoardElement = { id: uid(), type: "task", x, y, w: 220, h: 60, taskId };
    persist([...elements, el]);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    persist(elements.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  };

  const navigate = useNavigate();
  const deleteBoard = async () => {
    if (!confirm(`Delete "${board.title}"? This can't be undone.`)) return;
    await api.boards.remove(board.id);
    qc.invalidateQueries({ queryKey: ["boards"] });
    navigate("/boards");
  };

  const { data: allTasks = [] } = useQuery({ queryKey: ["tasks", "status", "open"], queryFn: () => api.tasks.list({ status: "open" }) });
  const linkedTaskIds = new Set(elements.filter((e) => e.type === "task").map((e: any) => e.taskId));
  const linkableTasks = allTasks.filter((t) => !linkedTaskIds.has(t.id));

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="flex items-center gap-2 p-3 border-b border-neutral-200 dark:border-neutral-800">
        <Link to="/boards" className="text-sm text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          ← Workflow
        </Link>
        <span className="text-sm font-medium ml-2">{board.title}</span>
        <div className="flex items-center gap-1 ml-6">
          <button
            onClick={() => setMode("select")}
            className={`text-xs px-2 py-1 rounded-md ${mode === "select" ? "bg-neutral-200 dark:bg-neutral-800" : "text-neutral-400"}`}
          >
            Select
          </button>
          <button
            onClick={() => setMode("sketch")}
            className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 ${mode === "sketch" ? "bg-neutral-200 dark:bg-neutral-800" : "text-neutral-400"}`}
          >
            <PencilIcon size={12} /> Sketch
          </button>
          {mode === "sketch" && (
            <div className="flex items-center gap-1 ml-1">
              {SKETCH_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setSketchColor(c)}
                  className={`h-4 w-4 rounded-full ${sketchColor === c ? "ring-2 ring-offset-1 ring-neutral-400" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          )}
        </div>
        <button onClick={addText} className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 flex items-center gap-1 ml-4">
          <PlusIcon size={12} /> Text
        </button>
        <label className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 flex items-center gap-1 cursor-pointer">
          <ImageIcon size={12} /> Image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) addImageFromDataUrl(await fileToDataUrl(file));
              e.target.value = "";
            }}
          />
        </label>
        {linkableTasks.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addTask(e.target.value);
            }}
            className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800"
          >
            <option value="">+ Link task...</option>
            {linkableTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}
        {selectedId && (
          <button onClick={removeSelected} className="text-xs px-2 py-1 rounded-md text-red-500 flex items-center gap-1 ml-2">
            <TrashIcon size={12} /> Delete
          </button>
        )}
        <span className="text-[11px] text-neutral-400 ml-auto">Paste (Ctrl+V) an image anywhere on the board</span>
        <button onClick={deleteBoard} className="text-xs px-2 py-1 rounded-md text-red-500 flex items-center gap-1">
          <TrashIcon size={12} /> Delete workflow
        </button>
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        onPaste={async (e) => {
          const items = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith("image/"));
          if (items.length === 0) return;
          e.preventDefault();
          for (const item of items) {
            const file = item.getAsFile();
            if (file) addImageFromDataUrl(await fileToDataUrl(file));
          }
        }}
        onMouseDown={(e) => {
          if (mode !== "sketch") {
            if (e.target === containerRef.current) setSelectedId(null);
            return;
          }
          const p = canvasPoint(e.clientX, e.clientY);
          drawingRef.current = { points: [[p.x, p.y]] };
        }}
        onMouseMove={(e) => {
          if (mode === "sketch" && drawingRef.current) {
            const p = canvasPoint(e.clientX, e.clientY);
            drawingRef.current.points.push([p.x, p.y]);
            // Force a re-render by touching state minimally via a ref-driven overlay redraw.
            const overlay = containerRef.current?.querySelector<SVGPolylineElement>("#live-stroke");
            if (overlay) overlay.setAttribute("points", drawingRef.current.points.map((pt) => pt.join(",")).join(" "));
          }
          if (dragRef.current) {
            const p = canvasPoint(e.clientX, e.clientY);
            const { id, offsetX, offsetY } = dragRef.current;
            setElements((els) => els.map((el) => (el.id === id ? { ...el, x: p.x - offsetX, y: p.y - offsetY } : el)));
          }
        }}
        onMouseUp={() => {
          if (mode === "sketch" && drawingRef.current) {
            const pts = drawingRef.current.points;
            drawingRef.current = null;
            if (pts.length > 1) {
              const xs = pts.map((p) => p[0]);
              const ys = pts.map((p) => p[1]);
              const minX = Math.min(...xs);
              const minY = Math.min(...ys);
              const el: BoardElement = {
                id: uid(),
                type: "sketch",
                x: minX,
                y: minY,
                w: Math.max(...xs) - minX,
                h: Math.max(...ys) - minY,
                points: pts.map(([x, y]) => [x - minX, y - minY]),
                color: sketchColor,
                strokeWidth: 2.5,
              };
              persist([...elements, el]);
            }
          }
          if (dragRef.current) {
            persist(elements);
            dragRef.current = null;
          }
        }}
        className="flex-1 overflow-auto relative bg-neutral-50 dark:bg-neutral-950"
        style={{ cursor: mode === "sketch" ? "crosshair" : "default" }}
      >
        <div style={{ width: CANVAS_W, height: CANVAS_H, position: "relative" }}>
          <svg width={CANVAS_W} height={CANVAS_H} className="absolute inset-0 pointer-events-none">
            <polyline id="live-stroke" points="" fill="none" stroke={sketchColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {elements
              .filter((e): e is Extract<BoardElement, { type: "sketch" }> => e.type === "sketch")
              .map((e) => (
                <polyline
                  key={e.id}
                  points={e.points.map(([px, py]) => `${px + e.x},${py + e.y}`).join(" ")}
                  fill="none"
                  stroke={e.color}
                  strokeWidth={e.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
          </svg>
          {elements
            .filter((e) => e.type !== "sketch")
            .map((el) => (
              <div
                key={el.id}
                onMouseDown={(e) => {
                  if (mode === "sketch") return;
                  const p = canvasPoint(e.clientX, e.clientY);
                  dragRef.current = { id: el.id, offsetX: p.x - el.x, offsetY: p.y - el.y };
                  setSelectedId(el.id);
                  e.stopPropagation();
                }}
                style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h }}
              >
                {el.type === "text" && (
                  <TextElementView
                    el={el}
                    selected={selectedId === el.id}
                    onSelect={() => setSelectedId(el.id)}
                    onChange={(text) => persist(elements.map((e) => (e.id === el.id ? { ...e, text } : e)))}
                  />
                )}
                {el.type === "image" && (
                  <img
                    src={api.attachments.rawUrl(el.attachmentId)}
                    draggable={false}
                    className={`w-full h-full object-cover rounded-md shadow-sm ${selectedId === el.id ? "ring-2 ring-neutral-500" : ""}`}
                  />
                )}
                {el.type === "task" && (
                  <TaskElementView el={el} selected={selectedId === el.id} onSelect={() => setSelectedId(el.id)} />
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default function BoardView() {
  const { id } = useParams();
  const { data: board } = useQuery({ queryKey: ["boards", id], queryFn: () => api.boards.get(id!), enabled: !!id });

  if (!id) return <BoardList />;
  if (!board) return <div className="p-8 text-sm text-neutral-400">Loading...</div>;
  return <BoardCanvas key={board.id} board={board} />;
}
