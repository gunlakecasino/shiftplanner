"use client";

/**
 * Board request pop-up (owner-scoped intake). Shown to operators with
 * canRequestTasks. Submit a task/project request and manage your OWN submissions
 * (edit / withdraw, any time). Everything routes through the requests API, which
 * enforces created_by_user_id = you. Requests land pending a manager's approval;
 * a status chip shows Pending / Approved / Rejected (+ the manager's note).
 */

import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X, Pencil, Trash2, Send, Inbox } from "lucide-react";
import { useConfirm } from "./ConfirmDialog";
import {
  useMyRequests,
  useCreateRequest,
  useUpdateRequest,
  useWithdrawRequest,
} from "../projects/hooks/useRequestsData";
import { WORK_ITEM_CATEGORIES, WORK_ITEM_PRIORITIES, type WorkItem } from "@/lib/tasks/types";

const inputClass = "w-full rounded-xl border px-3 py-2 text-sm bg-transparent";

function titleCase(s: string): string {
  return s.replace(/(^|_)([a-z])/g, (_m, _p, c) => (_p ? " " : "") + c.toUpperCase());
}

function ApprovalChip({ item }: { item: WorkItem }) {
  const map: Record<WorkItem["approvalState"], { label: string; cls: string }> = {
    pending: { label: "Pending review", cls: "bg-zinc-400/15 text-zinc-600 dark:text-zinc-300" },
    approved: { label: "Approved", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    rejected: { label: "Rejected", cls: "bg-red-500/15 text-red-600 dark:text-red-300" },
  };
  const m = map[item.approvalState] ?? map.pending;
  return <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", m.cls)}>{m.label}</span>;
}

function RequestRow({ item, isDark }: { item: WorkItem; isDark: boolean }) {
  const confirm = useConfirm();
  const updateRequest = useUpdateRequest();
  const withdrawRequest = useWithdrawRequest();
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(item.title);
  const [description, setDescription] = React.useState(item.description ?? "");
  const [priority, setPriority] = React.useState(item.priority);
  const [dueDate, setDueDate] = React.useState(item.dueDate ?? "");
  const [err, setErr] = React.useState<string | null>(null);
  const beginEdit = () => {
    setTitle(item.title);
    setDescription(item.description ?? "");
    setPriority(item.priority);
    setDueDate(item.dueDate ?? "");
    setErr(null);
    setEditing(true);
  };

  const save = () => {
    if (!title.trim()) {
      setErr("Title can't be empty");
      return;
    }
    updateRequest.mutate(
      {
        id: item.id,
        patch: {
          title: title.trim(),
          description: description.trim() || null,
          priority,
          dueDate: dueDate || null,
        },
      },
      {
        onSuccess: () => setEditing(false),
        onError: (e: unknown) => setErr(e instanceof Error ? e.message : "Save failed"),
      },
    );
  };

  const withdraw = async () => {
    const ok = await confirm("It will be removed from your requests and the manager queue.", {
      title: `Withdraw "${item.title}"?`,
      confirmLabel: "Withdraw",
      tone: "danger",
    });
    if (!ok) return;
    withdrawRequest.mutate(item.id);
  };

  const cardCls = cn(
    "rounded-xl border px-3 py-2.5",
    isDark ? "border-white/10 bg-white/[0.03]" : "border-black/10 bg-black/[0.02]",
  );

  if (editing) {
    return (
      <div className={cardCls}>
        <input className={cn(inputClass, "mb-2")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <textarea
          className={cn(inputClass, "mb-2 resize-none")}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Details (optional)"
        />
        <div className="flex gap-2 mb-2">
          <select className={cn(inputClass, "flex-1")} value={priority} onChange={(e) => setPriority(e.target.value as WorkItem["priority"])}>
            {WORK_ITEM_PRIORITIES.map((p) => (
              <option key={p} value={p}>{titleCase(p)}</option>
            ))}
          </select>
          <input type="date" className={cn(inputClass, "flex-1")} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        {err && <p className="text-[12px] text-red-600 dark:text-red-400 mb-2">{err}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={updateRequest.isPending}
            className="flex-1 py-2 rounded-lg bg-[#007AFF] text-white text-sm font-medium disabled:opacity-50"
          >
            {updateRequest.isPending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg border text-sm">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{item.title}</span>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded", isDark ? "bg-white/10" : "bg-black/5")}>
              {item.workType === "project" ? "Project" : "Task"}
            </span>
            <ApprovalChip item={item} />
          </div>
          {item.description && (
            <p className={cn("text-[12px] mt-1 line-clamp-2", isDark ? "text-zinc-400" : "text-[#6C6C72]")}>
              {item.description}
            </p>
          )}
          {item.approvalState === "rejected" && item.approvalNote && (
            <p className="text-[12px] mt-1 text-red-600 dark:text-red-400">
              Manager: {item.approvalNote}
            </p>
          )}
          {item.dueDate && (
            <p className={cn("text-[11px] mt-1", isDark ? "text-zinc-500" : "text-[#8E8E93]")}>Requested for {item.dueDate}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={beginEdit} title="Edit" className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10">
            <Pencil size={14} />
          </button>
          <button type="button" onClick={() => void withdraw()} title="Withdraw" className="p-1.5 rounded-lg text-red-600 hover:bg-red-500/10">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function RequestBoardModal({
  open,
  onClose,
  isDark = false,
}: {
  open: boolean;
  onClose: () => void;
  isDark?: boolean;
}) {
  const { data: requests = [], isLoading } = useMyRequests(open);
  const createRequest = useCreateRequest();

  const [workType, setWorkType] = React.useState<"task" | "project">("task");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState("normal");
  const [category, setCategory] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  const dialogTitleId = React.useId();
  const dialogDescriptionId = React.useId();
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => titleInputRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [open]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("normal");
    setCategory("");
    setDueDate("");
    setErr(null);
  };

  const submit = () => {
    if (!title.trim()) {
      setErr("Give your request a title");
      return;
    }
    createRequest.mutate(
      {
        workType,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        category: category || null,
        dueDate: dueDate || null,
      },
      {
        onSuccess: () => reset(),
        onError: (e: unknown) => setErr(e instanceof Error ? e.message : "Could not submit request"),
      },
    );
  };

  if (!open) return null;
  // Portal to <body>: the board renders inside a transformed/scaled viewport, and
  // position:fixed anchors to a transformed ancestor rather than the viewport —
  // portaling out is what keeps the overlay truly centered (matches the app's
  // other board overlays, e.g. RotationHealthFloater / EngineRunningOverlay).
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10045] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      style={{ WebkitBackdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescriptionId}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl",
          isDark ? "bg-[#111113] border-white/10 text-white" : "bg-white border-black/10 text-[#1C1C1E]",
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <div id={dialogTitleId} className="text-lg font-semibold">Request Work</div>
            <p id={dialogDescriptionId} className={cn("text-[13px]", isDark ? "text-zinc-400" : "text-[#6C6C72]")}>
              Submit a task or project for the team. A manager reviews it before it goes live.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close request work" className="sb-tablet-touch-target p-1 -m-1 text-xl leading-none">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 pb-2 space-y-4">
          {/* New request form */}
          <div className={cn("rounded-xl border p-3", isDark ? "border-white/10" : "border-black/10")}>
            <div className="flex gap-2 mb-2">
              {(["task", "project"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setWorkType(t)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-sm font-medium border",
                    workType === t
                      ? "bg-[#007AFF] text-white border-transparent"
                      : isDark
                        ? "border-white/10 hover:bg-white/5"
                        : "border-black/10 hover:bg-black/5",
                  )}
                >
                  {t === "task" ? "Task" : "Project"}
                </button>
              ))}
            </div>
            <input
              ref={titleInputRef}
              aria-label="Request title"
              className={cn(inputClass, "mb-2")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={workType === "task" ? "What needs doing?" : "Project name"}
            />
            <textarea
              aria-label="Request details"
              className={cn(inputClass, "mb-2 resize-none")}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details (optional)"
            />
            <div className="flex gap-2 mb-2">
              <select aria-label="Request priority" className={cn(inputClass, "flex-1")} value={priority} onChange={(e) => setPriority(e.target.value)}>
                {WORK_ITEM_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{titleCase(p)}</option>
                ))}
              </select>
              <select aria-label="Request category" className={cn(inputClass, "flex-1")} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Category…</option>
                {WORK_ITEM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{titleCase(c)}</option>
                ))}
              </select>
            </div>
            <input
              type="date"
              className={cn(inputClass, "mb-2")}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Requested by date"
            />
            {err && <p className="text-[12px] text-red-600 dark:text-red-400 mb-2">{err}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={createRequest.isPending}
              className="w-full py-2.5 rounded-xl bg-[#007AFF] text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Send size={14} />
              {createRequest.isPending ? "Submitting…" : "Submit request"}
            </button>
          </div>

          {/* My requests */}
          <div>
            <div className={cn("text-[11px] uppercase tracking-wider mb-2", isDark ? "text-zinc-500" : "text-[#8E8E93]")}>
              My requests
            </div>
            {isLoading ? (
              <p className={cn("text-[13px] py-6 text-center", isDark ? "text-zinc-500" : "text-[#8E8E93]")}>Loading…</p>
            ) : requests.length === 0 ? (
              <div className={cn("flex flex-col items-center gap-2 py-8 text-center", isDark ? "text-zinc-500" : "text-[#8E8E93]")}>
                <Inbox size={22} />
                <p className="text-[13px]">No requests yet. Submit one above.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {requests.map((r) => (
                  <RequestRow key={r.id} item={r} isDark={isDark} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={cn("p-4 border-t", isDark ? "border-white/10" : "border-black/10")}>
          <button type="button" onClick={onClose} className="w-full py-2 rounded-xl border text-sm">
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
