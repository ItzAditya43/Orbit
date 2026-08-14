import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

const DURATIONS = [15, 25, 45, 60];
const BREAK_MINUTES = 5;
const RADIUS = 90;
const CIRC = 2 * Math.PI * RADIUS;

type Phase = "idle" | "work" | "break" | "paused";

export default function Focus() {
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks", "today"], queryFn: () => api.tasks.list({ view: "today" }) });
  const { data: sessions = [] } = useQuery({ queryKey: ["focus-sessions"], queryFn: api.focusSessions.list });
  const [taskId, setTaskId] = useState<string>("");
  const [workMinutes, setWorkMinutes] = useState(25);
  const [phase, setPhase] = useState<Phase>("idle");
  const [secondsLeft, setSecondsLeft] = useState(workMinutes * 60);
  const [totalSeconds, setTotalSeconds] = useState(workMinutes * 60);
  const sessionIdRef = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase !== "work" && phase !== "break") return;
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
      setTotalSeconds(BREAK_MINUTES * 60);
    } else {
      setPhase("idle");
      setSecondsLeft(workMinutes * 60);
      setTotalSeconds(workMinutes * 60);
    }
  }

  const start = async () => {
    const session = await api.focusSessions.start({
      taskId: taskId || undefined,
      mode: "pomodoro",
      plannedMinutes: workMinutes,
    });
    sessionIdRef.current = session.id;
    setPhase("work");
    setSecondsLeft(workMinutes * 60);
    setTotalSeconds(workMinutes * 60);
  };

  const pause = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase("paused");
  };
  const resume = () => setPhase((p) => (p === "paused" ? "work" : p));

  const stop = async () => {
    if (sessionIdRef.current) {
      await api.focusSessions.end(sessionIdRef.current, { wasCompleted: false });
      sessionIdRef.current = null;
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase("idle");
    setSecondsLeft(workMinutes * 60);
    setTotalSeconds(workMinutes * 60);
  };

  const skipBreak = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase("idle");
    setSecondsLeft(workMinutes * 60);
    setTotalSeconds(workMinutes * 60);
  };

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  const progress = totalSeconds > 0 ? (totalSeconds - secondsLeft) / totalSeconds : 0;
  const isBreak = phase === "break";
  const ringColor = isBreak ? "#34d399" : "#171717";

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysSessions = sessions.filter((s: any) => s.was_completed && (s.started_at ?? "").slice(0, 10) === todayStr);

  return (
    <div className="max-w-md mx-auto p-8 flex flex-col items-center gap-6 pt-16">
      <h1 className="text-xl font-semibold">Focus</h1>

      {phase === "idle" && (
        <div className="w-full space-y-3">
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
          <div className="flex items-center gap-1.5 justify-center">
            {DURATIONS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setWorkMinutes(m);
                  setSecondsLeft(m * 60);
                  setTotalSeconds(m * 60);
                }}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  workMinutes === m
                    ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                    : "border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-400"
                }`}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative h-56 w-56">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="8" className="text-neutral-100 dark:text-neutral-800" />
          <circle
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-mono tabular-nums">
            {minutes}:{seconds}
          </span>
          <span className="text-xs text-neutral-400 capitalize mt-1">
            {phase === "idle" ? "Ready" : phase === "paused" ? "Paused" : isBreak ? "Break" : "Focusing"}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        {phase === "idle" && (
          <button onClick={start} className="px-5 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium">
            Start
          </button>
        )}
        {phase === "work" && (
          <>
            <button onClick={pause} className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm">
              Pause
            </button>
            <button onClick={stop} className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm text-red-500">
              Stop
            </button>
          </>
        )}
        {phase === "paused" && (
          <>
            <button onClick={resume} className="px-4 py-2 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium">
              Resume
            </button>
            <button onClick={stop} className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm text-red-500">
              Stop
            </button>
          </>
        )}
        {phase === "break" && (
          <button onClick={skipBreak} className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm">
            Skip break
          </button>
        )}
      </div>

      <div className="w-full pt-4 border-t border-neutral-100 dark:border-neutral-800">
        <p className="text-xs text-neutral-400 mb-2">{todaysSessions.length} session{todaysSessions.length === 1 ? "" : "s"} completed today</p>
        <div className="flex gap-1">
          {todaysSessions.map((_: any, i: number) => (
            <span key={i} className="h-1.5 w-5 rounded-full bg-emerald-500" />
          ))}
          {Array.from({ length: Math.max(0, 4 - todaysSessions.length) }).map((_, i) => (
            <span key={`e${i}`} className="h-1.5 w-5 rounded-full bg-neutral-100 dark:bg-neutral-800" />
          ))}
        </div>
      </div>
    </div>
  );
}
