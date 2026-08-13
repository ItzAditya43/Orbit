import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

const WORK_MINUTES = 25;
const BREAK_MINUTES = 5;

type Phase = "idle" | "work" | "break";

export default function Focus() {
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks", "today"], queryFn: () => api.tasks.list({ view: "today" }) });
  const [taskId, setTaskId] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [secondsLeft, setSecondsLeft] = useState(WORK_MINUTES * 60);
  const sessionIdRef = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase === "idle") return;
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          handlePhaseComplete();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function handlePhaseComplete() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (phase === "work" && sessionIdRef.current) {
      await api.focusSessions.end(sessionIdRef.current, { wasCompleted: true });
      sessionIdRef.current = null;
      setPhase("break");
      setSecondsLeft(BREAK_MINUTES * 60);
    } else {
      setPhase("idle");
      setSecondsLeft(WORK_MINUTES * 60);
    }
  }

  const start = async () => {
    const session = await api.focusSessions.start({
      taskId: taskId || undefined,
      mode: "pomodoro",
      plannedMinutes: WORK_MINUTES,
    });
    sessionIdRef.current = session.id;
    setPhase("work");
    setSecondsLeft(WORK_MINUTES * 60);
  };

  const stop = async () => {
    if (sessionIdRef.current) {
      await api.focusSessions.end(sessionIdRef.current, { wasCompleted: false });
      sessionIdRef.current = null;
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase("idle");
    setSecondsLeft(WORK_MINUTES * 60);
  };

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="max-w-md mx-auto p-8 flex flex-col items-center gap-6 pt-24">
      <h1 className="text-xl font-semibold">Focus</h1>
      {phase === "idle" && (
        <select
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        >
          <option value="">No linked task</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      )}
      <div className="text-6xl font-mono tabular-nums">
        {minutes}:{seconds}
      </div>
      <p className="text-sm text-neutral-400 capitalize">{phase === "idle" ? "Ready" : phase}</p>
      <div className="flex gap-3">
        {phase === "idle" ? (
          <button onClick={start} className="px-4 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm">
            Start Pomodoro
          </button>
        ) : (
          <button onClick={stop} className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm">
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
