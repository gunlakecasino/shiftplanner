"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check, User, Repeat, MapPin } from "lucide-react";
import { slotCatalogLabel } from "@/lib/shiftbuilder/slotCatalog";
import { premiumTap } from "@/lib/premiumSpring";
import type { WorkItem, WorkItemStatus } from "@/lib/tasks/types";
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
  onSetStatus,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  task: WorkItem;
  roster: RosterMember[];
  onOpen: (taskId: string) => void;
  canComplete: boolean;
  /** Hoisted so the mutation observer lives above the row — completing filters
   *  the row out of "Open", and a row-local mutation would unmount mid-flight,
   *  dropping onSettled reconciliation. */
  onSetStatus: (taskId: string, status: WorkItemStatus) => void;
  /** Bulk-select (List view): leading checkbox column, state owned by TaskListView. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (taskId: string) => void;
}) {
  const isDone = task.status === "complete";
  const assignee = roster.find((r) => r.tmId === task.assigneeTmId);
  const locationLabel = slotCatalogLabel(task.slotKey, task.rrSide);
  const dueClass = dueBadgeClass(task.dueDate, task.status);

  const toggleDone = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canComplete) return;
    onSetStatus(task.id, isDone ? "not_started" : "complete");
  };

  return (
    <div
      className="sb-projects-row flex cursor-pointer items-center gap-3 px-3 py-2.5"
      onClick={() => onOpen(task.id)}
    >
      {selectable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? `Deselect task: ${task.title}` : `Select task: ${task.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.(task.id);
          }}
          className="-my-2 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <span className="sb-projects-checkbox" data-selected={selected}>
            {selected && <Check size={13} strokeWidth={3} color="white" />}
          </span>
        </button>
      )}

      <motion.button
        type="button"
        onClick={toggleDone}
        whileTap={canComplete ? premiumTap.whileTap : {}}
        disabled={!canComplete}
        className="sb-projects-checkbox-hit sb-touch-target shrink-0"
        aria-label={isDone ? "Mark not done" : "Mark done"}
      >
        <span className="sb-projects-checkbox" data-done={isDone}>
          {isDone && <Check size={13} strokeWidth={3} color="white" />}
        </span>
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
        <div className="flex items-center gap-2 text-[10.5px] text-[var(--ios-label-tertiary)]">
          {locationLabel && (
            <span className="inline-flex items-center gap-0.5 text-[var(--sb-projects-accent)]">
              <MapPin size={9} strokeWidth={2.4} />
              {locationLabel}
            </span>
          )}
          {task.category && <span className="capitalize">{task.category.replace("_", " ")}</span>}
        </div>
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
