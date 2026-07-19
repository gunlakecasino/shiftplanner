"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Target } from "lucide-react";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { PostPinRouteGuard } from "../components/PostPinRouteGuard";
import { BuilderLoadingShell } from "../components/builderPrimitives";
import { useTheme } from "../hooks/useTheme";
import { useProjects, useTasks, useRoster } from "./hooks/useProjectsData";
import { useProjectsRealtime } from "./hooks/useProjectsRealtime";
import { useUpdateTask } from "./hooks/useTaskMutations";
import type { WorkItemStatus } from "@/lib/tasks/types";
import { tonightDateISO } from "@/lib/shiftbuilder/tasksAdapter";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { TaskQuickAdd } from "./components/TaskQuickAdd";
import { TaskFilterBar, type BoardView, type SmartFilter } from "./components/TaskFilterBar";
import { TaskListView } from "./components/TaskListView";
import { TaskBoardView } from "./components/TaskBoardView";
import { TaskCalendarView } from "./components/TaskCalendarView";
import { RecurringView } from "./components/RecurringView";
import { PoolsView } from "./components/PoolsView";
import { DefaultsView } from "./components/DefaultsView";
import { TaskDetailSheet } from "./components/TaskDetailSheet";
import { PendingRequestsPanel } from "./components/PendingRequestsPanel";
import "../settings/settingsShell.css";
import "../settings/settingsTheme.css";
import "./projectsShell.css";

function applySmartFilter(tasks: ReturnType<typeof useTasks>["data"], filter: SmartFilter) {
  if (!tasks) return [];
  const tonight = tonightDateISO();
  switch (filter) {
    case "open":
      return tasks.filter((t) => t.status !== "complete" && t.status !== "cancelled");
    case "overdue":
      return tasks.filter(
        (t) => t.dueDate && t.dueDate < tonight && t.status !== "complete" && t.status !== "cancelled",
      );
    case "tonight":
      return tasks.filter((t) => t.dueDate === tonight && t.status !== "complete" && t.status !== "cancelled");
    case "complete":
      return tasks.filter((t) => t.status === "complete");
    case "my-floor":
      // Brian-exclusive: floor observations, MPulse, walk notes (demo via category/notes)
      return tasks.filter((t) => t.category === "maintenance" || t.category === "guest_experience" || (t.notes && t.notes.toLowerCase().includes("floor")));
    case "from-recap":
      // From recaps / email archivist (demo via notes or future source tag)
      return tasks.filter((t) => t.notes && (t.notes.toLowerCase().includes("recap") || t.notes.toLowerCase().includes("huddle") || t.notes.toLowerCase().includes("mpulse")));
    case "staffing":
      return tasks.filter((t) => t.category === "other" || (t.title && t.title.toLowerCase().includes("staff")));
    case "compliance":
      return tasks.filter((t) => t.category === "compliance" || t.category === "training");
    case "all":
    default:
      return tasks;
  }
}

// --- URL-persisted view state (?view=board&filter=overdue&project=<id>) ------
// Defaults stay out of the URL; unknown values fall back to the default.

const DEFAULT_VIEW: BoardView = "list";
const DEFAULT_FILTER: SmartFilter = "open";

const VIEW_VALUES: readonly BoardView[] = ["list", "board", "calendar", "recurring", "pools", "defaults", "planner"];
const FILTER_VALUES: readonly SmartFilter[] = ["all", "open", "overdue", "tonight", "complete", "my-floor", "from-recap", "staffing", "compliance"];

function parseView(raw: string | null): BoardView {
  return raw && (VIEW_VALUES as readonly string[]).includes(raw) ? (raw as BoardView) : DEFAULT_VIEW;
}

function parseFilter(raw: string | null): SmartFilter {
  return raw && (FILTER_VALUES as readonly string[]).includes(raw) ? (raw as SmartFilter) : DEFAULT_FILTER;
}

function ProjectsGate() {
  const router = useRouter();
  const { permissions, isLoading } = useOpsAuth();
  const canAccessTasks = permissions?.canAccessTasks ?? false;

  useEffect(() => {
    if (!isLoading && !canAccessTasks) {
      router.replace("/sheetbuilder");
    }
  }, [isLoading, canAccessTasks, router]);

  if (!canAccessTasks) {
    return <BuilderLoadingShell label="REDIRECTING" sublabel="Projects & Tasks access required" />;
  }

  return (
    <PostPinRouteGuard>
      <ProjectsShell />
    </PostPinRouteGuard>
  );
}

