"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { WorkItem, WorkItemStatus } from "@/lib/tasks/types";
import type { RosterMember } from "../hooks/useProjectsData";
import { useProjects } from "../hooks/useProjectsData";
import { useUpdateTask } from "../hooks/useTaskMutations";
import { OpsTaskRow } from "./OpsTaskRow";
import { tonightDateISO } from "@/lib/shiftbuilder/tasksAdapter";
import { EmptyState } from "./EmptyState";

/** Sentinel select values — a real project id / tmId is never these. */
const CLEAR_VALUE = "__none__";

function groupTasks(tasks: WorkItem[]) {
  const tonight = tonightDateISO();
  const groups = {
    overdue: [] as WorkItem[],
    tonight: [] as WorkItem[],
    upcoming: [] as WorkItem[],
    noDue: [] as WorkItem[],
    done: [] as WorkItem[],
  };
  for (const t of tasks) {
    if (t.status === "complete" || t.status === "cancelled") {
      groups.done.push(t);
    } else if (!t.dueDate) {
      groups.noDue.push(t);
    } else if (t.dueDate < tonight) {
      groups.overdue.push(t);
    } else if (t.dueDate === tonight) {
      groups.tonight.push(t);
    } else {
      groups.upcoming.push(t);
    }
  }
  return groups;
}

function Section({
  label,
  tasks,
  roster,
  onOpen,
  canComplete,
  onSetStatus,
  accent,
  selectable,
  selectedIds,
  onToggleSelect,
}: {
  label: string;
  tasks: WorkItem[];
  roster: RosterMember[];
  onOpen: (id: string) => void;
  canComplete: boolean;
  onSetStatus: (taskId: string, status: WorkItemStatus) => void;
  accent?: string;
  selectable: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (taskId: string) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span
          className="text-[10.5px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: accent ?? "var(--ios-label-tertiary)" }}
        >
          {label}
        </span>
        <span className="text-[10.5px] tabular-nums text-[var(--ios-label-quaternary)]">{tasks.length}</span>
      </div>
      <AnimatePresence initial={false} mode="popLayout">
        {tasks.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 12, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <OpsTaskRow
              task={t}
              roster={roster}
              onOpen={onOpen}
              canComplete={canComplete}
              onSetStatus={onSetStatus}
              selectable={selectable}
              selected={selectedIds.has(t.id)}
              onToggleSelect={onToggleSelect}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function TaskListView({
  tasks,
  loading,
  roster,
  onOpen,
  canComplete,
  onSetStatus,
}: {
  tasks: WorkItem[];
  loading: boolean;
  roster: RosterMember[];
  onOpen: (id: string) => void;
  canComplete: boolean;
  onSetStatus: (taskId: string, status: WorkItemStatus) => void;
}) {
  // Re-evaluate the grave-date boundary while a Projects tab remains open.
  // A stable React Query array reference must not freeze Due Tonight grouping.
  const graveDateKey = tonightDateISO();
  const groups = useMemo(() => groupTasks(tasks), [tasks, graveDateKey]);

  // --- Bulk select (state lives here, no higher) ---------------------------
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const { data: projects = [] } = useProjects();
  const updateTask = useUpdateTask();

  // Drop selections that fell out of the current task list (filter change,
  // realtime refetch) so the bar never counts invisible rows.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(tasks.map((t) => t.id));
      const next = new Set(Array.from(prev).filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tasks]);

  const toggleSelect = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const bulkComplete = () => {
    selectedIds.forEach((id) => onSetStatus(id, "complete"));
    clearSelection();
  };

  const bulkPatch = (patch: { projectId: string | null } | { assigneeTmId: string | null }) => {
    selectedIds.forEach((taskId) => updateTask.mutate({ taskId, patch }));
    clearSelection();
  };

  if (loading) {
    return (
      <div className="space-y-1.5 px-3 py-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-[var(--ios-gray-6)]" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return <EmptyState title="No tasks here" subtitle="Add one above, or check a different filter." />;
  }

  const sectionProps = {
    roster,
    onOpen,
    canComplete,
    onSetStatus,
    selectable: canComplete,
    selectedIds,
    onToggleSelect: toggleSelect,
  };

  return (
    // overflow-clip (not hidden): hidden makes the card a scroll container,
    // which would pin the sticky bulk bar to the card instead of the viewport.
    <div className="sb-projects-card divide-y divide-[var(--sb-settings-border-subtle)] overflow-clip">
      <Section label="Carried over / Overdue" tasks={groups.overdue} accent="var(--sb-projects-overdue)" {...sectionProps} />
      <Section label="Due tonight" tasks={groups.tonight} accent="var(--sb-projects-due-soon)" {...sectionProps} />
      <Section label="Upcoming" tasks={groups.upcoming} {...sectionProps} />
      <Section label="No due date" tasks={groups.noDue} {...sectionProps} />
      <Section label="Done" tasks={groups.done} accent="var(--sb-projects-done)" {...sectionProps} />

      {canComplete && selectedIds.size > 0 && (
        <div className="sb-projects-bulkbar" role="toolbar" aria-label="Bulk task actions">
          <span className="sb-projects-bulkbar-count tabular-nums">{selectedIds.size} selected</span>
          <button type="button" className="sb-projects-bulkbar-btn" onClick={bulkComplete}>
            Complete
          </button>
          <select
            aria-label="Move selected tasks to project"
            className="sb-projects-bulkbar-select"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              bulkPatch({ projectId: e.target.value === CLEAR_VALUE ? null : e.target.value });
            }}
          >
            <option value="" disabled>
              Move to project…
            </option>
            <option value={CLEAR_VALUE}>No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <select
            aria-label="Assign selected tasks to team member"
            className="sb-projects-bulkbar-select"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              bulkPatch({ assigneeTmId: e.target.value === CLEAR_VALUE ? null : e.target.value });
            }}
          >
            <option value="" disabled>
              Assign to…
            </option>
            <option value={CLEAR_VALUE}>Unassigned</option>
            {roster.map((r) => (
              <option key={r.tmId} value={r.tmId}>
                {r.name}
              </option>
            ))}
          </select>
          <button type="button" className="sb-projects-bulkbar-btn" onClick={clearSelection}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
