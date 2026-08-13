import { useEffect } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { useUIStore } from "./store";
import { AICommandBar } from "./components/AICommandBar";
import Today from "./views/Today";
import Inbox from "./views/Inbox";
import Upcoming from "./views/Upcoming";
import Projects from "./views/Projects";
import ProjectDetail from "./views/ProjectDetail";
import Focus from "./views/Focus";
import Search from "./views/Search";
import Calendar from "./views/Calendar";
import TimeTracking from "./views/TimeTracking";
import Analytics from "./views/Analytics";
import Goals from "./views/Goals";
import Habits from "./views/Habits";
import Notes from "./views/Notes";
import Boundaries from "./views/Boundaries";
import Automations from "./views/Automations";

const NAV = [
  { to: "/", label: "Today", end: true },
  { to: "/inbox", label: "Inbox" },
  { to: "/upcoming", label: "Upcoming" },
  { to: "/calendar", label: "Calendar" },
  { to: "/projects", label: "Projects" },
  { to: "/focus", label: "Focus" },
  { to: "/time", label: "Time" },
  { to: "/goals", label: "Goals" },
  { to: "/habits", label: "Habits" },
  { to: "/notes", label: "Notes" },
  { to: "/boundaries", label: "Rigid" },
  { to: "/automations", label: "Automations" },
  { to: "/analytics", label: "Analytics" },
  { to: "/search", label: "Search" },
];

export default function App() {
  const { theme, toggleTheme } = useUIStore();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="flex h-screen">
      <aside className="w-56 shrink-0 border-r border-neutral-200 dark:border-neutral-800 flex flex-col p-4 gap-1 overflow-y-auto">
        <div className="flex items-center gap-2 mb-4 px-2">
          <img src="/logo.png" alt="" className="h-5 w-5 rounded" />
          <span className="text-sm font-semibold">Orbit</span>
        </div>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `px-2 py-1.5 rounded-md text-sm ${
                isActive
                  ? "bg-neutral-200 dark:bg-neutral-800 font-medium"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
        <div className="flex-1" />
        <button
          onClick={toggleTheme}
          className="px-2 py-1.5 rounded-md text-sm text-left text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          {theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
        </button>
      </aside>
      <main className="flex-1 overflow-y-auto relative">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/upcoming" element={<Upcoming />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/focus" element={<Focus />} />
          <Route path="/time" element={<TimeTracking />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/boundaries" element={<Boundaries />} />
          <Route path="/automations" element={<Automations />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/search" element={<Search />} />
        </Routes>
        <AICommandBar />
      </main>
    </div>
  );
}