function ProjectsShell() {
  const router = useRouter();
  useTheme();
  const { permissions } = useOpsAuth();
  const canManage = permissions?.canManageTasks ?? false;
  const canComplete = canManage || (permissions?.canCompleteOwnTasks ?? false);

  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => searchParams.get("project"));
  const [smartFilter, setSmartFilter] = useState<SmartFilter>(() => parseFilter(searchParams.get("filter")));
  const [view, setView] = useState<BoardView>(() => parseView(searchParams.get("view")));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useProjectsRealtime();

  // Mirror view state to the URL so a reload / shared link restores the console.
  // Defaults are deleted rather than written; replace (not push) keeps history clean.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const setOrDelete = (key: string, value: string | null) =>
      value ? sp.set(key, value) : sp.delete(key);
    setOrDelete("view", view === DEFAULT_VIEW ? null : view);
    setOrDelete("filter", smartFilter === DEFAULT_FILTER ? null : smartFilter);
    setOrDelete("project", selectedProjectId);
    const next = sp.toString();
    if (next !== searchParams.toString()) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [view, smartFilter, selectedProjectId, pathname, router, searchParams]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: tasks = [], isLoading: tasksLoading } = useTasks({
    projectId: selectedProjectId,
    workType: "task",
  });
  const { data: roster = [] } = useRoster();

  // Hoisted here (a stable mount) so completing a task — which filters its row
  // out of the current view — can't unmount the mutation observer mid-flight.
  const updateTask = useUpdateTask();
  const handleSetStatus = useCallback(
    (taskId: string, status: WorkItemStatus, statusReason?: string) => {
      updateTask.mutate({ taskId, patch: statusReason ? { status, statusReason } : { status } });
    },
    [updateTask],
  );

  const filteredTasks = useMemo(() => applySmartFilter(tasks, smartFilter), [tasks, smartFilter, now]);

  const overdueCount = useMemo(() => {
    const tonight = tonightDateISO();
    return tasks.filter((t) => t.dueDate && t.dueDate < tonight && t.status !== "complete" && t.status !== "cancelled")
      .length;
  }, [tasks, now]);

  const formattedDate = `${now.toLocaleString("en-US", { month: "long" })} ${now.getDate()}, ${now.getFullYear()}`;
  const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="sb-settings-shell sb-projects-shell sb-content-enter">
      <div className="sb-settings-grid" aria-hidden />

      <header className="sb-settings-status">
        <div className="flex items-center gap-3">
          <span className="sb-settings-status-brand">GLCR</span>
          <span className="sb-settings-status-divider" aria-hidden />
          <span>PROJECTS &amp; TASKS</span>
          {overdueCount > 0 && (
            <span className="sb-projects-pill" style={{ color: "var(--sb-projects-overdue)", borderColor: "var(--sb-projects-overdue)" }}>
              {overdueCount} overdue
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 tabular-nums">
          <span>{formattedDate}</span>
          <span>{timeString}</span>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-6 pb-14 pt-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="sb-settings-eyebrow">OMS OPERATIONS</p>
            <h1 className="sb-settings-hero-title">Projects</h1>
            <p className="sb-settings-hero-sub">
              The brain behind the board — standing tasks, one-off work, and projects, tracked to completion.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/sheetbuilder")}
            className="sb-settings-back-btn sb-interactive"
          >
            <ArrowLeft size={15} strokeWidth={2.25} />
            SheetBuilder
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-220px)]">
            <ProjectSidebar
              projects={projects}
              loading={projectsLoading}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              canManage={canManage}
            />
          </aside>

          <main className="min-w-0 space-y-3">
            <PendingRequestsPanel canManage={canManage} />
            {(view === "list" || view === "board") && (
              <TaskQuickAdd projectId={selectedProjectId} projects={projects} canManage={canManage} />
            )}
            <TaskFilterBar
              smartFilter={smartFilter}
              onSmartFilterChange={setSmartFilter}
              view={view}
              onViewChange={setView}
              overdueCount={overdueCount}
            />
            {view === "list" && (
              <TaskListView
                tasks={filteredTasks ?? []}
                loading={tasksLoading}
                roster={roster}
                onOpen={setSelectedTaskId}
                canComplete={canComplete}
                onSetStatus={handleSetStatus}
              />
            )}
            {view === "board" && (
              <TaskBoardView
                tasks={filteredTasks ?? []}
                roster={roster}
                onOpen={setSelectedTaskId}
                onSetStatus={handleSetStatus}
              />
            )}
            {view === "calendar" && (
              <TaskCalendarView tasks={tasks} onOpen={setSelectedTaskId} />
            )}
            {view === "recurring" && (
              <RecurringView
                selectedProjectId={selectedProjectId}
                projects={projects}
                canManage={canManage}
              />
            )}
            {view === "pools" && <PoolsView canManage={canManage} />}
            {view === "defaults" && <DefaultsView canManage={canManage} />}
            {view === "planner" && (
              <div className="space-y-4">
                <div className="rounded-2xl border p-4" style={{ background: "var(--ios-background-secondary)" }}>
                  <h3 className="text-[13px] font-semibold mb-2 flex items-center gap-2" style={{ color: "var(--sb-projects-accent)" }}>
                    <Target size={14} /> Brian's Personal Grave Planner (exclusive to your flow)
                  </h3>
                  <p className="text-[12px] text-muted-foreground mb-3">
                    Built exclusively for how you function: LOG real-time (voice/notes during graves → structured with your sections), COMPILE to your exact recap template + personal AAR/debrief (voice-calibrated, 3-5 prose), hybrid (hard rules first + judgment). Shift-anchored. Provenance from recaps/email/captures. Calm, power, speed.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        const entry = prompt("LOG / Voice capture (e.g. 'Z8 floor walk: MPulse addressed, Alex training note, 2 call-outs')");
                        if (entry) {
                          alert(`Captured as shift_log entry (would parse to tasks/notes in glcr_memory + create ops_work_item with your metadata + source).`);
                        }
                      }}
                      className="text-xs px-3 py-1.5 rounded" style={{ background: "var(--sb-projects-accent)", color: "white" }}
                    >
                      Voice / LOG Capture
                    </button>
                    <button
                      onClick={() => {
                        const debrief = `Grave Shift Personal Planner Debrief\nDate: ${formattedDate}\n\nTeam / Staffing:\n${filteredTasks.filter(t => (t.title || '').toLowerCase().includes('staff') || t.category === 'other').map(t => `- ${t.title} (${t.status})`).join('\n') || 'As per log.'}\n\nFloor & Incidents (MPulse, walks):\n${filteredTasks.filter(t => t.category === 'maintenance' || (t.notes || '').toLowerCase().includes('floor') || (t.notes || '').toLowerCase().includes('mpulse')).map(t => `- ${t.title}: ${t.notes || t.description || ''}`).join('\n') || 'None.'}\n\nHuddle / Training / Compliance:\n${filteredTasks.filter(t => t.category === 'compliance' || t.category === 'training' || (t.notes || '').toLowerCase().includes('huddle')).map(t => `- ${t.title}`).join('\n') || 'Logged.'}\n\nOpen Next Actions (your GTD runway):\n${filteredTasks.filter(t => t.status !== 'complete' && t.status !== 'cancelled').slice(0,5).map(t => `- ${t.title} (due ${t.dueDate || 'tonight'})`).join('\n')}\n\nAll things considered, the Team handled it. (Your voice: calm, factual, action-oriented. Use brian-voice for exact. Separate patterns for supervisor.)`;
                        alert(debrief + "\n\n(Copy-paste ready. Full system: hook to glcr COMPILE + brian-voice + auto task creation from recaps.)");
                      }}
                      className="text-xs px-3 py-1.5 rounded border"
                    >
                      Synthesize Personal Debrief (your COMPILE + voice)
                    </button>
                  </div>
                  <div className="mt-2 text-[10px] opacity-70">Pre-shift brief (prior + open). During: voice everything. Post: debrief. Weekly: patterns + review. Uses your existing recaps/email archivist for auto-tasks.</div>
                </div>
                <TaskListView
                  tasks={filteredTasks ?? []}
                  loading={tasksLoading}
                  roster={roster}
                  onOpen={setSelectedTaskId}
                  canComplete={canComplete}
                  onSetStatus={handleSetStatus}
                />
              </div>
            )}
          </main>
        </div>
      </div>

      <TaskDetailSheet
        taskId={selectedTaskId}
        projects={projects}
        canManage={canManage}
        canComplete={canComplete}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}

export default function ProjectsClient() {
  return <ProjectsGate />;
}
