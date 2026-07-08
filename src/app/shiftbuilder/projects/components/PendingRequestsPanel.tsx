"use client";

/**
 * Manager triage queue — surfaces pending task/project requests on the Projects
 * page. Approve moves a request into the normal flow; reject records a note the
 * requester sees. Rendered only for canManageTasks operators.
 */

import React from "react";
import { Check, X, Inbox, ChevronDown } from "lucide-react";
import { usePendingRequests, useDecideRequest } from "../hooks/useRequestsData";
import type { WorkItem } from "@/lib/tasks/types";

function PendingRow({ item }: { item: WorkItem }) {
  const decide = useDecideRequest();
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");

  const approve = () => decide.mutate({ id: item.id, decision: "approve" });
  const reject = () => {
    decide.mutate(
      { id: item.id, decision: "reject", note: note.trim() || undefined },
      { onSuccess: () => setRejecting(false) },
    );
  };

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--ios-separator, rgba(0,0,0,0.1))" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[13px] truncate">{item.title}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10">
              {item.workType === "project" ? "Project" : "Task"}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10">{item.priority}</span>
          </div>
          {item.description && <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
          <p className="text-[11px] text-muted-foreground mt-1">
            Requested by {item.createdByName ?? "—"}
            {item.dueDate ? ` · for ${item.dueDate}` : ""}
          </p>
        </div>
        {!rejecting && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={approve}
              disabled={decide.isPending}
              title="Approve"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-white disabled:opacity-50"
              style={{ background: "var(--sb-projects-accent, #30b0c7)" }}
            >
              <Check size={13} /> Approve
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              disabled={decide.isPending}
              title="Reject"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border border-red-500/30 text-red-600 hover:bg-red-500/5 disabled:opacity-50"
            >
              <X size={13} /> Reject
            </button>
          </div>
        )}
      </div>

      {rejecting && (
        <div className="mt-2 flex items-center gap-2">
          <input
            className="flex-1 rounded-lg border px-3 py-1.5 text-[12px] bg-transparent"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason (optional) — shown to the requester"
            autoFocus
          />
          <button
            type="button"
            onClick={reject}
            disabled={decide.isPending}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-red-600 text-white disabled:opacity-50"
          >
            {decide.isPending ? "…" : "Confirm reject"}
          </button>
          <button type="button" onClick={() => setRejecting(false)} className="px-3 py-1.5 rounded-lg text-[12px] border">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function PendingRequestsPanel({ canManage }: { canManage: boolean }) {
  const { data: requests = [] } = usePendingRequests(canManage);
  const [open, setOpen] = React.useState(true);

  if (!canManage || requests.length === 0) return null;

  return (
    <div
      className="rounded-2xl border p-3"
      style={{ background: "var(--ios-background-secondary)", borderColor: "var(--sb-projects-accent, #30b0c7)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--sb-projects-accent, #30b0c7)" }}>
          <Inbox size={15} />
          Pending Requests
          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--sb-projects-accent, #30b0c7)", color: "white" }}>
            {requests.length}
          </span>
        </span>
        <ChevronDown size={16} className={open ? "" : "-rotate-90"} style={{ transition: "transform 150ms" }} />
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {requests.map((r) => (
            <PendingRow key={r.id} item={r} />
          ))}
        </div>
      )}
    </div>
  );
}
