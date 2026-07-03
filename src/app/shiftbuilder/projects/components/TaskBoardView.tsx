"use client";

import React from "react";
import { DndContext, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import type { WorkItem, WorkItemStatus } from "@/lib/tasks/types";
import type { RosterMember } from "../hooks/useProjectsData";
import { OpsTaskCard } from "./OpsTaskCard";
import { useUpdateTask } from "../hooks/useTaskMutations";

const COLUMNS: { status: WorkItemStatus; label: string }[] = [
  { status: "not_started", label: "Not Started" },
  { status: "in_progress", label: "In Progress" },
  { status: "blocked", label: "Blocked" },
  { status: "complete", label: "Done" },
];

function Column({
  status,
  label,
  tasks,
  roster,
  onOpen,
}: {
  status: WorkItemStatus;
  label: string;
  tasks: WorkItem[];
  roster: RosterMember[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { status } });
  return (
    <div
      ref={setNodeRef}
      className="flex min-w-[220px] flex-1 flex-col gap-2 rounded-xl p-2"
      style={{
        background: isOver ? "var(--sb-projects-accent-tint)" : "var(--ios-gray-6)",
        outline: isOver ? "1.5px solid var(--sb-projects-accent)" : "1.5px solid transparent",
      }}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--ios-label-secondary)]">
          {label}
        </span>
        <span className="text-[10.5px] tabular-nums text-[var(--ios-label-quaternary)]">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {tasks.map((t) => (
          <OpsTaskCard key={t.id} task={t} roster={roster} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

export function TaskBoardView({
  tasks,
  roster,
  onOpen,
}: {
  tasks: WorkItem[];
  roster: RosterMember[];
  onOpen: (id: string) => void;
}) {
  const updateTask = useUpdateTask();
  const open = tasks.filter((t) => t.status !== "cancelled" && t.status !== "on_hold");

  const handleDragEnd = (event: DragEndEvent) => {
    const taskId = (event.active.data.current as { taskId?: string } | undefined)?.taskId;
    const status = (event.over?.data.current as { status?: WorkItemStatus } | undefined)?.status;
    if (!taskId || !status) return;
    updateTask.mutate({ taskId, patch: { status } });
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-2.5 overflow-x-auto pb-2">
        {COLUMNS.map((c) => (
          <Column
            key={c.status}
            status={c.status}
            label={c.label}
            tasks={open.filter((t) => t.status === c.status)}
            roster={roster}
            onOpen={onOpen}
          />
        ))}
      </div>
    </DndContext>
  );
}
