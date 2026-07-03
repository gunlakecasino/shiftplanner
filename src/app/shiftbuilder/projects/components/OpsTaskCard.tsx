"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { User, Repeat } from "lucide-react";
import type { WorkItem } from "@/lib/tasks/types";
import type { RosterMember } from "../hooks/useProjectsData";
import { dueBadgeClass } from "./OpsTaskRow";
import { tonightDateISO } from "@/lib/shiftbuilder/tasksAdapter";

const PRIORITY_COLOR: Record<string, string> = {
  low: "var(--ios-label-quaternary)",
  normal: "var(--ios-label-tertiary)",
  high: "#ff9500",
  urgent: "var(--sb-projects-overdue)",
};

export function OpsTaskCard({
  task,
  roster,
  onOpen,
}: {
  task: WorkItem;
  roster: RosterMember[];
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `board-task:${task.id}`,
    data: { type: "board-task", taskId: task.id },
  });
  const assignee = roster.find((r) => r.tmId === task.assigneeTmId);
  const dueClass = dueBadgeClass(task.dueDate, task.status);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(task.id)}
      className="sb-projects-card cursor-pointer touch-none select-none px-2.5 py-2"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <div className="flex items-start gap-1.5">
        <span
          className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: PRIORITY_COLOR[task.priority] }}
        />
        <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-[var(--ios-label)]">
          {task.title}
        </span>
        {task.workType === "recurring" && (
          <Repeat size={11} className="mt-0.5 shrink-0 text-[var(--sb-projects-accent)]" />
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-1 pl-3">
        {assignee ? (
          <span className="flex items-center gap-1 text-[10.5px] text-[var(--ios-label-tertiary)]">
            <User size={10} /> {assignee.name}
          </span>
        ) : (
          <span />
        )}
        {task.dueDate && (
          <span className={`text-[10.5px] tabular-nums ${dueClass || "text-[var(--ios-label-quaternary)]"}`}>
            {task.dueDate === tonightDateISO() ? "Tonight" : task.dueDate}
          </span>
        )}
      </div>
    </div>
  );
}
