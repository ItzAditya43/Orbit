import { create } from "zustand";

interface UIState {
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const stored = typeof window !== "undefined" ? (localStorage.getItem("theme") as "light" | "dark" | null) : null;
const initial = stored ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export const useUIStore = create<UIState>((set, get) => ({
  theme: initial,
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", next);
    set({ theme: next });
  },
}));
