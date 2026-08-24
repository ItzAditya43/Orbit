import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useUIStore } from "./store";
import { useQuickAddStore } from "./quickAddStore";
import { AICommandBar } from "./components/AICommandBar";
import { QuickAddModal } from "./components/QuickAddModal";
import { TaskDetailDrawer } from "./components/TaskDetailDrawer";
import { ToastStack } from "./components/ToastStack";
import { UpdateChecker } from "./components/UpdateChecker";
import { CommandPalette } from "./components/CommandPalette";
import { NotificationCenter } from "./components/NotificationCenter";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { GlobalErrorHandler } from "./components/GlobalErrorHandler";
import { HabitNudges } from "./components/HabitNudges";
import {
  SunIcon,
  MoonIcon,
  InboxIcon,
  CalendarDaysIcon,
  FolderIcon,
  TargetIcon,
  ClockIcon,
  RocketIcon,
  RepeatIcon,
  NoteIcon,
  CompassIcon,
  ZapIcon,
  BarChartIcon,
  SearchIcon,
  PlusIcon,
  FilterIcon,
  TagIcon,
  TrashIcon,
  ChevronDownIcon,
  GridIcon,
  LayoutDashboardIcon,
  PencilIcon,
} from "./icons";
import Today from "./views/Today";
import BoardDashboard from "./views/Board";
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
import Settings from "./views/Settings";
import Review from "./views/Review";
import Filters from "./views/Filters";
import Tags from "./views/Tags";
import Trash from "./views/Trash";
import Matrix from "./views/Matrix";
import HabitMatrix from "./views/HabitMatrix";
import BoardView from "./views/BoardView";
import ProjectHub from "./views/ProjectHub";

const NAV_GROUPS = [
  {
    label: "Plan",
    items: [
      { to: "/", label: "Today", icon: SunIcon, end: true },
      { to: "/board", label: "Board", icon: LayoutDashboardIcon },
      { to: "/inbox", label: "Inbox", icon: InboxIcon },
      { to: "/upcoming", label: "Upcoming", icon: CalendarDaysIcon },
      { to: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
      { to: "/projects", label: "Projects", icon: FolderIcon },
    ],
  },
  {
    label: "Do",
    items: [
      { to: "/focus", label: "Focus", icon: TargetIcon },
      { to: "/time", label: "Time", icon: ClockIcon },
      { to: "/matrix", label: "Matrix", icon: GridIcon },
      { to: "/habit-matrix", label: "Habit Matrix", icon: GridIcon },
      { to: "/goals", label: "Goals", icon: RocketIcon },
      { to: "/habits", label: "Habits", icon: RepeatIcon },
      { to: "/notes", label: "Notes", icon: NoteIcon },
      { to: "/boards", label: "Workflow", icon: PencilIcon },
    ],
  },
  {
    label: "Reflect",
    items: [
      { to: "/boundaries", label: "Priority", icon: CompassIcon },
      { to: "/automations", label: "Automations", icon: ZapIcon },
      { to: "/analytics", label: "Analytics", icon: BarChartIcon },
      { to: "/review", label: "Review", icon: BarChartIcon },
      { to: "/filters", label: "Filters", icon: FilterIcon },
      { to: "/tags", label: "Tags", icon: TagIcon },
      { to: "/search", label: "Search", icon: SearchIcon },
      { to: "/trash", label: "Trash", icon: TrashIcon },
    ],
  },
];

function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("orbit-nav-collapsed") ?? "{}");
    } catch {
      return {};
    }
  });
  const toggle = (label: string) => {
    setCollapsed((c) => {
      const next = { ...c, [label]: !c[label] };
      localStorage.setItem("orbit-nav-collapsed", JSON.stringify(next));
      return next;
    });
  };
  return { collapsed, toggle };
}

export default function App() {
  const { theme, toggleTheme } = useUIStore();
  const { open: openQuickAdd } = useQuickAddStore();
  const location = useLocation();
  const { collapsed, toggle: toggleGroup } = useCollapsedGroups();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (!typing && e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        openQuickAdd();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openQuickAdd]);

  return (
    <div className="flex h-screen">
      <aside className="w-60 shrink-0 border-r border-neutral-200 dark:border-neutral-800 flex flex-col p-3 gap-4 overflow-y-auto bg-neutral-50/60 dark:bg-neutral-950/60">
        <div className="flex items-center gap-2 px-2 pt-1">
          <img src="/logo.png" alt="" className="h-6 w-6 rounded-md" />
          <span className="text-sm font-semibold tracking-tight">Orbit</span>
        </div>

        <button
          onClick={openQuickAdd}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium shadow-sm hover:opacity-90 transition-opacity"
        >
          <PlusIcon size={15} /> Quick add
          <span className="ml-auto text-[10px] opacity-60 font-normal">N</span>
        </button>

        <nav className="flex-1 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center gap-1 px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <ChevronDownIcon size={11} className={`transition-transform ${collapsed[group.label] ? "-rotate-90" : ""}`} />
                {group.label}
              </button>
              <div className={`space-y-0.5 ${collapsed[group.label] ? "hidden" : ""}`}>
                {group.items.map((item) => {
                  const isActive = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={`relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-white dark:bg-neutral-900 font-medium shadow-sm"
                          : "text-neutral-600 dark:text-neutral-400 hover:bg-white/60 dark:hover:bg-neutral-900/60"
                      }`}
                    >
                      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-neutral-900 dark:bg-white" />}
                      <Icon size={16} className={isActive ? "text-neutral-900 dark:text-white" : "text-neutral-400"} />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <NotificationCenter />

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm ${
              isActive ? "bg-white dark:bg-neutral-900 font-medium shadow-sm" : "text-neutral-600 dark:text-neutral-400 hover:bg-white/60 dark:hover:bg-neutral-900/60"
            }`
          }
        >
          <CompassIcon size={16} className="text-neutral-400" />
          Settings
        </NavLink>

        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left text-neutral-500 hover:bg-white/60 dark:hover:bg-neutral-900/60"
        >
          {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </aside>
      <main className="flex-1 overflow-y-auto relative">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/board" element={<BoardDashboard />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/upcoming" element={<Upcoming />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/hub" element={<ProjectHub />} />
          <Route path="/matrix" element={<Matrix />} />
          <Route path="/habit-matrix" element={<HabitMatrix />} />
          <Route path="/boards" element={<BoardView />} />
          <Route path="/boards/:id" element={<BoardView />} />
          <Route path="/focus" element={<Focus />} />
          <Route path="/time" element={<TimeTracking />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/boundaries" element={<Boundaries />} />
          <Route path="/automations" element={<Automations />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/review" element={<Review />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/filters" element={<Filters />} />
          <Route path="/tags" element={<Tags />} />
          <Route path="/trash" element={<Trash />} />
          <Route path="/search" element={<Search />} />
        </Routes>
        <AICommandBar />
      </main>
      <QuickAddModal />
      <TaskDetailDrawer />
      <ToastStack />
      <UpdateChecker />
      <CommandPalette />
      <ConnectionBanner />
      <GlobalErrorHandler />
      <HabitNudges />
    </div>
  );
}
