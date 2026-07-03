"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Check, Plus, Trash2, Repeat } from "lucide-react";
import { premiumTap } from "@/lib/premiumSpring";
import { useTaskDetail, useRoster, type ProjectWithCounts } from "../hooks/useProjectsData";
import {
  useAddChecklistItem,
  useAddComment,
  useArchiveTask,
  useGenerateNextOccurrence,
  useToggleChecklistItem,
  useUpdateTask,
} from "../hooks/useTaskMutations";
import {
  STATUS_REQUIRES_REASON,
  WORK_ITEM_CATEGORIES,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
  type WorkItemStatus,
} from "@/lib/tasks/types";

const STATUS_LABEL: Record<WorkItemStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  blocked: "Blocked",
  on_hold: "On Hold",
  complete: "Complete",
  cancelled: "Cancelled",
};

export function TaskDetailContent({
  taskId,
  projects,
  canManage,
  canComplete,
  onClose,
}: {
  taskId: string;
  projects: ProjectWithCounts[];
  canManage: boolean;
  canComplete: boolean;
  onClose: () => void;
}) {
  const { data: task, isLoading } = useTaskDetail(taskId);
  const { data: roster } = useRoster();
  const updateTask = useUpdateTask();
  const archiveTask = useArchiveTask();
  const generateNext = useGenerateNextOccurrence();
  const addComment = useAddComment(taskId);
  const addChecklistItem = useAddChecklistItem(taskId);
  const toggleChecklistItem = useToggleChecklistItem(taskId);

  const [titleDraft, setTitleDraft] = useState("");
  const [loadedTaskId, setLoadedTaskId] = useState<string | null>(null);
  const [pendingReasonStatus, setPendingReasonStatus] = useState<WorkItemStatus | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [checklistDraft, setChecklistDraft] = useState("");

  // Adjust local draft when the loaded task changes — done during render
  // (React's recommended pattern for "state derived from a prop change"),
  // not in an effect, which would cause an extra cascading render.
  if (task && task.id !== loadedTaskId) {
    setLoadedTaskId(task.id);
    setTitleDraft(task.title);
  }

  if (isLoading || !task) {
    return <div className="p-4 text-[12px] text-[var(--ios-label-tertiary)]">Loading…</div>;
  }

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      updateTask.mutate({ taskId, patch: { title: trimmed } });
    }
  };

  const changeStatus = (status: WorkItemStatus) => {
    if (status === task.status) return;
    if (STATUS_REQUIRES_REASON.has(status)) {
      setPendingReasonStatus(status);
      setReasonDraft("");
      return;
    }
    updateTask.mutate({ taskId, patch: { status } });
  };

  const confirmReasonedStatus = () => {
    if (!pendingReasonStatus) return;
    const reason = reasonDraft.trim();
    if (!reason) return;
    updateTask.mutate({ taskId, patch: { status: pendingReasonStatus, statusReason: reason } });
    setPendingReasonStatus(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--sb-settings-border-subtle)] px-4 py-3">
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          disabled={!canManage}
          className="w-full bg-transparent text-[16px] font-semibold outline-none disabled:opacity-90"
        />
        {task.workType === "recurring" && (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--sb-projects-accent)]">
            <Repeat size={12} />
            Recurring — next due {task.nextDueDate ?? "—"}
            {canManage && (
              <button
                type="button"
                onClick={() => generateNext.mutate(taskId)}
                disabled={generateNext.isPending}
                className="ml-1 rounded border border-[var(--sb-projects-accent-border)] px-1.5 py-0.5 font-medium"
              >
                {generateNext.isPending ? "Generating…" : "Generate next occurrence"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {/* Status */}
        <div>
          <Label>Status</Label>
          <div className="flex flex-wrap gap-1.5">
            {WORK_ITEM_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => changeStatus(s)}
                disabled={!canManage && !canComplete}
                className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40"
                style={{
                  background: task.status === s ? "var(--sb-projects-accent)" : "var(--ios-gray-6)",
                  color: task.status === s ? "white" : "var(--ios-label-secondary)",
                }}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {pendingReasonStatus && (
            <div className="mt-2 flex items-center gap-1.5">
              <input
                autoFocus
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmReasonedStatus()}
                placeholder={`Why is this ${STATUS_LABEL[pendingReasonStatus].toLowerCase()}?`}
                className="h-7 flex-1 rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 text-[11.5px] outline-none focus:border-[var(--sb-projects-accent)]"
              />
              <button
                type="button"
                onClick={confirmReasonedStatus}
                disabled={!reasonDraft.trim()}
                className="rounded-md bg-[var(--sb-projects-accent)] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                Confirm
              </button>
            </div>
          )}
          {task.status === "blocked" && task.blockerNote && !pendingReasonStatus && (
            <p className="mt-1.5 text-[11px] text-[var(--sb-projects-overdue)]">Blocked: {task.blockerNote}</p>
          )}
          {task.status === "cancelled" && task.cancelReason && !pendingReasonStatus && (
            <p className="mt-1.5 text-[11px] text-[var(--ios-label-tertiary)]">Cancelled: {task.cancelReason}</p>
          )}
        </div>

        {/* Priority / Category */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Priority</Label>
            <select
              value={task.priority}
              disabled={!canManage}
              onChange={(e) => updateTask.mutate({ taskId, patch: { priority: e.target.value } })}
              className="w-full rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 text-[12.5px] outline-none disabled:opacity-60"
            >
              {WORK_ITEM_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Category</Label>
            <select
              value={task.category ?? ""}
              disabled={!canManage}
              onChange={(e) => updateTask.mutate({ taskId, patch: { category: e.target.value || null } })}
              className="w-full rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 text-[12.5px] outline-none disabled:opacity-60"
            >
              <option value="">—</option>
              {WORK_ITEM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Assignee / Project */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Assignee</Label>
            <select
              value={task.assigneeTmId ?? ""}
              disabled={!canManage}
              onChange={(e) => updateTask.mutate({ taskId, patch: { assigneeTmId: e.target.value || null } })}
              className="w-full rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 text-[12.5px] outline-none disabled:opacity-60"
            >
              <option value="">Unassigned</option>
              {(roster ?? []).map((tm) => (
                <option key={tm.tmId} value={tm.tmId}>
                  {tm.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Project</Label>
            <select
              value={task.projectId ?? ""}
              disabled={!canManage}
              onChange={(e) => updateTask.mutate({ taskId, patch: { projectId: e.target.value || null } })}
              className="w-full rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 text-[12.5px] outline-none disabled:opacity-60"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Due date */}
        <div>
          <Label>Due date</Label>
          <input
            type="date"
            value={task.dueDate ?? ""}
            disabled={!canManage}
            onChange={(e) => updateTask.mutate({ taskId, patch: { dueDate: e.target.value || null } })}
            className="w-full rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 text-[12.5px] outline-none disabled:opacity-60"
          />
        </div>

        {/* Description */}
        <div>
          <Label>Description</Label>
          <textarea
            defaultValue={task.description ?? ""}
            disabled={!canManage}
            onBlur={(e) => {
              if (e.target.value !== (task.description ?? "")) {
                updateTask.mutate({ taskId, patch: { description: e.target.value || null } });
              }
            }}
            rows={3}
            placeholder="Add detail…"
            className="w-full resize-none rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 py-1.5 text-[12.5px] outline-none disabled:opacity-60"
          />
        </div>

        {/* Checklist */}
        <div>
          <Label>Checklist</Label>
          <div className="space-y-1">
            {task.checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <motion.button
                  type="button"
                  whileTap={premiumTap.whileTap}
                  onClick={() => toggleChecklistItem.mutate({ itemId: item.id, isDone: !item.isDone })}
                  className="sb-projects-checkbox shrink-0"
                  data-done={item.isDone}
                  style={{ width: 16, height: 16, minWidth: 16 }}
                >
                  {item.isDone && <Check size={10} strokeWidth={3} color="white" />}
                </motion.button>
                <span
                  className="text-[12px]"
                  style={{
                    color: item.isDone ? "var(--ios-label-tertiary)" : "var(--ios-label)",
                    textDecoration: item.isDone ? "line-through" : "none",
                  }}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
          {canManage && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                value={checklistDraft}
                onChange={(e) => setChecklistDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && checklistDraft.trim()) {
                    addChecklistItem.mutate(checklistDraft.trim());
                    setChecklistDraft("");
                  }
                }}
                placeholder="Add checklist item…"
                className="h-7 flex-1 rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 text-[11.5px] outline-none"
              />
              <Plus size={14} className="text-[var(--ios-label-tertiary)]" />
            </div>
          )}
        </div>

        {/* Comments */}
        <div>
          <Label>Comments</Label>
          <div className="space-y-2">
            {task.comments.map((c) => (
              <div key={c.id} className="rounded-md bg-[var(--ios-gray-6)] px-2 py-1.5">
                <div className="flex items-center justify-between text-[10px] text-[var(--ios-label-tertiary)]">
                  <span>{c.authorName ?? "Operator"}</span>
                  <span>{new Date(c.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-[var(--ios-label)]">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && commentDraft.trim()) {
                  addComment.mutate(commentDraft.trim());
                  setCommentDraft("");
                }
              }}
              placeholder="Leave a note for the next shift…"
              className="h-7 flex-1 rounded-md border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] px-2 text-[11.5px] outline-none"
            />
          </div>
        </div>

        {/* Activity */}
        <div>
          <Label>Activity</Label>
          <div className="space-y-1">
            {task.activity.map((a) => (
              <div key={a.id} className="text-[10.5px] text-[var(--ios-label-tertiary)]">
                <span className="font-medium text-[var(--ios-label-secondary)]">{a.changedByName ?? "Operator"}</span>{" "}
                {a.fromStatus ? `${STATUS_LABEL[a.fromStatus]} → ` : ""}
                {STATUS_LABEL[a.toStatus]}
                {a.note ? ` — ${a.note}` : ""}
                <span className="ml-1.5 opacity-70">
                  {new Date(a.changedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {canManage && (
        <div className="border-t border-[var(--sb-settings-border-subtle)] px-4 py-2.5">
          <button
            type="button"
            onClick={() => {
              archiveTask.mutate(taskId);
              onClose();
            }}
            className="flex items-center gap-1.5 text-[11.5px] text-[var(--sb-projects-overdue)] opacity-80 hover:opacity-100"
          >
            <Trash2 size={13} /> Archive task
          </button>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--ios-label-tertiary)]">
      {children}
    </div>
  );
}
