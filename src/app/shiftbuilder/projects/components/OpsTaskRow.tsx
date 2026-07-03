"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check, User, Repeat } from "lucide-react";
import { premiumTap } from "@/lib/premiumSpring";
import type { WorkItem } from "@/lib/tasks/types";
import { useUpdateTask } from "../hooks/useTaskMutations";
import { tonightDateISO } from "@/lib/shiftbuilder/tasksAdapter";
import type { RosterMember } from "../hooks/useProjectsData";

const PRIORITY_COLOR: Record<string, string> = {
  low: "var(--ios-label-quaternary)",
  normal: "var(--ios-label-tertiary)",
  high: "#ff9500",
  urgent: "var(--sb-projects-overdue)",
};

export function dueBadgeClass(dueDate: string | null, status: string): string {
  if (!dueDate || status === "complete" || status === "cancelled") return "";
  const tonight = tonightDateISO();
  if (dueDate < tonight) return "sb-projects-overdue-text";
  if (dueDate === tonight) return "sb-projects-due-soon-text";
  return "";
}

export function OpsTaskRow({
  task,
  roster,
  onOpen,
  canComplete,
}: {
  task: WorkItem;
  roster: RosterMember[];
  onOpen: (taskId: string) => void;
  canComplete: boolean;
}) {
  const updateTask = useUpdateTask();
  const isDone = task.status === "complete";
  const assignee = roster.find((r) => r.tmId === task.assigneeTmId);
  const dueClass = dueBadgeClass(task.dueDate, task.status);

  const toggleDone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canComplete) return;
    updateTask.mutate({ taskId: task.id, patch: { status: isDone ? "not_started" : "complete" } });
  };

  return (
    <div
      className="sb-projects-row flex cursor-pointer items-center gap-3 px-3 py-2.5"
      onClick={() => onOpen(task.id)}
    >
      <motion.button
        type="button"
        onClick={toggleDone}
        whileTap={canComplete ? premiumTap.whileTap : {}}
        disabled={!canComplete}
        className="sb-projects-checkbox shrink-0"
        data-done={isDone}
        aria-label={isDone ? "Mark not done" : "Mark done"}
      >
        {isDone && <Check size={13} strokeWidth={3} color="white" />}
      </motion.button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="truncate text-[13px] font-medium"
            style={{
              color: isDone ? "var(--ios-label-tertiary)" : "var(--ios-label)",
              textDecoration: isDone ? "line-through" : "none",
            }}
          >
            {task.title}
          </span>
          {task.workType === "recurring" && (
            <Repeat size={11} className="shrink-0 text-[var(--sb-projects-accent)]" />
          )}
        </div>
        {task.category && (
          <span className="text-[10.5px] capitalize text-[var(--ios-label-tertiary)]">
            {task.category.replace("_", " ")}
          </span>
        )}
      </div>

      {assignee && (
        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-[var(--ios-label-secondary)] sm:flex">
          <User size={11} />
          {assignee.name}
        </span>
      )}

      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: PRIORITY_COLOR[task.priority] }}
        title={`Priority: ${task.priority}`}
      />

      {task.dueDate && (
        <span className={`shrink-0 text-[11px] tabular-nums ${dueClass || "text-[var(--ios-label-tertiary)]"}`}>
          {task.dueDate === tonightDateISO() ? "Tonight" : task.dueDate}
        </span>
      )}
    </div>
  );
}
