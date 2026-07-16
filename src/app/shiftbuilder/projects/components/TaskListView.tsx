"use client";

import React, { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { WorkItem, WorkItemStatus } from "@/lib/tasks/types";
import type { RosterMember } from "../hooks/useProjectsData";
import { OpsTaskRow } from "./OpsTaskRow";
import { tonightDateISO } from "@/lib/shiftbuilder/tasksAdapter";
import { EmptyState } from "./EmptyState";

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
}: {
  label: string;
  tasks: WorkItem[];
  roster: RosterMember[];
  onOpen: (id: string) => void;
  canComplete: boolean;
  onSetStatus: (taskId: string, status: WorkItemStatus) => void;
  accent?: string;
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

  return (
    <div className="sb-projects-card divide-y divide-[var(--sb-settings-border-subtle)] overflow-hidden">
      <Section
        label="Carried over / Overdue"
        tasks={groups.overdue}
        roster={roster}
        onOpen={onOpen}
        canComplete={canComplete}
        onSetStatus={onSetStatus}
        accent="var(--sb-projects-overdue)"
      />
      <Section
        label="Due tonight"
        tasks={groups.tonight}
        roster={roster}
        onOpen={onOpen}
        canComplete={canComplete}
        onSetStatus={onSetStatus}
        accent="var(--sb-projects-due-soon)"
      />
      <Section
        label="Upcoming"
        tasks={groups.upcoming}
        roster={roster}
        onOpen={onOpen}
        canComplete={canComplete}
        onSetStatus={onSetStatus}
      />
      <Section
        label="No due date"
        tasks={groups.noDue}
        roster={roster}
        onOpen={onOpen}
        canComplete={canComplete}
        onSetStatus={onSetStatus}
      />
      <Section
        label="Done"
        tasks={groups.done}
        roster={roster}
        onOpen={onOpen}
        canComplete={canComplete}
        onSetStatus={onSetStatus}
        accent="var(--sb-projects-done)"
      />
    </div>
  );
}
