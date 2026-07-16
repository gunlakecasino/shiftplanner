"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import type { WorkItem, WorkItemStatus } from "@/lib/tasks/types";
import { STATUS_REQUIRES_REASON } from "@/lib/tasks/types";
import type { RosterMember } from "../hooks/useProjectsData";
import { OpsTaskCard } from "./OpsTaskCard";

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
  onSetStatus,
}: {
  tasks: WorkItem[];
  roster: RosterMember[];
  onOpen: (id: string) => void;
  onSetStatus: (taskId: string, status: WorkItemStatus, statusReason?: string) => void;
}) {
  const open = tasks.filter((t) => t.status !== "cancelled" && t.status !== "on_hold");
  // A drop onto Blocked (or any reason-required column) can't commit until the
  // operator gives a reason — the API rejects a reasonless block. Hold it here.
  const [pendingReason, setPendingReason] = useState<{ taskId: string; status: WorkItemStatus } | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");

  const handleDragEnd = (event: DragEndEvent) => {
    const taskId = (event.active.data.current as { taskId?: string } | undefined)?.taskId;
    const status = (event.over?.data.current as { status?: WorkItemStatus } | undefined)?.status;
    if (!taskId || !status) return;
    if (tasks.find((task) => task.id === taskId)?.status === status) return;
    if (STATUS_REQUIRES_REASON.has(status)) {
      setPendingReason({ taskId, status });
      setReasonDraft("");
      return;
    }
    onSetStatus(taskId, status);
  };

  const confirmReason = () => {
    if (!pendingReason) return;
    const reason = reasonDraft.trim();
    if (!reason) return;
    onSetStatus(pendingReason.taskId, pendingReason.status, reason);
    setPendingReason(null);
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

      {pendingReason && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/20"
          onClick={() => setPendingReason(null)}
          style={{ backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
        >
          <div
            className="sb-projects-card w-[320px] p-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-status-reason-title"
          >
            <p id="task-status-reason-title" className="mb-2 text-[12.5px] font-semibold text-[var(--ios-label)]">
              Why is this {pendingReason.status}?
            </p>
            <input
              autoFocus
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmReason();
                if (e.key === "Escape") setPendingReason(null);
              }}
              placeholder="Reason…"
              className="h-8 w-full rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 text-[12.5px] outline-none focus:border-[var(--sb-projects-accent)]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingReason(null)}
                className="rounded-md px-2.5 py-1 text-[11.5px] text-[var(--ios-label-secondary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReason}
                disabled={!reasonDraft.trim()}
                className="rounded-md bg-[var(--sb-projects-accent)] px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-40"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </DndContext>
  );
}
