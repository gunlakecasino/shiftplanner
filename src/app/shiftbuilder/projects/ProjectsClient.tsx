"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { PostPinRouteGuard } from "../components/PostPinRouteGuard";
import { BuilderLoadingShell } from "../components/builderPrimitives";
import { useTheme } from "../hooks/useTheme";
import { useProjects, useTasks, useRoster } from "./hooks/useProjectsData";
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
import { TaskDetailSheet } from "./components/TaskDetailSheet";
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
    case "all":
    default:
      return tasks;
  }
}

function ProjectsGate() {
  const router = useRouter();
  const { permissions, isLoading } = useOpsAuth();
  const canAccessTasks = permissions?.canAccessTasks ?? false;

  useEffect(() => {
    if (!isLoading && !canAccessTasks) {
      router.replace("/shiftbuilder");
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

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [smartFilter, setSmartFilter] = useState<SmartFilter>("open");
  const [view, setView] = useState<BoardView>("list");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

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

  const filteredTasks = useMemo(() => applySmartFilter(tasks, smartFilter), [tasks, smartFilter]);

  const overdueCount = useMemo(() => {
    const tonight = tonightDateISO();
    return tasks.filter((t) => t.dueDate && t.dueDate < tonight && t.status !== "complete" && t.status !== "cancelled")
      .length;
  }, [tasks]);

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
            onClick={() => router.push("/shiftbuilder")}
            className="sb-settings-back-btn sb-interactive"
          >
            <ArrowLeft size={15} strokeWidth={2.25} />
            Shift Builder
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
            {view !== "recurring" && (
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
